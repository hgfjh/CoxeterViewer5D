import { approximateCoxeterGramMatrix } from "../coxeter/gram";
import { simpleReflectionMatrix } from "../coxeter/reflection";
import type { CayleyEdge, CayleyNode, CoxeterSystemInput } from "../types";
import { computeHyperbolicOrbitPoints } from "./geometricMode";
import {
  type Matrix,
  type Vector,
  identityMatrix,
  matMul,
  matVec,
} from "./linearAlgebra";
import { pcaProject } from "./pca";
import { refineProjection } from "./projectionRefine";

/**
 * How the Davis view placed its vertices.
 *
 * - `hyperbolic-orbit`: rho(w) x0 for the Lorentzian reflection data,
 *   recentred at x0 and drawn by a perspective map of the hyperboloid.
 * - `tits-orbit`: rho(w) x0 for the Tits representation of a finite Coxeter
 *   group, with x0 = sum of fundamental weights (the Coxeter permutohedron).
 * - `shell-fallback`: no reflection orbit with a sensible normalisation is
 *   available; the word-length shell drawing is kept.
 */
export type OrbitLayoutKind =
  | "hyperbolic-orbit"
  | "tits-orbit"
  | "shell-fallback";

export interface OrbitLayoutOptions {
  /**
   * Offset c of the perspective map spatial(x) / (x0 + c) applied after the
   * hyperboloid is recentred at x0. c = 0 is the Klein model, c = 1 the
   * Poincare model, and c = Infinity drops x0 (the Gans / orthographic model).
   */
  perspectiveOffset?: number;
  /** World radius of the farthest vertex from the centre. */
  targetRadius?: number;
}

export interface OrbitLayoutDiagnostics {
  /** Dimension of the orbit before the linear map to R^3. */
  sourceDimension: number;
  /** True when a PCA projection R^d -> R^3 was applied (d > 3). */
  pcaProjected: boolean;
  perspectiveOffset?: number;
  /** Smallest distance between two drawn vertices (0 means a collision). */
  minVertexDistance: number;
  /** Smallest drawn edge length. */
  minEdgeLength: number;
  /** Smallest distance between two edge midpoints (generator-label anchors). */
  minEdgeMidpointDistance: number;
}

export interface OrbitLayoutResult {
  kind: OrbitLayoutKind;
  /** Undefined for `shell-fallback`: callers keep the existing positions. */
  positions?: Map<string, [number, number, number]>;
  diagnostics?: OrbitLayoutDiagnostics;
  /** One-sentence description of what the positions mean. */
  caveat: string;
  warnings: string[];
}

/**
 * Default perspective offset for hyperbolic orbits. Chosen by measuring the
 * bundled examples at radius 3-4 (see docs/exact-vs-drawing.md): every c >= 0
 * keeps rank-two cells planar and convex, and c = 3 spreads chambers far
 * better than Klein (c = 0), which piles them up near the ideal boundary.
 */
export const DEFAULT_PERSPECTIVE_OFFSET = 3;

const COLLISION_EPSILON = 1e-9;

/**
 * Places the vertices of a Cayley ball by a reflection orbit, for the Davis
 * view.
 *
 * Incidence (which vertices bound which edge and 2m-gon) is exact; the
 * coordinates are a drawing derived from the orbit. Every map applied after
 * the orbit is either a linear map of the ambient vector space (Lorentz boost,
 * PCA, Cholesky coordinates) or a central projection from a point outside the
 * future cone, so each rank-two orbit {w <s_i,s_j> x0}, which lies on a
 * conic in an affine 2-plane, is still drawn as a planar convex 2m-gon (or,
 * after PCA, possibly a degenerate flat one).
 */
