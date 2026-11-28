import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import {
  computeSceneFraming,
  labelScreenScale,
  lineAxisIfCollinear,
  planeNormalIfCoplanar,
} from "../src/render/SceneView";

function decagon(radius = 3): Vector3[] {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = (2 * Math.PI * index) / 10;
    return new Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0);
  });
}

describe("scene framing", () => {
  it("detects a flat point set and returns its normal", () => {
    const normal = planeNormalIfCoplanar(decagon());
    expect(normal).toBeDefined();
    expect(Math.abs(normal!.z)).toBeCloseTo(1, 6);
  });

  it("treats a genuinely 3D cloud and a collinear set as non-planar", () => {
    const cube = [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) => [-1, 1].map((z) => new Vector3(x, y, z))),
    );
    expect(planeNormalIfCoplanar(cube)).toBeUndefined();
    const line = [0, 1, 2, 3].map((x) => new Vector3(x, 0, 0));
    expect(planeNormalIfCoplanar(line)).toBeUndefined();
  });

  it("views a flat polygon nearly face-on", () => {
    const framing = computeSceneFraming(decagon(), 55, 1);
    expect(framing.coplanar).toBe(true);
    // 12 degree tilt off the normal: |cos| ~ 0.978.
    expect(Math.abs(framing.direction.z)).toBeGreaterThan(0.97);
    expect(framing.direction.length()).toBeCloseTo(1, 9);
  });

  it("views a tilted flat polygon along its own normal", () => {
    const tilt = new Vector3(1, 1, 0).normalize();
    const rotated = decagon().map((point) =>
      point
        .clone()
        .applyAxisAngle(tilt, 1.1)
        .add(new Vector3(4, -2, 7)),
    );
    const normal = new Vector3(0, 0, 1).applyAxisAngle(tilt, 1.1);
    const framing = computeSceneFraming(rotated, 55, 1.6);
    expect(Math.abs(framing.direction.dot(normal))).toBeGreaterThan(0.97);
    expect(framing.center.distanceTo(new Vector3(4, -2, 7))).toBeLessThan(0.4);
  });

  it("fits the bounding sphere to about 70% of the shorter viewport side", () => {
    const fov = 55;
    const framing = computeSceneFraming(decagon(3), fov, 1);
    const { distance, radius } = framing;
    const projected = radius / Math.sqrt(distance * distance - radius * radius);
    expect(projected / Math.tan((fov * Math.PI) / 360)).toBeCloseTo(0.7, 6);

    // A narrow (portrait) viewer backs the camera off further.
    const portrait = computeSceneFraming(decagon(3), fov, 0.5);
    expect(portrait.distance).toBeGreaterThan(distance);
  });

  it("views a two-vertex drawing perpendicular to its edge", () => {
    // Roughly along the default view direction, which used to collapse the
    // edge to a stub on screen.
    const points = [new Vector3(0, 1.5, -0.9), new Vector3(0, -1.5, 0.9)];
    const axis = lineAxisIfCollinear(points);
    expect(axis).toBeDefined();
    const framing = computeSceneFraming(points, 55, 1);
    expect(Math.abs(framing.direction.dot(axis!))).toBeLessThan(1e-9);
    expect(lineAxisIfCollinear(decagon())).toBeUndefined();
  });

  it("keeps the oblique default direction for 3D scenes", () => {
    const cube = [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) => [-1, 1].map((z) => new Vector3(x, y, z))),
    );
    const framing = computeSceneFraming(cube, 55, 1);
    expect(framing.coplanar).toBe(false);
    expect(framing.direction.y).toBeLessThan(0);
    expect(framing.direction.z).toBeGreaterThan(0);
  });
});

describe("label screen scale", () => {
  it("leaves labels alone when they are already large on screen", () => {
    expect(labelScreenScale(800, 2, 55)).toBe(1);
  });

  it("grows labels for distant cameras, up to a cap", () => {
    const far = labelScreenScale(800, 40, 55);
    expect(far).toBeGreaterThan(1);
    expect(labelScreenScale(800, 10_000, 55)).toBe(2.5);
  });

  it("ignores degenerate viewports", () => {
    expect(labelScreenScale(0, 10, 55)).toBe(1);
    expect(labelScreenScale(800, 0, 55)).toBe(1);
  });
});
