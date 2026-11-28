import type { Matrix, Vector } from "./linearAlgebra";
import { lorentzDot, lorentzNormalizeTimelike } from "./lorentz";

export interface ChamberBasepointDiagnostics {
  maxFacetValue: number;
  /**
   * min_i -<x,n_i>_J = sinh(hyperbolic distance from x to the nearest facet
   * hyperplane), for unit spacelike n_i and x on the upper hyperboloid.
   */
  minFacetMargin: number;
  /** Margin at the numerically maximised (approximate incentre) point. */
  incentreMargin: number;
  /** Margin a supplied basepoint must reach to be kept. */
  requiredMargin: number;
  tolerance: number;
  method: "supplied" | "incentre";
  orientedByGlobalSign: boolean;
}

export interface ChamberBasepointResult {
  ok: boolean;
  basepoint?: Vector;
  normals: Vector[];
  diagnostics?: ChamberBasepointDiagnostics;
  warnings: string[];
}

export interface ChamberBasepointOptions {
  /**
   * A supplied basepoint is kept only if its facet margin is at least this
   * fraction of the incentre margin.
   */
  suppliedMarginFraction?: number;
}

export const DEFAULT_SUPPLIED_MARGIN_FRACTION = 0.25;

/**
 * Validates or solves a chamber basepoint on the upper hyperboloid.
 *
 * The chamber convention in this project is <x,n_i>_J <= 0 for every facet
 * normal. A global normal sign is allowed because normalGram data fixes mutual
 * inner products but not the inward/outward orientation of all facets.
 *
 * Orbit drawings need x0 strictly inside the chamber, not merely in its
 * closure: if x0 lies on the mirror of s_i then w x0 = w s_i x0 and two
 * chambers are drawn at one point. So the solver always computes an
 * approximate hyperbolic incentre (the point farthest from its nearest facet
 * hyperplane) and keeps a supplied basepoint only when its own margin is at
 * least `suppliedMarginFraction` of the incentre margin.
 */
export function validateOrSolveChamberBasepoint(
  normals: Vector[],
  suppliedBasepoint?: Vector,
  tolerance = 1e-8,
  options: ChamberBasepointOptions = {},
): ChamberBasepointResult {
  const fraction =
    options.suppliedMarginFraction ?? DEFAULT_SUPPLIED_MARGIN_FRACTION;
  const supplied =
    suppliedBasepoint === undefined
      ? undefined
      : tryNormalize(suppliedBasepoint);

  // Try first the orientation in which the supplied point (if any) comes
  // closer to satisfying the chamber inequalities.
  let orientations = [false, true];
  if (supplied !== undefined) {
    const plain = maxFacetInequality(supplied, normals);
    const flipped = maxFacetInequality(supplied, negateAll(normals));
    if (flipped < plain) orientations = [true, false];
  }

  for (const orient of orientations) {
    const orientedNormals = orient
      ? negateAll(normals)
      : normals.map((normal) => [...normal]);
    const seeds = buildSeeds(orientedNormals, suppliedBasepoint)
      .map(tryNormalize)
      .filter((point): point is Vector => point !== undefined);
    const incentre = approximateIncentre(orientedNormals, seeds);
    if (incentre === undefined || incentre.margin <= tolerance) {
      continue;
    }

    // Infinite-volume chambers have no incentre (the margin is unbounded), so
    // the required margin is capped at sinh(d) = 1.
    const requiredMargin = Math.max(
      tolerance,
      fraction * Math.min(incentre.margin, 1),
    );
    const incentreText = `margin min_i -<x,n_i> = ${formatNumber(incentre.margin)}, hyperbolic distance ${formatNumber(Math.asinh(incentre.margin))} to the nearest facet`;
    const warnings: string[] = [];
    if (orient) {
      warnings.push(
        "Normals were globally reoriented so the chamber basepoint satisfies <x,n_i> <= 0.",
      );
    }

    let point = incentre.point;
    let method: ChamberBasepointDiagnostics["method"] = "incentre";
    if (supplied !== undefined && suppliedBasepoint !== undefined) {
      const suppliedMargin = minFacetMargin(supplied, orientedNormals);
      if (suppliedMargin >= requiredMargin) {
        point = supplied;
        method = "supplied";
        const norm = lorentzDot(suppliedBasepoint, suppliedBasepoint);
        if (Math.abs(norm + 1) > tolerance) {
          warnings.push(
            `geometry.basepoint was normalized from Lorentz norm ${formatNumber(norm)}.`,
          );
        }
      } else {
        warnings.push(
          `geometry.basepoint has facet margin ${formatNumber(suppliedMargin)}, below the required ${formatNumber(requiredMargin)} (${fraction} of min(incentre margin, 1)), so it lies on or near a mirror and would draw distinct chambers at (nearly) one point; it was replaced by the numerically solved approximate hyperbolic incentre (${incentreText}).`,
        );
      }
    } else {
      warnings.push(
        `geometry.basepoint was solved numerically as the approximate hyperbolic incentre (${incentreText}).`,
      );
    }

    return {
      ok: true,
      basepoint: point,
      normals: orientedNormals,
      diagnostics: {
        maxFacetValue: maxFacetInequality(point, orientedNormals),
        minFacetMargin: minFacetMargin(point, orientedNormals),
        incentreMargin: incentre.margin,
        requiredMargin,
        tolerance,
        method,
        orientedByGlobalSign: orient,
      },
      warnings,
    };
  }

  return {
    ok: false,
    normals: normals.map((normal) => [...normal]),
    warnings: [
      "Could not find a timelike chamber basepoint strictly satisfying <x,n_i> < 0 for all facets.",
    ],
  };
}