export function computeOrbitLayout(
  system: CoxeterSystemInput,
  nodes: CayleyNode[],
  edges: CayleyEdge[],
  options: OrbitLayoutOptions = {},
): OrbitLayoutResult {
  const maxLength = Math.max(1, ...nodes.map((node) => node.length));
  const targetRadius = options.targetRadius ?? 1.25 * maxLength;
  const warnings: string[] = [];

  if (system.geometry !== undefined) {
    const offset = options.perspectiveOffset ?? DEFAULT_PERSPECTIVE_OFFSET;
    const orbit = computeHyperbolicOrbitPoints(system, nodes);
    if (orbit.ok && orbit.basepoint !== undefined) {
      const boost = boostToOrigin(orbit.basepoint);
      const modelPoints = nodes.map((node) =>
        perspectivePoint(matVec(boost, orbit.points.get(node.id)!), offset),
      );
      const finished = finishLayout(nodes, edges, modelPoints, targetRadius, {
        centre: "first-identity",
      });
      finished.diagnostics.perspectiveOffset = offset;
      return {
        kind: "hyperbolic-orbit",
        positions: finished.positions,
        diagnostics: finished.diagnostics,
        caveat: hyperbolicCaveat(offset, finished.diagnostics),
        warnings: [...warnings, ...collisionWarnings(finished.diagnostics)],
      };
    }
    warnings.push(
      `Davis view: the hyperbolic reflection data did not validate (${orbit.warnings.join(" ")}), so vertices are drawn on word-length shells instead of the reflection orbit.`,
    );
    return { kind: "shell-fallback", caveat: SHELL_CAVEAT, warnings };
  }

  const gram = approximateCoxeterGramMatrix(system.coxeterMatrix);
  const cholesky = choleskyLower(gram);
  if (cholesky === undefined) {
    warnings.push(
      "Davis view: this Coxeter group is infinite (its Tits form is not positive definite) and has no hyperbolic geometry block, so vertices are drawn on word-length shells; the Tits-cone orbit has no bounded normalisation to draw.",
    );
    return { kind: "shell-fallback", caveat: SHELL_CAVEAT, warnings };
  }

  const modelPoints = titsOrbitPoints(gram, cholesky, nodes);
  const finished = finishLayout(nodes, edges, modelPoints, targetRadius, {
    centre: "origin",
  });
  return {
    kind: "tits-orbit",
    positions: finished.positions,
    diagnostics: finished.diagnostics,
    caveat: `Davis view: vertices are the Tits-representation orbit w x0 of a point x0 inside the fundamental chamber (the Coxeter permutohedron), in Euclidean coordinates for the invariant form${finished.diagnostics.pcaProjected ? `, projected from R^${finished.diagnostics.sourceDimension} to 3D by PCA` : ""}. Incidence is exact; 2m-gons are planar regular polygons in R^${finished.diagnostics.sourceDimension}.`,
    warnings: collisionWarnings(finished.diagnostics),
  };
}

const SHELL_CAVEAT =
  "Davis view: vertices sit on word-length shells (a drawing convention, not Coxeter geometry). Incidence is exact; positions carry no metric meaning.";

function hyperbolicCaveat(
  offset: number,
  diagnostics: OrbitLayoutDiagnostics,
): string {
  const model =
    offset === 0
      ? "the Klein model"
      : offset === 1
        ? "the Poincare model"
        : Number.isFinite(offset)
          ? `the perspective map spatial(x)/(x0 + ${offset}) (between Klein, c=0, and the orthographic Gans model, c=infinity)`
          : "the orthographic Gans model";
  const pca = diagnostics.pcaProjected
    ? `, then projected from R^${diagnostics.sourceDimension} to 3D by PCA (a linear projection, so distinct cells may overlap)`
    : "";
  return `Davis view: vertices are the hyperbolic chamber orbit w x0, recentred so the identity chamber is at the origin and drawn by ${model}${pca}. Incidence is exact; positions are a drawing derived from the reflection orbit, not distances.`;
}

function collisionWarnings(diagnostics: OrbitLayoutDiagnostics): string[] {
  if (diagnostics.minVertexDistance > COLLISION_EPSILON) return [];
  return [
    "Davis view: two or more vertices are drawn at the same point after projection to 3D; the incidence data is unaffected.",
  ];
}

/**
 * Lorentz boost L with L x0 = e0 = (1, 0, ..., 0). It is an isometry of H^d,
 * so it only recentres the drawing on the identity chamber.
 */
