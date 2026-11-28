import { Vector3 } from "three";

/**
 * Drawn path of an edge: dash patterns and curved chords.
 *
 * Both are drawing conventions. A dash pattern lets colour-limited views
 * (9 wall hues, five Gamma Coxeter orders) pair each colour with a second
 * cue; a curved chord keeps an edge that crosses a spread relation cell from
 * running through the cell's interior. Neither changes the edge's incidence.
 */

export type SceneLineStyle =
  | "solid"
  | "dashed"
  | "dotted"
  | "dash-dot"
  | "long-dash";

/** Segments used to draw one quadratic Bézier edge. */
export const curvedEdgeSegments = 12;

/**
 * On/off run lengths, in units of the scene's median edge length. Dashing is
 * done on the CPU (only the "on" runs are emitted), so every style shares the
 * ordinary line material and batches with solid edges of the same colour,
 * and patterns such as dash-dot need no custom shader.
 */
const dashPatterns: Record<Exclude<SceneLineStyle, "solid">, number[]> = {
  dashed: [0.13, 0.08],
  dotted: [0.012, 0.05],
  "dash-dot": [0.13, 0.06, 0.025, 0.06],
  "long-dash": [0.3, 0.1],
};

export function dashPattern(
  style: SceneLineStyle | undefined,
): readonly number[] | undefined {
  return style && style !== "solid" ? dashPatterns[style] : undefined;
}

/** Points of the quadratic Bézier from source to target pulled by control. */
export function quadraticBezierPoints(
  source: Vector3,
  control: Vector3,
  target: Vector3,
  segments = curvedEdgeSegments,
): Vector3[] {
  const points: Vector3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const a = (1 - t) * (1 - t);
    const b = 2 * t * (1 - t);
    const c = t * t;
    points.push(
      new Vector3(
        a * source.x + b * control.x + c * target.x,
        a * source.y + b * control.y + c * target.y,
        a * source.z + b * control.z + c * target.z,
      ),
    );
  }
  return points;
}

/**
 * Point and unit tangent at arc-length fraction `fraction` along a polyline.
 */
export function polylinePointAt(
  points: readonly Vector3[],
  fraction: number,
): { point: Vector3; tangent: Vector3; length: number } | undefined {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += points[index].distanceTo(points[index - 1]);
  }
  if (!(length > 0)) {
    return undefined;
  }
  let remaining = Math.min(1, Math.max(0, fraction)) * length;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const step = a.distanceTo(b);
    if (step <= 0) continue;
    if (remaining <= step || index === points.length - 1) {
      const t = Math.min(1, remaining / step);
      return {
        point: a.clone().lerp(b, t),
        tangent: b.clone().sub(a).normalize(),
        length,
      };
    }
    remaining -= step;
  }
  return undefined;
}

/**
 * Appends a polyline as line-segment pairs. With a dash pattern only the "on"
 * runs are emitted; the pattern phase runs continuously along the whole
 * polyline, so a curved edge dashes like a straight one.
 */
export function pushPolylineSegments(
  out: number[],
  points: readonly Vector3[],
  pattern?: readonly number[],
  unit = 1,
): void {
  if (!pattern || pattern.length === 0 || !(unit > 0)) {
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1];
      const b = points[index];
      out.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    return;
  }
  const runs = pattern.map((value) => Math.max(1e-6, value * unit));
  let runIndex = 0;
  let runLeft = runs[0];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const step = a.distanceTo(b);
    let position = 0;
    while (position < step - 1e-12) {
      const advance = Math.min(runLeft, step - position);
      if (runIndex % 2 === 0) {
        const from = position / step;
        const to = (position + advance) / step;
        out.push(
          a.x + (b.x - a.x) * from,
          a.y + (b.y - a.y) * from,
          a.z + (b.z - a.z) * from,
          a.x + (b.x - a.x) * to,
          a.y + (b.y - a.y) * to,
          a.z + (b.z - a.z) * to,
        );
      }
      position += advance;
      runLeft -= advance;
      if (runLeft <= 1e-12) {
        runIndex = (runIndex + 1) % runs.length;
        runLeft = runs[runIndex];
      }
    }
  }
}

/** Median of the given edge lengths, or 1 when there are none. */
export function medianLength(lengths: number[]): number {
  const positive = lengths
    .filter((value) => value > 1e-9)
    .sort((a, b) => a - b);
  if (positive.length === 0) return 1;
  return positive[Math.floor(positive.length / 2)];
}
