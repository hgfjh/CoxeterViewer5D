/**
 * Fill triangulation for drawn Davis 2-cells.
 *
 * A rank-two cell is an abstract 2m-gon. Its drawn boundary is the cycle of
 * vertex positions chosen by the layout (shell, reflection orbit, projection),
 * so the boundary need not be planar, convex or even simple in the drawing.
 * The fill is a drawing convention: it must stay inside the drawn boundary
 * cycle, or the picture suggests incidences that are not in the complex.
 *
 * Strategy, applied in the best-fit plane of the boundary:
 * 1. A boundary whose projection crosses itself has no disk spanning it
 *    without spilling, so it gets no fill (outline only).
 * 2. A boundary that is star-shaped about its centroid is filled by a fan from
 *    an added centroid vertex. For a bent but star-shaped polygon this gives a
 *    gently curved disk whose rim is exactly the boundary.
 * 3. Other simple polygons are ear-clipped in the projection plane; the
 *    triangles use the original 3D vertices, so the rim is still exact.
 */

export type Point3 = readonly [number, number, number];

export interface CellFillTriangulation {
  /** Index triples into the boundary, or `centroidIndex` for the centroid. */
  triangles: Array<[number, number, number]>;
  /** Present when the fan uses an added centroid vertex. */
  centroid?: Point3;
  /** Index used for the centroid in `triangles` (boundary length). */
  centroidIndex: number;
  method: "centroid-fan" | "ear-clip";
}

export interface CellPolygonDiagnostics {
  /** Max distance from the best-fit plane divided by the boundary diameter. */
  nonPlanarity: number;
  /** True when two non-adjacent projected boundary edges cross. */
  selfIntersecting: boolean;
  /** True when the projection has (almost) no area, e.g. a collapsed cycle. */
  degenerate: boolean;
}

const sub = (a: Point3, b: Point3): [number, number, number] => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point3, b: Point3): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Point3) => Math.sqrt(dot(a, a));

interface Projection {
  points: Array<[number, number]>;
  centroid: [number, number, number];
  nonPlanarity: number;
  degenerate: boolean;
  /** Signed area in the projection plane (positive: counter-clockwise). */
  area: number;
}

/**
 * Projects the boundary onto its Newell-normal plane. The Newell normal is
 * the area-weighted normal of a closed polygon, so it is well defined for
 * non-planar cycles and does not depend on which vertex comes first.
 */
function projectBoundary(points: readonly Point3[]): Projection {
  const count = points.length;
  const centroid: [number, number, number] = [0, 0, 0];
  for (const point of points) {
    centroid[0] += point[0] / count;
    centroid[1] += point[1] / count;
    centroid[2] += point[2] / count;
  }
  const normal: [number, number, number] = [0, 0, 0];
  let diameter = 0;
  for (let index = 0; index < count; index += 1) {
    const p = points[index];
    const q = points[(index + 1) % count];
    normal[0] += (p[1] - q[1]) * (p[2] + q[2]);
    normal[1] += (p[2] - q[2]) * (p[0] + q[0]);
    normal[2] += (p[0] - q[0]) * (p[1] + q[1]);
    for (let other = index + 1; other < count; other += 1) {
      diameter = Math.max(diameter, norm(sub(p, points[other])));
    }
  }
  let length = norm(normal);
  if (diameter > 1e-9 && length <= 1e-9 * diameter * diameter) {
    // A figure-eight drawing has opposite-signed lobes whose Newell areas
    // cancel. Fall back to the plane spanned by the widest pair of centroid
    // offsets, so the crossing can still be detected.
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const candidate = cross(
          sub(points[i], centroid),
          sub(points[j], centroid),
        );
        const candidateLength = norm(candidate);
        if (candidateLength > length) {
          length = candidateLength;
          normal[0] = candidate[0];
          normal[1] = candidate[1];
          normal[2] = candidate[2];
        }
      }
    }
  }
  if (diameter <= 1e-9 || length <= 1e-9 * diameter * diameter) {
    return {
      points: points.map(() => [0, 0]),
      centroid,
      nonPlanarity: 0,
      degenerate: true,
      area: 0,
    };
  }
  const n: Point3 = [
    normal[0] / length,
    normal[1] / length,
    normal[2] / length,
  ];
  const reference: Point3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const uRaw = cross(n, reference);
  const uLength = norm(uRaw);
  const u: Point3 = [uRaw[0] / uLength, uRaw[1] / uLength, uRaw[2] / uLength];
  const v = cross(n, u);
  let residual = 0;
  const projected = points.map((point): [number, number] => {
    const offset = sub(point, centroid);
    residual = Math.max(residual, Math.abs(dot(offset, n)));
    return [dot(offset, u), dot(offset, v)];
  });
  const area = signedArea(projected);
  return {
    points: projected,
    centroid,
    nonPlanarity: residual / diameter,
    degenerate: Math.abs(area) <= 1e-9 * diameter * diameter,
    area,
  };
}