export function boostToOrigin(basepoint: Vector): Matrix {
  const t = basepoint[0];
  const v = basepoint.slice(1);
  const size = basepoint.length;
  const boost = identityMatrix(size);
  boost[0][0] = t;
  for (let i = 1; i < size; i += 1) {
    boost[0][i] = -v[i - 1];
    boost[i][0] = -v[i - 1];
    for (let j = 1; j < size; j += 1) {
      boost[i][j] += (v[i - 1] * v[j - 1]) / (1 + t);
    }
  }
  return boost;
}

/**
 * Central projection of the upper hyperboloid from (-c, 0, ..., 0) onto
 * x0 = 0, rescaled so the ideal boundary is the unit sphere for finite c.
 * The centre lies outside the future cone, so affine 2-planes go to 2-planes
 * and convex polygons stay convex.
 */
export function perspectivePoint(point: Vector, offset: number): Vector {
  const spatial = point.slice(1);
  if (!Number.isFinite(offset)) return spatial;
  return spatial.map(
    (coordinate) => ((1 + offset) * coordinate) / (point[0] + offset),
  );
}

/**
 * Tits-representation orbit of x0 = sum of fundamental weights, in Euclidean
 * coordinates. For a finite group the Tits form B is positive definite, the
 * reflections preserve it, and B = L L^T turns root coordinates c into
 * Euclidean coordinates L^T c. B(x0, alpha_i) = 1 > 0 for every i, so x0 is
 * strictly inside the fundamental chamber and the orbit has |W| distinct
 * points (the vertices of the Coxeter permutohedron).
 */
function titsOrbitPoints(
  gram: Matrix,
  cholesky: Matrix,
  nodes: CayleyNode[],
): Vector[] {
  const rank = gram.length;
  const reflections = gram.map((_row, generator) =>
    simpleReflectionMatrix(gram, generator),
  );
  const basepoint = solveSymmetricPositive(cholesky, Array(rank).fill(1));
  const matrixByWord = new Map<string, Matrix>([["", identityMatrix(rank)]]);
  const wordMatrix = (word: number[]): Matrix => {
    const key = word.join(".");
    const cached = matrixByWord.get(key);
    if (cached !== undefined) return cached;
    // Right multiplication, as for Cayley edges: rho(w s) = rho(w) rho(s).
    const matrix = matMul(
      wordMatrix(word.slice(0, -1)),
      reflections[word[word.length - 1]],
    );
    matrixByWord.set(key, matrix);
    return matrix;
  };
  return nodes.map((node) => {
    const rootCoordinates = matVec(wordMatrix(node.word), basepoint);
    return Array.from({ length: rank }, (_unused, column) => {
      let total = 0;
      for (let row = column; row < rank; row += 1) {
        total += cholesky[row][column] * rootCoordinates[row];
      }
      return total;
    });
  });
}

function finishLayout(
  nodes: CayleyNode[],
  edges: CayleyEdge[],
  modelPoints: Vector[],
  targetRadius: number,
  { centre }: { centre: "origin" | "first-identity" },
): {
  positions: Map<string, [number, number, number]>;
  diagnostics: OrbitLayoutDiagnostics;
} {
  const dimension = modelPoints[0]?.length ?? 0;
  let points3: Vector[];
  const pcaProjected = dimension > 3;
  if (pcaProjected) {
    // PCA picks a starting 3D subspace, which refineProjection then turns so
    // that adjacent and distance-two vertices do not collide. Points are
    // projected about the model origin (the identity chamber or the
    // Tits-orbit centre), not the mean.
    const { components } = pcaProject(modelPoints, 3);
    const refined = refineProjection(
      components,
      modelPoints,
      separationPairs(nodes, edges),
    );
    points3 = modelPoints.map((point) => matVec(refined, point));
  } else {
    points3 = modelPoints.map((point) => [
      point[0] ?? 0,
      point[1] ?? 0,
      point[2] ?? 0,
    ]);
  }

  if (centre === "first-identity") {
    const identityIndex = nodes.findIndex((node) => node.word.length === 0);
    if (identityIndex >= 0) {
      const origin = points3[identityIndex];
      points3 = points3.map((point) =>
        point.map((value, k) => value - origin[k]),
      );
    }
  }

  const maxRadius = Math.max(...points3.map(vectorLength), 0);
  const scale = maxRadius > 0 ? targetRadius / maxRadius : 1;
  const positions = new Map<string, [number, number, number]>();
  nodes.forEach((node, index) => {
    const p = points3[index];
    positions.set(node.id, [
      cleanZero(p[0] * scale),
      cleanZero(p[1] * scale),
      cleanZero(p[2] * scale),
    ]);
  });

  const drawn = [...positions.values()];
  const midpoints: Array<[number, number, number]> = [];
  let minEdgeLength = Infinity;
  for (const edge of edges) {
    const a = positions.get(edge.source);
    const b = positions.get(edge.target);
    if (a === undefined || b === undefined) continue;
    minEdgeLength = Math.min(minEdgeLength, distance3(a, b));
    midpoints.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  }

  return {
    positions,
    diagnostics: {
      sourceDimension: dimension,
      pcaProjected,
      minVertexDistance: closestPairDistance(drawn),
      minEdgeLength,
      minEdgeMidpointDistance: closestPairDistance(midpoints),
    },
  };
}

