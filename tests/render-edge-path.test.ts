import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import {
  curvedEdgeSegments,
  dashPattern,
  medianLength,
  polylinePointAt,
  pushPolylineSegments,
  quadraticBezierPoints,
} from "../src/render/edgePath";

function drawnLength(coordinates: number[]): number {
  let total = 0;
  for (let index = 0; index < coordinates.length; index += 6) {
    total += Math.hypot(
      coordinates[index + 3] - coordinates[index],
      coordinates[index + 4] - coordinates[index + 1],
      coordinates[index + 5] - coordinates[index + 2],
    );
  }
  return total;
}

describe("edge dash patterns", () => {
  it("draws solid edges as one segment and has no pattern for solid", () => {
    const out: number[] = [];
    pushPolylineSegments(out, [new Vector3(0, 0, 0), new Vector3(1, 0, 0)]);
    expect(out).toEqual([0, 0, 0, 1, 0, 0]);
    expect(dashPattern("solid")).toBeUndefined();
    expect(dashPattern(undefined)).toBeUndefined();
  });

  it("emits only the on-runs, with the pattern's duty cycle", () => {
    const out: number[] = [];
    const pattern = dashPattern("dashed")!;
    pushPolylineSegments(
      out,
      [new Vector3(0, 0, 0), new Vector3(10, 0, 0)],
      pattern,
      1,
    );
    const duty = pattern[0] / (pattern[0] + pattern[1]);
    expect(drawnLength(out) / 10).toBeCloseTo(duty, 1);
  });

  it("gives the five line styles distinct patterns", () => {
    const patterns = (
      ["dashed", "dotted", "dash-dot", "long-dash"] as const
    ).map((style) => JSON.stringify(dashPattern(style)));
    expect(new Set(patterns).size).toBe(4);
    expect(dashPattern("dash-dot")).toHaveLength(4);
  });

  it("keeps the dash phase continuous across polyline vertices", () => {
    const straight: number[] = [];
    const bent: number[] = [];
    const pattern = dashPattern("long-dash")!;
    pushPolylineSegments(
      straight,
      [new Vector3(0, 0, 0), new Vector3(4, 0, 0)],
      pattern,
    );
    pushPolylineSegments(
      bent,
      [new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(2, 2, 0)],
      pattern,
    );
    expect(drawnLength(bent)).toBeCloseTo(drawnLength(straight), 9);
  });
});

describe("curved edges", () => {
  it("runs a quadratic Bézier from source to target, pulled toward the control", () => {
    const points = quadraticBezierPoints(
      new Vector3(0, 0, 0),
      new Vector3(1, 2, 0),
      new Vector3(2, 0, 0),
    );
    expect(points).toHaveLength(curvedEdgeSegments + 1);
    expect(points[0].toArray()).toEqual([0, 0, 0]);
    expect(points.at(-1)!.toArray()).toEqual([2, 0, 0]);
    // The curve's apex is half way to the control point.
    expect(points[curvedEdgeSegments / 2].y).toBeCloseTo(1, 9);
  });

  it("samples a point and tangent by arc length", () => {
    const sample = polylinePointAt(
      [new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 1, 0)],
      0.75,
    )!;
    expect(sample.length).toBeCloseTo(2, 9);
    expect(sample.point.toArray()).toEqual([1, 0.5, 0]);
    expect(sample.tangent.toArray()).toEqual([0, 1, 0]);
  });

  it("uses the median edge length as the dash unit", () => {
    expect(medianLength([3, 1, 2, 0])).toBe(2);
    expect(medianLength([])).toBe(1);
  });
});
