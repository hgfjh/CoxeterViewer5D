/**
 * Tree-gauged boundary rows of the rank-two Davis cells, for a range of rows
 * that starts on a hash-chunk boundary.  Rows are numbered type by type and,
 * within a type, by increasing cell root, exactly as
 * oracle.forEachRankTwoCellPacked visits them.  Every chunk digest depends
 * only on its own rows, so ranges can be computed on any thread and the
 * digests concatenated in row order.
 */
import { sha256Hex } from "../utils/canonicalSha256";
import {
  createPairCellScratch,
  walkPairCell,
  type PairUnionTables,
} from "./wallUnionKernel";

/** Consecutive cells of one rank-two type. */
export interface BoundaryRowSegment {
  typeId: string;
  /** Cell id prefix; the id of the cell rooted at q is `${idPrefix}${q}`. */
  idPrefix: string;
  left: number;
  right: number;
  relation: number;
  /** Window of the type's orbit-minimum bitset, from global word firstWord. */
  rootBits: Uint32Array;
  firstWord: number;
  /** Roots in the window to pass over before the first row of the segment. */
  skip: number;
  /** Rows in the segment. */
  take: number;
}

export interface BoundaryRowTables extends PairUnionTables {
  /** Cotree column of each geometric edge, -1 for tree edges. */
  cotreeColumnByEdge: Int32Array;
  edgeToWall: Uint32Array;
  edgeParity: Int8Array;
  /** 1 for walls that are two-sided, by wall index. */
  twoSidedWallIndex: Uint8Array;
}

export interface BoundaryRowInput extends BoundaryRowTables {
  /** Multiple of chunkSize. */
  firstRow: number;
  chunkSize: number;
  segments: BoundaryRowSegment[];
}

export type BoundaryRowResult =
  | {
      ok: true;
      rowCount: number;
      /** Generic sparse-matrix chunk digests, in chunk order. */
      genericChunkDigests: string[];
      /** Cell-labelled row chunk digests, in chunk order. */
      recordChunkDigests: string[];
      nonzeroCount: number;
      maximumAbsoluteCoefficient: number;
      duplicateBoundaryEdgeRowCount: number;
      everySignedBoundaryClosesInC0: boolean;
      everyTwoSidedWallCocycleCloses: boolean;
    }
  | { ok: false; title: string; details: string[] };

/**
 * Sparse row of a cell: sum the traversal signs per cotree column, drop
 * zeros, sort by column (at most 2m entries).
 */
