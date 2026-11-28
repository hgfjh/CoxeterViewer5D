import { describe, expect, it } from "vitest";

import {
  cellPolygonDiagnostics,
  type Point3,
  triangulateCellBoundary,
} from "../src/render/cellPolygon";

function regularPolygon(sides: number, radius = 1): Point3[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = (2 * Math.PI * index) / sides;
    return [radius * Math.cos(angle), radius * Math.sin(angle), 0] as Point3;
  });
}

function triangleArea(a: Point3, b: Point3, c: Point3): number {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  return Math.hypot(cross[0], cross[1], cross[2]) / 2;
}

function polygonArea2d(points: Point3[]): number {
  let area = 0;
  points.forEach((p, index) => {
    const q = points[(index + 1) % points.length];
    area += p[0] * q[1] - q[0] * p[1];
  });
  return Math.abs(area) / 2;
}

function corner(
  points: Point3[],
  fill: ReturnType<typeof triangulateCellBoundary>,
  index: number,
): Point3 {
  return index === fill!.centroidIndex ? fill!.centroid! : points[index];
}

function filledArea(points: Point3[]): number {
  const fill = triangulateCellBoundary(points);
  expect(fill).toBeDefined();
  return fill!.triangles.reduce(
    (sum, [a, b, c]) =>
      sum +
      triangleArea(
        corner(points, fill, a),
        corner(points, fill, b),
        corner(points, fill, c),
      ),
    0,
  );
}

describe("Davis 2-cell fill triangulation", () => {
  it("fills a regular 2m-gon from its centroid with exactly its area", () => {
    const decagon = regularPolygon(10);
    const fill = triangulateCellBoundary(decagon);
    expect(fill?.method).toBe("centroid-fan");
    expect(fill?.triangles).toHaveLength(10);
    expect(filledArea(decagon)).toBeCloseTo(polygonArea2d(decagon), 9);
  });

  it("ear-clips a simple non-star-shaped boundary without spilling outside it", () => {
    // A "C" shaped octagon: the centroid lies outside the notch region, so a
    // fan from vertex 0 or from the centroid would cover area outside it.
    const shape: Point3[] = [
      [0, 0, 0],
      [4, 0, 0],
      [4, 1, 0],
      [1, 1, 0],
      [1, 3, 0],
      [4, 3, 0],
      [4, 4, 0],
      [0, 4, 0],
    ];
    const fill = triangulateCellBoundary(shape);
    expect(fill?.method).toBe("ear-clip");
    expect(fill?.triangles).toHaveLength(shape.length - 2);
    expect(filledArea(shape)).toBeCloseTo(polygonArea2d(shape), 9);
  });

  it("gives no fill to a drawn boundary that crosses itself", () => {
    const bowtieHexagon: Point3[] = [
      [0, 0, 0],
      [2, 2, 0],
      [3, 1, 0],
      [2, 0, 0],
      [0, 2, 0],
      [-1, 1, 0],
    ];
    expect(cellPolygonDiagnostics(bowtieHexagon).selfIntersecting).toBe(true);
    expect(triangulateCellBoundary(bowtieHexagon)).toBeUndefined();
  });

  it("fills a bent (non-planar) square with a rim equal to the boundary", () => {
    const saddle: Point3[] = [
      [1, 0, 0.3],
      [0, 1, -0.3],
      [-1, 0, 0.3],
      [0, -1, -0.3],
    ];
    const diagnostics = cellPolygonDiagnostics(saddle);
    expect(diagnostics.nonPlanarity).toBeGreaterThan(0.1);
    const fill = triangulateCellBoundary(saddle);
    expect(fill?.method).toBe("centroid-fan");
    // Every boundary edge appears in exactly one fan triangle.
    const boundaryEdges = new Set(
      fill!.triangles.map(([, b, c]) => `${Math.min(b, c)}-${Math.max(b, c)}`),
    );
    expect(boundaryEdges).toEqual(new Set(["0-1", "1-2", "2-3", "0-3"]));
  });

  it("treats a collapsed boundary as unfillable", () => {
    const collapsed: Point3[] = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ];
    expect(cellPolygonDiagnostics(collapsed).degenerate).toBe(true);
    expect(triangulateCellBoundary(collapsed)).toBeUndefined();
  });
});
