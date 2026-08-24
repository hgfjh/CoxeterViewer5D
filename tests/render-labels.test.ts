import { describe, expect, it } from "vitest";

import {
  compactLabelText,
  pickLabelEntries,
  selectSegmentLabelBudget,
  semanticEdgeLabelText,
} from "../src/render/labels";
import { prefilterSpatialPickSpheres } from "../src/render/SceneView";

describe("scene label helpers", () => {
  it("keeps short labels unchanged and compacts long words", () => {
    expect(compactLabelText("s0s1", 8)).toBe("s0s1");
    expect(compactLabelText("s0s1s2s3s4", 8)).toBe("s0s...s4");
  });

  it("keeps selected labels before lower-priority labels when capped", () => {
    const picked = pickLabelEntries(
      [
        { id: "b", priority: 1 },
        { id: "selected", selected: true, priority: 99 },
        { id: "a", priority: 0 },
      ],
      2,
    );

    expect(picked.map((entry) => entry.id)).toEqual(["selected", "a"]);
  });

  it("keeps one semantic edge label per geometric segment before budgeting", () => {
    const picked = selectSegmentLabelBudget(
      [
        {
          id: "relation-copy",
          segmentKey: "base|s0",
          label: "0: s0",
          priority: 15,
        },
        {
          id: "generator-arrow",
          segmentKey: "base|s0",
          label: "s0",
          priority: 60,
        },
        { id: "s1-arrow", segmentKey: "base|s1", label: "s1", priority: 50 },
      ],
      2,
    );

    expect(picked.map((entry) => entry.label)).toEqual(["s0", "s1"]);
  });

  it("does not keep two generator labels for one semantic edge segment", () => {
    const picked = selectSegmentLabelBudget(
      [
        {
          id: "relation-copy-a",
          segmentKey: "shared",
          label: "s2",
          priority: 4,
        },
        {
          id: "relation-copy-b",
          segmentKey: "shared",
          label: "s5",
          priority: 6,
        },
        { id: "spine", segmentKey: "shared", label: "s3", priority: 60 },
      ],
      10,
    );

    expect(picked).toHaveLength(1);
    expect(picked[0].label).toBe("s3");
  });

  it("uses Coxeter exponents on Gamma edges and generators on complex edges", () => {
    expect(
      semanticEdgeLabelText(
        {
          id: "Gamma:e:0-3",
          compactLabel: "3",
          semanticLabelKind: "coxeter-order",
        },
        "g0",
      ),
    ).toBe("3");
    expect(
      semanticEdgeLabelText({ id: "barX:e:17", compactLabel: "g0" }, "g0"),
    ).toBe("g0");
  });

  it("prefilters spatial picking spheres only after the candidate threshold", () => {
    const small = prefilterSpatialPickSpheres(
      [
        { id: "near", center: [0, 0, 0], radius: 1 },
        { id: "far", center: [10, 0, 0], radius: 1 },
      ],
      ([x]) => x * x,
      { minimumEntryCount: 3, padding: 0 },
    );
    expect(small.candidates.map((entry) => entry.id)).toEqual(["near", "far"]);
    expect(small.stats.usedPrefilter).toBe(false);

    const large = prefilterSpatialPickSpheres(
      [
        { id: "near", center: [0, 0, 0], radius: 1 },
        { id: "middle", center: [0.55, 0, 0], radius: 0.5 },
        { id: "far", center: [10, 0, 0], radius: 1 },
      ],
      ([x]) => x * x,
      { minimumEntryCount: 3, padding: 0.1 },
    );
    expect(large.candidates.map((entry) => entry.id)).toEqual([
      "near",
      "middle",
    ]);
    expect(large.stats).toMatchObject({
      total: 3,
      candidates: 2,
      rejected: 1,
      usedPrefilter: true,
    });
  });
});