/**
 * Returns max_i <x,n_i>_J; values <= tolerance satisfy the chamber inequalities.
 */
export function maxFacetInequality(point: Vector, normals: Vector[]): number {
  return Math.max(...normals.map((normal) => lorentzDot(point, normal)));
}

/**
 * Returns min_i -<x,n_i>_J. For x on the upper hyperboloid and unit spacelike
 * n_i this is sinh of the signed distance to the nearest facet hyperplane, so
 * a positive value means x is strictly inside the chamber.
 */
export function minFacetMargin(point: Vector, normals: Vector[]): number {
  return -maxFacetInequality(point, normals);
}

/**
 * Approximate hyperbolic incentre: maximises m(x) = min_i -<x,n_i>_J over the
 * upper hyperboloid, parametrised by spatial coordinates u with
 * x = (sqrt(1+|u|^2), u).
 *
 * The non-smooth minimum is replaced by the softmin
 * -tau log sum_i exp(-m_i/tau), which underestimates m by at most
 * tau log(#facets), and is maximised by gradient ascent with backtracking as
 * tau shrinks to 1e-4. The result is an approximation, not a certified
 * incentre; callers only need a point well inside the chamber, and the
 * returned margin is evaluated exactly at the returned point.
 *
 * For a chamber of infinite volume the margin is unbounded, so the ascent is
 * confined to the hyperbolic ball of radius INCENTRE_SEARCH_RADIUS around the
 * best seed by one extra softmin term cosh(R) - cosh d(x, seed).
 */
export function approximateIncentre(
  normals: Vector[],
  seeds: Vector[],
): { point: Vector; margin: number } | undefined {
  const dimension = (normals[0]?.length ?? 1) - 1;
  if (dimension < 1) return undefined;

  const starts =
    seeds.length > 0 ? seeds : [pointFromSpatial(zeros(dimension))];
  const anchor = starts.reduce((left, right) =>
    minFacetMargin(right, normals) > minFacetMargin(left, normals)
      ? right
      : left,
  );
  // Each term is m(u) = offset + a0 x0(u) - <spatial(a), u>; for a facet
  // a = n_i and offset 0, for the search bound a = -anchor because
  // -<x, anchor> = cosh d(x, anchor).
  const terms: MarginTerm[] = [
    ...normals.map((normal) => ({ offset: 0, a: normal })),
    {
      offset: Math.cosh(INCENTRE_SEARCH_RADIUS),
      a: anchor.map((coordinate) => -coordinate),
    },
  ];
  let best: { point: Vector; margin: number } | undefined;
  for (const seed of starts) {
    let spatial = seed.slice(1);
    for (const tau of [0.1, 0.03, 0.01, 3e-3, 1e-3, 3e-4, 1e-4]) {
      spatial = softminAscent(terms, spatial, tau);
    }
    const point = pointFromSpatial(spatial);
    const margin = minFacetMargin(point, normals);
    if (best === undefined || margin > best.margin) {
      best = { point, margin };
    }
  }
  return best;
}

