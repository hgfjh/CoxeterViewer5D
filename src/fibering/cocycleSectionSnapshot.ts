/**
 * Compressed sparse-row snapshot of an integral cocycle section on directed
 * edges (point, generator).
 *
 * Snapshots exist so every downstream replayer sees identical data.  Holding
 * them as one JS array per directed edge cost tens of bytes per edge and hits
 * V8's array-length limits near 10^8 edges; here offsets, coordinates and
 * values live in typed arrays, with a side table only for values that are
 * not safe integers.
 */
export interface CocycleSectionSnapshot {
  /** Nonzero [coordinate, decimal value] pairs of one directed edge. */
  pairsAt(point: number, generator: number): Array<readonly [number, string]>;
  readonly nonzeroCount: number;
}

// Shared result for edges with no nonzero coordinate; frozen so no caller
// can mutate it.
const EMPTY = Object.freeze([]) as unknown as Array<readonly [number, string]>;

export function snapshotCocycleSection(
  degree: number,
  generatorCount: number,
  readEdge: (
    point: number,
    generator: number,
  ) => Iterable<readonly [number, bigint]>,
): CocycleSectionSnapshot {
  const edgeCount = degree * generatorCount;
  const offsets = new Float64Array(edgeCount + 1);
  let coordinates = new Uint32Array(Math.max(16, edgeCount));
  let values = new Float64Array(coordinates.length);
  // Values outside the safe-integer range, keyed by their slot.
  const large = new Map<number, string>();
  let used = 0;
  const grow = () => {
    const nextCoordinates = new Uint32Array(coordinates.length * 2);
    nextCoordinates.set(coordinates);
    coordinates = nextCoordinates;
    const nextValues = new Float64Array(values.length * 2);
    nextValues.set(values);
    values = nextValues;
  };
  for (let point = 0; point < degree; point += 1) {
    for (let generator = 0; generator < generatorCount; generator += 1) {
      for (const [coordinate, value] of readEdge(point, generator)) {
        if (used === coordinates.length) grow();
        coordinates[used] = coordinate;
        if (
          value >= BigInt(Number.MIN_SAFE_INTEGER) &&
          value <= BigInt(Number.MAX_SAFE_INTEGER)
        ) {
          values[used] = Number(value);
        } else {
          large.set(used, value.toString());
        }
        used += 1;
      }
      offsets[point * generatorCount + generator + 1] = used;
    }
  }
  return {
    nonzeroCount: used,
    pairsAt(point, generator) {
      const edge = point * generatorCount + generator;
      const start = offsets[edge];
      const end = offsets[edge + 1];
      if (start === end) return EMPTY;
      const pairs: Array<readonly [number, string]> = [];
      for (let slot = start; slot < end; slot += 1) {
        pairs.push([
          coordinates[slot],
          large.get(slot) ?? String(values[slot]),
        ]);
      }
      return pairs;
    },
  };
}
