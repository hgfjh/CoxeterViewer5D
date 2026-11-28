/**
 * Kernels for the record-hashing phases of the generic streamed H^1
 * preparation.  Each hashes a chunk-aligned range of records (or one wall
 * vector) as literal canonical JSON, so the digests are the ones the
 * sequential preparation computes, whichever thread runs them.
 */
import { createSha256Stream, sha256Hex } from "../utils/canonicalSha256";

function chunkRecordsDigest(chunkIndex: number, recordsJson: string): string {
  return sha256Hex(`{"chunkIndex":${chunkIndex},"records":[${recordsJson}]}`);
}

/** Tree records [point, parent, parentGenerator] for a range of points. */
export interface TreeRecordChunkInput {
  parent: Uint32Array;
  parentGenerator: Int32Array;
  /** Multiple of chunkSize. */
  firstPoint: number;
  pointCount: number;
  chunkSize: number;
}

export function treeRecordChunks(input: TreeRecordChunkInput): string[] {
  const { parent, parentGenerator, firstPoint, chunkSize } = input;
  const digests: string[] = [];
  let records = "";
  let inChunk = 0;
  const end = firstPoint + input.pointCount;
  for (let point = firstPoint; point < end; point += 1) {
    records += `${inChunk === 0 ? "" : ","}[${point},${parent[point]},${parentGenerator[point]}]`;
    inChunk += 1;
    if (inChunk === chunkSize) {
      digests.push(
        chunkRecordsDigest((point + 1 - chunkSize) / chunkSize, records),
      );
      records = "";
      inChunk = 0;
    }
  }
  if (inChunk > 0) {
    digests.push(
      chunkRecordsDigest(Math.floor((end - 1) / chunkSize), records),
    );
  }
  return digests;
}

/** Cotree column records for a range of columns. */
export interface CotreeColumnChunkInput {
  /** Edge index of each column in the range (a window, not the full table). */
  edgeIndexByColumn: Uint32Array;
  /** Multiple of chunkSize. */
  firstColumn: number;
  chunkSize: number;
  generator: Uint32Array;
  source: Uint32Array;
  target: Uint32Array;
}

export function cotreeColumnChunks(input: CotreeColumnChunkInput): string[] {
  const { edgeIndexByColumn, firstColumn, chunkSize } = input;
  const digests: string[] = [];
  let records = "";
  let inChunk = 0;
  for (let local = 0; local < edgeIndexByColumn.length; local += 1) {
    const column = firstColumn + local;
    const edgeIndex = edgeIndexByColumn[local];
    const generator = input.generator[edgeIndex];
    const sourcePoint = input.source[edgeIndex];
    const targetPoint = input.target[edgeIndex];
    // edgeStableId(g, s, t) = "bar:e:g<g>:q<s>:q<t>", which needs no JSON
    // escaping.
    records += `${inChunk === 0 ? "" : ","}{"column":${column},"edgeId":"bar:e:g${generator}:q${sourcePoint}:q${targetPoint}","edgeIndex":${edgeIndex},"generator":${generator},"sourcePoint":${sourcePoint},"targetPoint":${targetPoint}}`;
    inChunk += 1;
    if (inChunk === chunkSize) {
      digests.push(
        chunkRecordsDigest((column + 1 - chunkSize) / chunkSize, records),
      );
      records = "";
      inChunk = 0;
    }
  }
  if (inChunk > 0) {
    const lastColumn = firstColumn + edgeIndexByColumn.length - 1;
    digests.push(
      chunkRecordsDigest(Math.floor(lastColumn / chunkSize), records),
    );
  }
  return digests;
}

/** One two-sided wall's cotree vector in the BFS-tree gauge. */
export interface WallVectorInput {
  degree: number;
  reachedVertexCount: number;
  bfsOrder: Uint32Array;
  parent: Uint32Array;
  treeStepWall: Uint32Array;
  treeStepCoefficient: Int8Array;
  columnWall: Uint32Array;
  columnCoefficient: Int8Array;
  edgeIndexByCotreeColumn: Uint32Array;
  source: Uint32Array;
  target: Uint32Array;
  oracleWallIndex: number;
  wall: number;
  wallId: string;
  cotreeDigest: string;
  oracleStructureHash: string;
  treeDigest: string;
}

/**
 * The wall's tree potential (its crossings counted along the BFS tree), then
 * the period of every cotree column: potential difference plus the column's
 * own crossing.  Only the digest and the nonzero count are kept.
 */
export function wallVector(input: WallVectorInput): {
  nonzeroCount: number;
  vectorDigest: string;
} {
  const { bfsOrder, parent, oracleWallIndex, wallId } = input;
  const potential = new Float64Array(input.degree);
  for (let order = 1; order < input.reachedVertexCount; order += 1) {
    const point = bfsOrder[order];
    const value =
      potential[parent[point]] +
      (input.treeStepWall[point] === oracleWallIndex
        ? input.treeStepCoefficient[point]
        : 0);
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `The tree potential for ${wallId} is not a safe integer.`,
      );
    }
    potential[point] = value;
  }
  const digest = createSha256Stream();
  digest.update(
    `{"cotreeDigest":${JSON.stringify(input.cotreeDigest)},"entries":[`,
  );
  let pending = "";
  let nonzeroCount = 0;
  const columns = input.edgeIndexByCotreeColumn;
  for (let column = 0; column < columns.length; column += 1) {
    const edgeIndex = columns[column];
    const value =
      potential[input.source[edgeIndex]] -
      potential[input.target[edgeIndex]] +
      (input.columnWall[column] === oracleWallIndex
        ? input.columnCoefficient[column]
        : 0);
    if (!Number.isSafeInteger(value)) {
      throw new Error(`The cotree period for ${wallId} is not a safe integer.`);
    }
    if (value !== 0) {
      pending += `${nonzeroCount === 0 ? "" : ","}[${column},"${value}"]`;
      nonzeroCount += 1;
      if (pending.length > 1 << 16) {
        digest.update(pending);
        pending = "";
      }
    }
  }
  digest.update(pending);
  digest.update(
    `],"method":"lazy-tree-gauged-two-sided-wall-vector","oracleStructureHash":${JSON.stringify(input.oracleStructureHash)},"schemaVersion":1,"treeDigest":${JSON.stringify(input.treeDigest)},"wall":${input.wall},"wallId":${JSON.stringify(wallId)}}`,
  );
  return { nonzeroCount, vectorDigest: digest.digestHex() };
}
