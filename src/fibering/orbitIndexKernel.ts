/**
 * Cell index of one maximal spherical type W_V and the types below it, as a
 * pure function of the action rows.  It runs in the oracle's own thread or in
 * a worker, so inputs and outputs are plain typed arrays and numbers.
 *
 * Universal template from the cell of point 0: BFS order, parent and
 * generator.  A free orbit of exactly |W_V| points makes the template's words
 * all |W_V| group elements, so applying it to any root yields that root's
 * whole orbit; the action is free there exactly when those images are
 * distinct.  One pass per maximal type then both indexes the cells and checks
 * freeness.
 */
export interface MaximalCellIndexInput {
  rows: readonly Uint32Array[];
  degree: number;
  hostId: string;
  hostGenerators: readonly number[];
  /** |W_V|. */
  size: number;
  /** Generators of each spherical subtype indexed together with the host. */
  subtypeGenerators: readonly (readonly number[])[];
}

export type MaximalCellIndexResult =
  | {
      ok: true;
      cells: number;
      /** Bit p set when p is the minimum point of its W_V-orbit. */
      hostBits: Uint32Array;
      /** The same for each subtype, in input order. */
      subtypeBits: Uint32Array[];
    }
  | { ok: false; title: string; details: string[] };

const UINT32_SENTINEL = 0xffff_ffff;

export function indexMaximalCells(
  input: MaximalCellIndexInput,
): MaximalCellIndexResult {
  const { rows, degree, hostId, hostGenerators, size, subtypeGenerators } =
    input;
  const notFree = (detail: string): MaximalCellIndexResult => ({
    ok: false,
    title: "Spherical action is not free",
    details: [detail],
  });
  const localOf = new Map<number, number>([[0, 0]]);
  const templatePoints = [0];
  const parent = new Int32Array(size);
  const parentGenerator = new Int32Array(size);
  for (let head = 0; head < templatePoints.length; head += 1) {
    for (let k = 0; k < hostGenerators.length; k += 1) {
      const image = rows[hostGenerators[k]][templatePoints[head]];
      if (localOf.has(image)) continue;
      if (templatePoints.length >= size) {
        return notFree(`${hostId} has an orbit larger than ${size}.`);
      }
      localOf.set(image, templatePoints.length);
      parent[templatePoints.length] = head;
      parentGenerator[templatePoints.length] = hostGenerators[k];
      templatePoints.push(image);
    }
  }
  if (templatePoints.length !== size) {
    return notFree(
      `${hostId} has an orbit of size ${templatePoints.length}; expected ${size}.`,
    );
  }
  // Coset (T-cell) id of each local element, for every subtype.
  const cosetIds = subtypeGenerators.map((generators) => {
    const ids = new Int32Array(size).fill(-1);
    let next = 0;
    for (let start = 0; start < size; start += 1) {
      if (ids[start] >= 0) continue;
      const stack = [start];
      ids[start] = next;
      while (stack.length > 0) {
        const local = stack.pop()!;
        for (const generator of generators) {
          const neighbor = localOf.get(rows[generator][templatePoints[local]])!;
          if (ids[neighbor] < 0) {
            ids[neighbor] = next;
            stack.push(neighbor);
          }
        }
      }
      next += 1;
    }
    return { ids, count: next };
  });
  const words = Math.ceil(degree / 32);
  const subtypeBits = subtypeGenerators.map(() => new Uint32Array(words));
  const hostBits = new Uint32Array(words);
  const visited = new Uint32Array(words);
  const points = new Uint32Array(size);
  const minima = new Uint32Array(
    Math.max(1, ...cosetIds.map((entry) => entry.count)),
  );
  let cells = 0;
  for (let root = 0; root < degree; root += 1) {
    if ((visited[root >>> 5] >>> (root & 31)) & 1) continue;
    // Scanning upward, an unvisited root is the minimum of its cell.
    hostBits[root >>> 5] |= 1 << (root & 31);
    visited[root >>> 5] |= 1 << (root & 31);
    points[0] = root;
    for (let local = 1; local < size; local += 1) {
      const point = rows[parentGenerator[local]][points[parent[local]]];
      if ((visited[point >>> 5] >>> (point & 31)) & 1) {
        return notFree(`${hostId} repeats a point in the orbit of q${root}.`);
      }
      visited[point >>> 5] |= 1 << (point & 31);
      points[local] = point;
    }
    cells += 1;
    for (let t = 0; t < subtypeBits.length; t += 1) {
      const { ids, count } = cosetIds[t];
      minima.fill(UINT32_SENTINEL, 0, count);
      for (let local = 0; local < size; local += 1) {
        const point = points[local];
        if (point < minima[ids[local]]) minima[ids[local]] = point;
      }
      const bits = subtypeBits[t];
      for (let c = 0; c < count; c += 1) {
        bits[minima[c] >>> 5] |= 1 << (minima[c] & 31);
      }
    }
  }
  return { ok: true, cells, hostBits, subtypeBits };
}
