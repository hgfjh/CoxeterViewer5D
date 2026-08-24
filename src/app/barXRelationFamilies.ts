import type {
  BarXRelationCell,
  CoverCompressionResult,
} from "../compression/types";

export type BarXFiniteRelationFamilyId = `${number}:${number}`;
export type BarXRelationFamilyId =
  | "shared-complex"
  | "all"
  | BarXFiniteRelationFamilyId;

export interface BarXRelationFamilySummary {
  id: BarXFiniteRelationFamilyId;
  generatorPair: [number, number];
  generatorLabels: [string, string];
  m: number;
  cellCount: number;
  polygonName: string;
}

/** Stable UI key for one finite Coxeter pair. */
export function barXRelationFamilyId(
  pair: readonly [number, number],
): BarXFiniteRelationFamilyId {
  const [left, right] = pair[0] < pair[1] ? pair : [pair[1], pair[0]];
  return `${left}:${right}`;
}

/** Parse a view filter; this does not validate that the pair exists in a cover. */
export function parseBarXRelationFamilyId(
  id: string,
): [number, number] | undefined {
  if (id === "all" || id === "shared-complex") return undefined;
  const match = /^(\d+):(\d+)$/.exec(id);
  if (!match) return undefined;
  const left = Number(match[1]);
  const right = Number(match[2]);
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    return undefined;
  }
  return left < right ? [left, right] : undefined;
}

/**
 * Describe the exact relation-cell families recorded by the compression
 * certificate. In a torsion-free degree-d cover, a pair of order m contributes
 * d/(2m) compressed 2m-gons; the certificate has already checked that count.
 */
export function listBarXRelationFamilies(
  cover: CoverCompressionResult,
): BarXRelationFamilySummary[] {
  return cover.certificate.pairCounts
    .map((check) => {
      const pair = check.generatorPair;
      const left = cover.barX.sourceSystem.generators[pair[0]]?.label;
      const right = cover.barX.sourceSystem.generators[pair[1]]?.label;
      return {
        id: barXRelationFamilyId(pair),
        generatorPair: pair,
        generatorLabels: [left ?? `s${pair[0]}`, right ?? `s${pair[1]}`],
        m: check.m,
        cellCount: check.actualBarRelationCells,
        polygonName: relationPolygonName(check.m, check.actualBarRelationCells),
      } satisfies BarXRelationFamilySummary;
    })
    .sort((left, right) =>
      left.generatorPair[0] === right.generatorPair[0]
        ? left.generatorPair[1] - right.generatorPair[1]
        : left.generatorPair[0] - right.generatorPair[0],
    );
}

export function relationCellMatchesFamily(
  cell: Pick<BarXRelationCell, "generatorPair">,
  pair: readonly [number, number] | undefined,
): boolean {
  return (
    pair === undefined ||
    (cell.generatorPair[0] === pair[0] && cell.generatorPair[1] === pair[1]) ||
    (cell.generatorPair[0] === pair[1] && cell.generatorPair[1] === pair[0])
  );
}

function relationPolygonName(m: number, count: number): string {
  const sides = 2 * m;
  const singular =
    sides === 4
      ? "square"
      : sides === 6
        ? "hexagon"
        : sides === 8
          ? "octagon"
          : `${sides}-gon`;
  return count === 1 ? singular : `${singular}s`;
}
