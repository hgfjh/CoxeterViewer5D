import { describe, expect, it } from "vitest";

import {
  applyDenseLabelCap,
  blendOver,
  contrastRatio,
  denseLabelNodeThreshold,
  ensureTextContrast,
  labelDensityBudget,
  labelZoomLevel,
  parseHexColor,
  rgbToHex,
  type Rgb,
} from "../src/render/labels";

describe("label density rule", () => {
  it("keeps the caller's full budget for small scenes", () => {
    const budget = labelDensityBudget({
      visibleNodeCount: denseLabelNodeThreshold,
      maxNodeLabels: 80,
      maxEdgeLabels: 120,
    });
    expect(budget).toMatchObject({ dense: false, nodeCap: 80, edgeCap: 120 });
  });

  it("caps ordinary labels in dense scenes and relaxes the cap with zoom", () => {
    const framed = labelDensityBudget({
      visibleNodeCount: 336,
      maxNodeLabels: 80,
      maxEdgeLabels: 120,
    });
    expect(framed).toMatchObject({ dense: true, nodeCap: 25, edgeCap: 12 });

    const zoomed = labelDensityBudget({
      visibleNodeCount: 336,
      maxNodeLabels: 80,
      maxEdgeLabels: 120,
      zoomRatio: 2.5,
    });
    expect(zoomed).toMatchObject({ zoomLevel: 1, nodeCap: 50, edgeCap: 24 });

    // The caller's maximum still bounds the relaxed cap.
    const deep = labelDensityBudget({
      visibleNodeCount: 940,
      maxNodeLabels: 80,
      maxEdgeLabels: 120,
      zoomRatio: 100,
    });
    expect(deep).toMatchObject({ zoomLevel: 3, nodeCap: 80, edgeCap: 96 });
  });

  it("quantizes zoom into 2x steps and ignores zooming out", () => {
    expect(labelZoomLevel(0.3)).toBe(0);
    expect(labelZoomLevel(1.99)).toBe(0);
    expect(labelZoomLevel(2)).toBe(1);
    expect(labelZoomLevel(Number.NaN)).toBe(0);
  });

  it("keeps exempt labels past the cap but never past the hard maximum", () => {
    const sorted = ["a", "b", "sel", "c", "nbr", "d"];
    const exempt = (id: string) => id === "sel" || id === "nbr";
    expect(applyDenseLabelCap(sorted, 2, 10, exempt)).toEqual([
      "a",
      "b",
      "sel",
      "nbr",
    ]);
    expect(applyDenseLabelCap(sorted, 2, 3, exempt)).toEqual(["a", "b", "sel"]);
  });

  it("skips ordinary labels rejected by the collision check", () => {
    const sorted = ["a", "b", "c", "d"];
    const picked = applyDenseLabelCap(
      sorted,
      2,
      10,
      () => false,
      (id) => id !== "b",
    );
    expect(picked).toEqual(["a", "c"]);
  });
});

describe("label text contrast", () => {
  const lightCanvas = parseHexColor("#f6f7f9") as Rgb;
  const darkCanvas = parseHexColor("#0d1117") as Rgb;
  const lightChip = blendOver(
    parseHexColor("#ffffff") as Rgb,
    0.92,
    lightCanvas,
  );
  const darkChip = blendOver(parseHexColor("#111827") as Rgb, 0.9, darkCanvas);
  const generatorColors = [
    "#2f81f7",
    "#3fb950",
    "#d29922",
    "#f85149",
    "#a371f7",
    "#56d4dd",
  ];

  it("parses and prints hex colors", () => {
    expect(parseHexColor("#fff")).toEqual([1, 1, 1]);
    expect(rgbToHex(parseHexColor("#3fb950") as Rgb)).toBe("#3fb950");
    expect(parseHexColor("rebeccapurple")).toBeUndefined();
  });

  it("brings every generator color to 4.5:1 on both label chips", () => {
    for (const hex of generatorColors) {
      const color = parseHexColor(hex) as Rgb;
      for (const chip of [lightChip, darkChip]) {
        const text = ensureTextContrast(color, chip, 4.5);
        expect(contrastRatio(text, chip)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("darkens on light chips and lightens on dark chips", () => {
    const green = parseHexColor("#3fb950") as Rgb;
    const onLight = ensureTextContrast(green, lightChip, 4.5);
    const onDark = ensureTextContrast(
      parseHexColor("#1f6feb") as Rgb,
      darkChip,
      6.5,
    );
    expect(onLight[1]).toBeLessThan(green[1]);
    expect(onDark[2]).toBeGreaterThan(parseHexColor("#1f6feb")![2]);
  });

  it("keeps the ordinary node-label text above 4.5:1 in both themes", () => {
    expect(
      contrastRatio(parseHexColor("#24292f") as Rgb, lightChip),
    ).toBeGreaterThan(4.5);
    expect(
      contrastRatio(parseHexColor("#e6edf3") as Rgb, darkChip),
    ).toBeGreaterThan(4.5);
  });
});
