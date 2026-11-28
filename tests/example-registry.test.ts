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

  it("includes the closed C(4,4;2,2;3,3) tetrahedron as a golden example", () => {
    const example = bundledExamples.find(
      (entry) => entry.id === "compact_3_tetrahedron_c44_2233",
    );

    expect(example).toMatchObject({
      label: "Compact tetrahedron C(4,4;2,2;3,3) (PSL(2,7) cover)",
      role: "teaching",
      system: { rank: 4, dataStatus: "verified-source" },
    });
  });

  it("bundles the complete certified Ma-Zheng nine-facet catalogue", () => {
    const catalogue = bundledExamples.filter(
      (example) => example.role === "nine-facet-catalogue",
    );

    expect(catalogue).toHaveLength(51);
    expect(catalogue.every((example) => example.system.rank === 9)).toBe(true);
    expect(
      catalogue.every((example) => example.system.dataStatus === "certified"),
    ).toBe(true);
    expect(catalogue.map((example) => example.id)).toContain(
      "mazheng_5d_9facet_p319_10",
    );
  });

  it("bundles all three compact simplicial 5-prisms and the P1 double", () => {
    const sevenFacet = bundledExamples.filter(
      (example) => example.role === "compact" && example.system.rank === 7,
    );

    expect(sevenFacet.map((example) => example.id).sort()).toEqual([
      "compact_5_polytope_p1_double_makarov",
      "compact_5_prism_h5_p7_22",
      "compact_5_prism_makarov",
      "compact_5_prism_makarov_p2",
    ]);
  });

  it("bundles the G12221 unfoldings Q55 and Q35 as compact targets", () => {
    const q55 = bundledExamples.find(
      (example) => example.id === "q55_icosahedral_truncation",
    );
    const q35 = bundledExamples.find(
      (example) => example.id === "q35_g12221_h3_unfolding",
    );

    expect(q55).toMatchObject({
      role: "compact",
      system: { rank: 55, dataStatus: "verified-source" },
    });
    expect(q35).toMatchObject({
      role: "compact",
      system: { rank: 35, dataStatus: "verified-source" },
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

  it("labels compact sources by campaign, including H5-P7-22", () => {
    const label = (id: string) =>
      bundledExamples.find((example) => example.id === id)?.label;

    expect(label("compact_5_prism_makarov")).toContain("paired primary");
    expect(label("compact_5_polytope_p1_double_makarov")).toContain(
      "paired primary",
    );
    expect(label("compact_5_prism_makarov_p2")).toContain("coarse experiment");
    expect(label("tumarkin_5d_8facet_g11411_06")).toContain(
      "bounded comparison pair",
    );
    expect(label("tumarkin_5d_8facet_g11411_15")).toContain(
      "bounded comparison pair",
    );
    expect(label("tumarkin_5d_8facet_g12221_01")).toContain(
      "catalogued/deferred",
    );
    expect(label("compact_5_prism_h5_p7_22")).toContain("H5-P7-22");
  });
});