const INCENTRE_SEARCH_RADIUS = 3;

interface MarginTerm {
  offset: number;
  a: Vector;
}

function softminAscent(
  normals: MarginTerm[],
  start: Vector,
  tau: number,
): Vector {
  let spatial = [...start];
  let value = softminMargin(normals, spatial, tau).value;
  let step = 0.1;
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const { gradient } = softminMargin(normals, spatial, tau);
    const gradientNorm = vectorLength(gradient);
    if (gradientNorm < 1e-14) break;
    let accepted = false;
    // Steps are taken along the unit gradient direction, so the step size is
    // a coordinate length independent of the gradient's scale.
    while (step > 1e-13) {
      const trial = spatial.map(
        (coordinate, index) =>
          coordinate + (step * gradient[index]) / gradientNorm,
      );
      const trialValue = softminMargin(normals, trial, tau).value;
      if (trialValue > value) {
        spatial = trial;
        value = trialValue;
        step *= 1.5;
        accepted = true;
        break;
      }
      step *= 0.5;
    }
    if (!accepted) break;
  }
  return spatial;
}

function softminMargin(
  normals: MarginTerm[],
  spatial: Vector,
  tau: number,
): { value: number; gradient: Vector } {
  const x0 = Math.sqrt(
    1 +
      spatial.reduce((total, coordinate) => total + coordinate * coordinate, 0),
  );
  // m_i(u) = n_i0 x0(u) - <spatial(n_i), u>, and d x0 / d u = u / x0.
  const margins = normals.map(
    ({ offset, a: normal }) =>
      offset +
      normal[0] * x0 -
      spatial.reduce(
        (total, coordinate, index) => total + coordinate * normal[index + 1],
        0,
      ),
  );
  const minimum = Math.min(...margins);
  const weights = margins.map((margin) => Math.exp(-(margin - minimum) / tau));
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  const gradient = zeros(spatial.length);
  normals.forEach(({ a: normal }, facet) => {
    const weight = weights[facet] / weightTotal;
    for (let index = 0; index < spatial.length; index += 1) {
      gradient[index] +=
        weight * ((normal[0] * spatial[index]) / x0 - normal[index + 1]);
    }
  });
  return { value: minimum - tau * Math.log(weightTotal), gradient };
}

function negateAll(normals: Vector[]): Vector[] {
  return normals.map((normal) => normal.map((coordinate) => -coordinate));
}

function zeros(length: number): Vector {
  return Array.from({ length }, () => 0);
}

/**
 * Seed points for the incentre ascent: the supplied point, the normal sum
 * (both signs), a least-squares solve of <x,n_i> = -1 and a coordinate search
 * that minimises the squared violations. They only need to land in the right
 * basin; the ascent does the centring.
 */
function buildSeeds(normals: Vector[], suppliedBasepoint?: Vector): Vector[] {
  const seeds: Vector[] = [];

  if (suppliedBasepoint !== undefined) {
    seeds.push([...suppliedBasepoint]);
  }

  const sum = vectorSum(normals);
  seeds.push(sum);
  seeds.push(sum.map((coordinate) => -coordinate));

  const leastSquares = solveLeastSquaresBasepoint(normals);
  if (leastSquares !== undefined) {
    seeds.push(leastSquares);
  }

  const searched = coordinateSearchBasepoint(normals, leastSquares ?? sum);
  if (searched !== undefined) {
    seeds.push(searched);
  }

  return seeds;
}