const MAX_SEPARATION_PAIRS = 6_000;

/**
 * Vertex pairs at graph distance 1 or 2: the pairs whose collision would make
 * an edge or a 2m-gon unreadable. Deterministically thinned to a fixed budget
 * on large balls so the projection refinement stays interactive.
 */
function separationPairs(
  nodes: CayleyNode[],
  edges: CayleyEdge[],
): Array<[number, number]> {
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const neighbours: number[][] = nodes.map(() => []);
  const pairs: Array<[number, number]> = [];
  for (const edge of edges) {
    const a = indexById.get(edge.source);
    const b = indexById.get(edge.target);
    if (a === undefined || b === undefined || a === b) continue;
    neighbours[a].push(b);
    neighbours[b].push(a);
    pairs.push([a, b]);
  }
  for (const around of neighbours) {
    for (let i = 0; i < around.length; i += 1) {
      for (let j = i + 1; j < around.length; j += 1) {
        pairs.push([around[i], around[j]]);
      }
    }
  }
  if (pairs.length <= MAX_SEPARATION_PAIRS) return pairs;
  const stride = pairs.length / MAX_SEPARATION_PAIRS;
  return Array.from(
    { length: MAX_SEPARATION_PAIRS },
    (_unused, index) => pairs[Math.floor(index * stride)],
  );
}

/**
 * Closest pair by sorting on x and sweeping a window of width `best`.
 * Exact; near-linear for spread-out drawings.
 */
export function closestPairDistance(
  points: ReadonlyArray<readonly [number, number, number]>,
): number {
  const sorted = [...points].sort((left, right) => left[0] - right[0]);
  let best = Infinity;
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (sorted[j][0] - sorted[i][0] >= best) break;
      best = Math.min(best, distance3(sorted[i], sorted[j]));
    }
  }
  return best;
}

/** Lower-triangular L with B = L L^T, or undefined if B is not positive definite. */
function choleskyLower(matrix: Matrix): Matrix | undefined {
  const size = matrix.length;
  const lower: Matrix = Array.from({ length: size }, () => Array(size).fill(0));
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k += 1) sum -= lower[i][k] * lower[j][k];
      if (i === j) {
        // A small positive floor separates positive definite from merely
        // semidefinite (affine) forms in floating point.
        if (sum <= 1e-10) return undefined;
        lower[i][i] = Math.sqrt(sum);
      } else {
        lower[i][j] = sum / lower[j][j];
      }
    }
  }
  return lower;
}

function solveSymmetricPositive(lower: Matrix, rhs: Vector): Vector {
  const size = lower.length;
  const y = Array(size).fill(0);
  for (let i = 0; i < size; i += 1) {
    let sum = rhs[i];
    for (let k = 0; k < i; k += 1) sum -= lower[i][k] * y[k];
    y[i] = sum / lower[i][i];
  }
  const x = Array(size).fill(0);
  for (let i = size - 1; i >= 0; i -= 1) {
    let sum = y[i];
    for (let k = i + 1; k < size; k += 1) sum -= lower[k][i] * x[k];
    x[i] = sum / lower[i][i];
  }
  return x;
}

function distance3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function vectorLength(vector: Vector): number {
  return Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
}

function cleanZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