export function boundaryRowEntries(
  length: number,
  edgeIndex: Uint32Array,
  traversal: (step: number) => number,
  cotreeColumnByEdge: Int32Array,
  columns: Int32Array,
  coefficients: Int32Array,
): number {
  let count = 0;
  for (let step = 0; step < length; step += 1) {
    const column = cotreeColumnByEdge[edgeIndex[step]];
    if (column < 0) continue;
    let slot = 0;
    while (slot < count && columns[slot] !== column) slot += 1;
    if (slot === count) {
      columns[count] = column;
      coefficients[count] = 0;
      count += 1;
    }
    coefficients[slot] += traversal(step);
  }
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

export function boundaryRows(input: BoundaryRowInput): BoundaryRowResult {
  const { cotreeColumnByEdge, edgeToWall, edgeParity, twoSidedWallIndex } =
    input;
  const longest = Math.max(
    4,
    ...input.segments.map((segment) => 2 * segment.relation),
  );
  const scratch = createPairCellScratch(longest);
  const { points, edgeIndex, source } = scratch;
  const traversal = (step: number) => (source[step] === 1 ? 1 : -1);
  const columns = new Int32Array(longest);
  const coefficients = new Int32Array(longest);
  const vertexPoints = new Uint32Array(2 * longest);
  const vertexSums = new Int32Array(2 * longest);
  const wallIds = new Uint32Array(longest);
  const wallSums = new Int32Array(longest);

  const genericChunkDigests: string[] = [];
  const recordChunkDigests: string[] = [];
  let nonzeroCount = 0;
  let maximumAbsoluteCoefficient = 0;
  let duplicateBoundaryEdgeRowCount = 0;
  let everySignedBoundaryClosesInC0 = true;
  let everyTwoSidedWallCocycleCloses = true;
  let row = input.firstRow;
  let genericRows = "";
  let rowRecords = "";
  let inChunk = 0;
  let firstRowOfChunk = row;
  const flush = () => {
    const chunkIndex = firstRowOfChunk / input.chunkSize;
    genericChunkDigests.push(
      sha256Hex(
        `{"chunkIndex":${chunkIndex},"firstRow":${firstRowOfChunk},"method":"canonical-explicit-sparse-integer-matrix-row-chunk","rows":[${genericRows}],"schemaVersion":1}`,
      ),
    );
    recordChunkDigests.push(
      sha256Hex(`{"chunkIndex":${chunkIndex},"records":[${rowRecords}]}`),
    );
    genericRows = "";
    rowRecords = "";
    inChunk = 0;
  };

  for (const segment of input.segments) {
    const length = 2 * segment.relation;
    let toSkip = segment.skip;
    let toTake = segment.take;
    for (
      let word = 0;
      word < segment.rootBits.length && toTake > 0;
      word += 1
    ) {
      let remaining = segment.rootBits[word];
      while (remaining !== 0 && toTake > 0) {
        const lowest = remaining & -remaining;
        remaining = (remaining ^ lowest) >>> 0;
        if (toSkip > 0) {
          toSkip -= 1;
          continue;
        }
        toTake -= 1;
        const root =
          (segment.firstWord + word) * 32 + (31 - Math.clz32(lowest));
        const failure = walkPairCell(
          input,
          segment.typeId,
          segment.left,
          segment.right,
          length,
          root,
          scratch,
        );
        if (failure) return failure;

        // Signed vertex boundary and two-sided wall cocycle sums per cell.
        let vertexCount = 0;
        let wallCount = 0;
        for (let step = 0; step < length; step += 1) {
          for (let end = 0; end < 2; end += 1) {
            const point =
              end === 0 ? points[step] : points[(step + 1) % length];
            let slot = 0;
            while (slot < vertexCount && vertexPoints[slot] !== point) {
              slot += 1;
            }
            if (slot === vertexCount) {
              vertexPoints[vertexCount] = point;
              vertexSums[vertexCount] = 0;
              vertexCount += 1;
            }
            vertexSums[slot] += end === 0 ? -1 : 1;
          }
          const edge = edgeIndex[step];
          const wall = edgeToWall[edge];
          if (twoSidedWallIndex[wall] === 1) {
            let slot = 0;
            while (slot < wallCount && wallIds[slot] !== wall) slot += 1;
            if (slot === wallCount) {
              wallIds[wallCount] = wall;
              wallSums[wallCount] = 0;
              wallCount += 1;
            }
            wallSums[slot] += edgeParity[edge] * traversal(step);
          }
        }
        for (let slot = 0; slot < vertexCount; slot += 1) {
          if (vertexSums[slot] !== 0) everySignedBoundaryClosesInC0 = false;
        }
        for (let slot = 0; slot < wallCount; slot += 1) {
          if (wallSums[slot] !== 0) everyTwoSidedWallCocycleCloses = false;
        }
        duplicate: for (let left = 0; left < length; left += 1) {
          for (let right = left + 1; right < length; right += 1) {
            if (edgeIndex[left] === edgeIndex[right]) {
              duplicateBoundaryEdgeRowCount += 1;
              break duplicate;
            }
          }
        }

        const count = boundaryRowEntries(
          length,
          edgeIndex,
          traversal,
          cotreeColumnByEdge,
          columns,
          coefficients,
        );
        nonzeroCount += count;
        let entries = "[";
        for (let index = 0; index < count; index += 1) {
          const coefficient = coefficients[index];
          const magnitude = coefficient < 0 ? -coefficient : coefficient;
          if (magnitude > maximumAbsoluteCoefficient) {
            maximumAbsoluteCoefficient = magnitude;
          }
          entries += `${index === 0 ? "" : ","}[${columns[index]},"${coefficient}"]`;
        }
        entries += "]";
        if (inChunk === 0) firstRowOfChunk = row;
        const separator = inChunk === 0 ? "" : ",";
        genericRows += `${separator}{"entries":${entries},"row":${row}}`;
        // Cell ids are "sld:cell:T<generators>:q<root>", which need no JSON
        // escaping.
        rowRecords += `${separator}{"cellId":"${segment.idPrefix}${root}","entries":${entries},"row":${row}}`;
        inChunk += 1;
        row += 1;
        if (inChunk === input.chunkSize) flush();
      }
    }
  }
  if (inChunk > 0) flush();
  return {
    ok: true,
    rowCount: row - input.firstRow,
    genericChunkDigests,
    recordChunkDigests,
    nonzeroCount,
    maximumAbsoluteCoefficient,
    duplicateBoundaryEdgeRowCount,
    everySignedBoundaryClosesInC0,
    everyTwoSidedWallCocycleCloses,
  };
}
