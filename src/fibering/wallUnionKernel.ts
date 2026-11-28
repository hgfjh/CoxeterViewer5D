/**
 * Wall unions of the rank-two Davis cells of one dihedral type, for the cell
 * roots in a word range of the type's orbit-minimum bitset.
 *
 * Opposite edges of a 2m-gon cross the same wall, so each cell contributes m
 * parity unions.  The kernel only walks cells and reports those unions in
 * cell order; the caller applies them to its union-find in exactly that order,
 * so parity-conflict counts do not depend on how the walk was split up or
 * which thread ran it.
 */
export interface PairUnionTables {
  rows: readonly Uint32Array[];
  degree: number;
  /** offsets[g] = first edge index of generator g. */
  offsets: readonly number[];
  /** Bit p of minimumBits[g]: p < p.s_g, i.e. p indexes its g-edge. */
  minimumBits: readonly Uint32Array[];
  /** Number of set bits of minimumBits[g] before each word. */
  wordRank: readonly Uint32Array[];
  /** Bit p of sourceBits[g]: p is the stored source of its g-edge. */
  sourceBits: readonly Uint32Array[];
}

export interface PairUnionInput extends PairUnionTables {
  typeId: string;
  left: number;
  right: number;
  /** m of the dihedral type; cells are 2m-gons. */
  relation: number;
  /**
   * Window of the type's orbit-minimum bitset (one bit per cell root),
   * starting at global word `firstWord`.  A window rather than the whole
   * bitset because posting a typed array to a worker copies its entire
   * buffer.
   */
  rootBits: Uint32Array;
  firstWord: number;
}

export type PairUnionResult =
  | {
      ok: true;
      /**
       * Union records (first, second) with the required parity XOR in the
       * top bit of `second`; edge indices stay below 2^31.
       */
      unions: Uint32Array;
      count: number;
    }
  | { ok: false; title: string; details: string[] };

const PARITY_BIT = 0x8000_0000;

export function popcount32(value: number): number {
  let bits = value - ((value >>> 1) & 0x5555_5555);
  bits = (bits & 0x3333_3333) + ((bits >>> 2) & 0x3333_3333);
  return (((bits + (bits >>> 4)) & 0x0f0f_0f0f) * 0x0101_0101) >>> 24;
}

/** Geometric edge index of the generator step at `point`. */
export function packedEdgeIndex(
  tables: PairUnionTables,
  point: number,
  generator: number,
): number {
  const image = tables.rows[generator][point];
  const minimum = point < image ? point : image;
  const word = minimum >>> 5;
  const below = minimum & 31;
  return (
    tables.offsets[generator] +
    tables.wordRank[generator][word] +
    (below === 0
      ? 0
      : popcount32(
          (tables.minimumBits[generator][word] & ((1 << below) - 1)) >>> 0,
        ))
  );
}

/** Scratch for walkPairCell, sized for the longest 2m-gon. */
export interface PairCellScratch {
  points: Uint32Array;
  edgeIndex: Uint32Array;
  /** 1 when the step's point is the stored source of its edge. */
  source: Uint8Array;
}

export function createPairCellScratch(length: number): PairCellScratch {
  return {
    points: new Uint32Array(length),
    edgeIndex: new Uint32Array(length),
    source: new Uint8Array(length),
  };
}

/**
 * Walk the 2m-gon rooted at `root`, alternating left and right generator
 * steps, into `scratch`.  Returns an error record when the walk repeats a
 * point or does not close, and undefined otherwise.  This is the boundary
 * convention of the oracle's rank-two cells.
 */
export function walkPairCell(
  tables: PairUnionTables,
  typeId: string,
  left: number,
  right: number,
  length: number,
  root: number,
  scratch: PairCellScratch,
): { ok: false; title: string; details: string[] } | undefined {
  const { rows, sourceBits } = tables;
  const { points, edgeIndex, source } = scratch;
  let current = root;
  for (let boundaryIndex = 0; boundaryIndex < length; boundaryIndex += 1) {
    for (let earlier = 0; earlier < boundaryIndex; earlier += 1) {
      if (points[earlier] === current) {
        return {
          ok: false,
          title: "Degenerate rank-two boundary",
          details: [
            `${typeId} cell at q${root} repeats q${current} before closing.`,
          ],
        };
      }
    }
    const generator = boundaryIndex % 2 === 0 ? left : right;
    points[boundaryIndex] = current;
    edgeIndex[boundaryIndex] = packedEdgeIndex(tables, current, generator);
    source[boundaryIndex] =
      (sourceBits[generator][current >>> 5] >>> (current & 31)) & 1;
    current = rows[generator][current];
  }
  if (current !== root) {
    return {
      ok: false,
      title: "Incomplete rank-two boundary",
      details: [
        `${typeId} cell at q${root} does not close as a ${length}-gon.`,
      ],
    };
  }
  return undefined;
}

export function pairCellUnions(input: PairUnionInput): PairUnionResult {
  const { left, right, relation, rootBits, typeId } = input;
  const length = 2 * relation;
  const half = relation;
  const scratch = createPairCellScratch(length);
  const { edgeIndex, source } = scratch;
  let cells = 0;
  for (let word = 0; word < rootBits.length; word += 1) {
    cells += popcount32(rootBits[word]);
  }
  const unions = new Uint32Array(2 * half * cells);
  let used = 0;
  for (let word = 0; word < rootBits.length; word += 1) {
    let remaining = rootBits[word];
    while (remaining !== 0) {
      const lowest = remaining & -remaining;
      const root = (input.firstWord + word) * 32 + (31 - Math.clz32(lowest));
      remaining = (remaining ^ lowest) >>> 0;
      const failure = walkPairCell(
        input,
        typeId,
        left,
        right,
        length,
        root,
        scratch,
      );
      if (failure) return failure;
      for (let index = 0; index < half; index += 1) {
        // Traversals t = +-1 (stored source or not); the opposite edges must
        // satisfy parity XOR 0 exactly when -t_i * t_{i+half} = +1, i.e. when
        // the two traversals differ.
        const parity = source[index] === source[index + half] ? 1 : 0;
        unions[used] = edgeIndex[index];
        unions[used + 1] =
          (edgeIndex[index + half] | (parity === 1 ? PARITY_BIT : 0)) >>> 0;
        used += 2;
      }
    }
  }
  return { ok: true, unions, count: used / 2 };
}
