import { describe, expect, it } from "vitest";
import { bundledExamples } from "../src/app/exampleRegistry";

describe("viewer example registry", () => {
  it("includes the ideal all-m=3 cube as a golden teaching example", () => {
    const example = bundledExamples.find(
      (entry) => entry.id === "ideal_hyperbolic_3_cube_m3",
    );

    expect(example).toMatchObject({
      label: "Ideal 3-cube, all m=3 (S4 cover)",
      role: "teaching",
      system: {
        rank: 6,
        dataStatus: "certified",
      },
    });
  });

  it("keeps the complete certified eight-facet catalogue reachable", () => {
    const catalogue = bundledExamples.filter(
      (example) => example.role === "catalogue",
    );

    expect(catalogue).toHaveLength(16);
    expect(catalogue.every((example) => example.system.rank === 8)).toBe(true);
    expect(
      catalogue.every((example) => example.system.dataStatus === "certified"),
    ).toBe(true);
    expect(catalogue.map((example) => example.id)).toContain(
      "tumarkin_5d_8facet_g12221_01",
    );
  });
});