function signedArea(points: ReadonlyArray<readonly [number, number]>): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const p = points[index];
    const q = points[(index + 1) % points.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  return area / 2;
}

function orient(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Proper crossing of segments ab and cd (shared endpoints do not count). */
function segmentsCross(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
): boolean {
  // Orientation values scale like |ab|*|cd|; treat near-zero as touching.
  const tol =
    1e-9 *
    Math.hypot(b[0] - a[0], b[1] - a[1]) *
    Math.hypot(d[0] - c[0], d[1] - c[1]);
  const side = (value: number) => (value > tol ? 1 : value < -tol ? -1 : 0);
  return (
    side(orient(a, b, c)) * side(orient(a, b, d)) < 0 &&
    side(orient(c, d, a)) * side(orient(c, d, b)) < 0
  );
}

function projectedSelfIntersection(
  points: ReadonlyArray<readonly [number, number]>,
): boolean {
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 2; j < count; j += 1) {
      if (i === 0 && j === count - 1) continue;
      if (
        segmentsCross(
          points[i],
          points[(i + 1) % count],
          points[j],
          points[(j + 1) % count],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Shape diagnostics used by the renderer and by the audit tests. */
export function cellPolygonDiagnostics(
  points: readonly Point3[],
): CellPolygonDiagnostics {
  if (points.length < 3) {
    return { nonPlanarity: 0, selfIntersecting: false, degenerate: true };
  }
  const projection = projectBoundary(points);
  return {
    nonPlanarity: projection.nonPlanarity,
    selfIntersecting: projectedSelfIntersection(projection.points),
    degenerate: projection.degenerate,
  };
}

/**
 * Triangulates the drawn boundary so the fill stays inside it, or returns
 * undefined when no such fill exists in the drawing (self-crossing or
 * collapsed boundary). Callers then draw the outline only.
 */
export function triangulateCellBoundary(
  points: readonly Point3[],
): CellFillTriangulation | undefined {
  const count = points.length;
  if (count < 3) return undefined;
  const projection = projectBoundary(points);
  if (projection.degenerate || projectedSelfIntersection(projection.points)) {
    return undefined;
  }
  const sign = Math.sign(projection.area);
  const center2: [number, number] = [0, 0];
  for (const point of projection.points) {
    center2[0] += point[0] / count;
    center2[1] += point[1] / count;
  }
  // Star-shaped about the vertex centroid: every fan triangle has the
  // polygon's orientation, so the fan covers the interior exactly once.
  const diameter2 = Math.max(
    1e-12,
    ...projection.points.map((p) => Math.hypot(p[0], p[1])),
  );
  const fanEps = 1e-6 * diameter2 * diameter2;
  let starShaped = true;
  for (let index = 0; index < count; index += 1) {
    const a = projection.points[index];
    const b = projection.points[(index + 1) % count];
    if (orient(center2, a, b) * sign <= fanEps) {
      starShaped = false;
      break;
    }
  }
  if (starShaped) {
    const triangles: Array<[number, number, number]> = [];
    for (let index = 0; index < count; index += 1) {
      triangles.push([count, index, (index + 1) % count]);
    }
    return {
      triangles,
      centroid: projection.centroid,
      centroidIndex: count,
      method: "centroid-fan",
    };
  }
  const triangles = earClip(projection.points, sign);
  return triangles
    ? { triangles, centroidIndex: count, method: "ear-clip" }
    : undefined;
}

/** Ear clipping of a simple polygon with the given orientation sign. */
function earClip(
  points: ReadonlyArray<readonly [number, number]>,
  sign: number,
): Array<[number, number, number]> | undefined {
  const remaining = points.map((_, index) => index);
  const triangles: Array<[number, number, number]> = [];
  let guard = 0;
  while (remaining.length > 3 && guard < points.length * points.length) {
    guard += 1;
    let clipped = false;
    for (let k = 0; k < remaining.length; k += 1) {
      const ia = remaining[(k + remaining.length - 1) % remaining.length];
      const ib = remaining[k];
      const ic = remaining[(k + 1) % remaining.length];
      const a = points[ia];
      const b = points[ib];
      const c = points[ic];
      if (orient(a, b, c) * sign <= 0) continue;
      let containsOther = false;
      for (const other of remaining) {
        if (other === ia || other === ib || other === ic) continue;
        const p = points[other];
        // Duplicate positions (a cycle revisiting a vertex) block the ear.
        if (
          orient(a, b, p) * sign >= 0 &&
          orient(b, c, p) * sign >= 0 &&
          orient(c, a, p) * sign >= 0
        ) {
          containsOther = true;
          break;
        }
      }
      if (containsOther) continue;
      triangles.push([ia, ib, ic]);
      remaining.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) return undefined;
  }
  if (remaining.length === 3) {
    triangles.push([remaining[0], remaining[1], remaining[2]]);
  }
  return triangles;
}