function tryNormalize(point: Vector): Vector | undefined {
  try {
    return lorentzNormalizeTimelike(point);
  } catch {
    return undefined;
  }
}

function vectorSum(vectors: Vector[]): Vector {
  const result = Array.from({ length: vectors[0]?.length ?? 0 }, () => 0);
  for (const vector of vectors) {
    for (let index = 0; index < vector.length; index += 1) {
      result[index] += vector[index];
    }
  }
  return result;
}

function solveLeastSquaresBasepoint(normals: Vector[]): Vector | undefined {
  if (normals.length === 0) {
    return undefined;
  }

  const coordinateCount = normals[0].length;
  const covectors = normals.map((normal) =>
    normal.map((coordinate, index) => (index === 0 ? -coordinate : coordinate)),
  );
  const normalMatrix: Matrix = Array.from({ length: coordinateCount }, () =>
    Array.from({ length: coordinateCount }, () => 0),
  );
  const rightHandSide = Array.from({ length: coordinateCount }, () => 0);
  // The small ridge only stabilizes the numerical solve; it is not a
  // mathematical constraint on the chamber.
  const ridge = 1e-9;

  for (const row of covectors) {
    for (let i = 0; i < coordinateCount; i += 1) {
      rightHandSide[i] -= row[i];
      for (let j = 0; j < coordinateCount; j += 1) {
        normalMatrix[i][j] += row[i] * row[j];
      }
    }
  }

  for (let index = 0; index < coordinateCount; index += 1) {
    normalMatrix[index][index] += ridge;
  }

  return solveLinearSystem(normalMatrix, rightHandSide);
}

function coordinateSearchBasepoint(
  normals: Vector[],
  seed: Vector,
): Vector | undefined {
  const dimension = (normals[0]?.length ?? 1) - 1;
  if (dimension < 1) {
    return undefined;
  }

  let spatial = seed.slice(1);
  if (spatial.length !== dimension) {
    spatial = Array.from({ length: dimension }, () => 0);
  }

  let step = Math.max(0.25, vectorLength(spatial) || 1);
  let best = pointFromSpatial(spatial);
  let bestScore = violationScore(best, normals);

  for (let round = 0; round < 80; round += 1) {
    let improved = false;
    for (let axis = 0; axis < dimension; axis += 1) {
      for (const sign of [-1, 1]) {
        const nextSpatial = [...spatial];
        nextSpatial[axis] += sign * step;
        const point = pointFromSpatial(nextSpatial);
        const score = violationScore(point, normals);
        if (score < bestScore) {
          spatial = nextSpatial;
          best = point;
          bestScore = score;
          improved = true;
        }
      }
    }

    if (!improved) {
      step *= 0.5;
      if (step < 1e-8) {
        break;
      }
    }
  }

  return best;
}

function pointFromSpatial(spatial: Vector): Vector {
  const squared = spatial.reduce(
    (total, coordinate) => total + coordinate * coordinate,
    0,
  );
  return [Math.sqrt(1 + squared), ...spatial];
}

function violationScore(point: Vector, normals: Vector[]): number {
  return normals.reduce((total, normal) => {
    const violation = Math.max(0, lorentzDot(point, normal));
    return total + violation * violation;
  }, 0);
}

function vectorLength(vector: Vector): number {
  return Math.sqrt(
    vector.reduce((total, coordinate) => total + coordinate * coordinate, 0),
  );
}

function solveLinearSystem(
  matrix: Matrix,
  rightHandSide: Vector,
): Vector | undefined {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, rightHandSide[index]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row][pivot]) > Math.abs(augmented[pivotRow][pivot])
      ) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][pivot]) < 1e-12) {
      return undefined;
    }

    [augmented[pivot], augmented[pivotRow]] = [
      augmented[pivotRow],
      augmented[pivot],
    ];

    const scale = augmented[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot][column] /= scale;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = augmented[row][pivot];
      for (let column = pivot; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toPrecision(6) : String(value);
}
