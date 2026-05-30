import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import { cameraLocalMovementDelta } from "../src/render/SceneView";

describe("camera movement helpers", () => {
  const axes = {
    forward: new Vector3(0, 1, 0),
    right: new Vector3(1, 0, 0),
    vertical: new Vector3(0, 0, 1),
  };

  it("moves in camera-local forward and strafe directions", () => {
    const delta = cameraLocalMovementDelta(
      axes,
      { forward: 1, strafe: -1, vertical: 0, fast: false },
      0.5,
      2,
    );

    expect(delta.toArray()).toEqual([-1, 1, 0]);
  });

  it("uses the fast multiplier for Shift movement", () => {
    const delta = cameraLocalMovementDelta(
      axes,
      { forward: 0, strafe: 0, vertical: 1, fast: true },
      0.25,
      2,
      4,
    );

    expect(delta.toArray()).toEqual([0, 0, 2]);
  });

  it("normalizes camera axes before applying movement", () => {
    const delta = cameraLocalMovementDelta(
      {
        forward: new Vector3(0, 10, 0),
        right: new Vector3(5, 0, 0),
        vertical: new Vector3(0, 0, 2),
      },
      { forward: 1, strafe: 1, vertical: -1, fast: false },
      1,
      3,
    );

    expect(delta.toArray()).toEqual([3, 3, -3]);
  });

  it("can tune forward, strafe, and vertical sensitivity independently", () => {
    const delta = cameraLocalMovementDelta(
      axes,
      { forward: 1, strafe: 1, vertical: 1, fast: false },
      1,
      10,
      1,
      { forward: 0.7, strafe: 0.25, vertical: 0.4 },
    );

    expect(delta.toArray()).toEqual([2.5, 7, 4]);
  });
});
