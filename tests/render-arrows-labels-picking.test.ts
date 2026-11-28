import { describe, expect, it } from "vitest";
import { Object3D, Vector3 } from "three";

import { compactLabelText, wordLabelTokens } from "../src/render/labels";
import {
  arrowHeadMatrix,
  computeSceneFraming,
  labelDepthOpacity,
  nearestScreenSegment,
} from "../src/render/SceneView";

describe("token-aware word label compaction", () => {
  it("splits spaced and concatenated generator words into tokens", () => {
    expect(wordLabelTokens("t24 t1 t4")).toEqual(["t24", "t1", "t4"]);
    expect(wordLabelTokens("s0s1s12")).toEqual(["s0", "s1", "s12"]);
    expect(wordLabelTokens("abab")).toEqual(["a", "b", "a", "b"]);
    expect(wordLabelTokens("(g, 3)")).toBeUndefined();
  });

  it("never cuts through a generator token and reports the word length", () => {
    const compact = compactLabelText("t24 t1 t4 t23 t7 t19 t9", 14);
    expect(compact).toBe("t24 t1 t4 … t9 (ℓ=7)");
    for (const token of compact.replace(/\(ℓ=\d+\)/, "").split(/\s+/)) {
      expect(["t24", "t1", "t4", "…", "t9", ""]).toContain(token);
    }
    expect(compactLabelText("s0s1s2s3s4", 8)).toBe("s0s1…s4 (ℓ=5)");
  });

  it("leaves short labels and non-word labels readable", () => {
    expect(compactLabelText("s0s1", 8)).toBe("s0s1");
    expect(compactLabelText("vertex-label-123", 10)).toBe("verte…-123");
  });
});

describe("label depth fade", () => {
  it("keeps labels in front of the orbit target opaque and fades those behind", () => {
    expect(labelDepthOpacity(4, 5, 2)).toBe(1);
    expect(labelDepthOpacity(5, 5, 2)).toBe(1);
    const halfway = labelDepthOpacity(6, 5, 2);
    expect(halfway).toBeLessThan(1);
    expect(halfway).toBeGreaterThan(labelDepthOpacity(7, 5, 2));
    expect(labelDepthOpacity(50, 5, 2)).toBeCloseTo(0.32, 6);
  });
});

describe("directed-edge arrowheads", () => {
  it("sits past the midpoint toward the target, not on the target vertex", () => {
    const source = new Vector3(0, 0, 0);
    const target = new Vector3(2, 0, 0);
    const matrix = arrowHeadMatrix(
      source,
      target,
      new Vector3(),
      new Object3D(),
      1,
    )!;
    const position = new Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeGreaterThan(1);
    expect(position.x).toBeLessThan(1.5);
    expect(target.distanceTo(position)).toBeGreaterThan(0.5);
  });

  it("shrinks on short edges so the cone never covers most of the edge", () => {
    const matrix = arrowHeadMatrix(
      new Vector3(0, 0, 0),
      new Vector3(0.2, 0, 0),
      new Vector3(),
      new Object3D(),
      1.35,
    )!;
    const scale = new Vector3().setFromMatrixScale(matrix);
    // Cone height is 0.18 at scale 1; it may cover at most 28% of the edge.
    expect(0.18 * scale.y).toBeLessThanOrEqual(0.28 * 0.2 + 1e-9);
  });
});

describe("screen-space edge picking", () => {
  const segments = [
    { id: "near", a: [0, 0, 0.2] as const, b: [100, 0, 0.2] as const },
    { id: "far", a: [0, 4, 0.9] as const, b: [100, 4, 0.9] as const },
  ];

  it("picks the segment nearest in pixels within the tolerance", () => {
    expect(nearestScreenSegment([50, 1], segments, 6)).toBe("near");
    expect(nearestScreenSegment([50, 3.6], segments, 6)).toBe("far");
    expect(nearestScreenSegment([50, 30], segments, 6)).toBeUndefined();
  });

  it("breaks pixel ties by depth", () => {
    expect(nearestScreenSegment([50, 2], segments, 6)).toBe("near");
  });
});

describe("projection framing", () => {
  it("frames the model ball from about 2.8R with a 45 degree field of view", () => {
    const radius = 1;
    const points = [
      new Vector3(radius, 0, 0),
      new Vector3(-radius, 0, 0),
      new Vector3(0, radius, 0),
      new Vector3(0, -radius, 0),
      new Vector3(0, 0, radius),
      new Vector3(0, 0, -radius),
    ];
    const framing = computeSceneFraming(points, 45, 1.2, 0.92);
    expect(framing.distance / radius).toBeGreaterThan(2.4);
    expect(framing.distance / radius).toBeLessThan(3.2);
    expect(framing.center.length()).toBeLessThan(1e-9);
  });
});
