import { describe, expect, it } from "vitest";

import { contrastRatio, parseHexColor } from "../src/render/labels";
import {
  fallbackGeneratorColor,
  generatorPaletteDark,
  generatorPaletteLight,
  selectionColor,
  shellColor,
  shellRampDark,
  shellRampLight,
} from "../src/render/scenePalette";
import { generatorColor } from "../src/render/SceneView";

const light = parseHexColor("#f6f7f9")!;
const dark = parseHexColor("#0d1117")!;

function saturation(hex: string): number {
  const [r, g, b] = parseHexColor(hex)!;
  return Math.max(r, g, b) - Math.min(r, g, b);
}

describe("scene colour channels", () => {
  it("gives every generator of a rank-24 system a distinct colour in both themes", () => {
    for (const scheme of ["light", "dark"] as const) {
      const colours = Array.from({ length: 24 }, (_, index) =>
        fallbackGeneratorColor(index, scheme),
      );
      expect(new Set(colours).size).toBe(24);
    }
  });

  it("keeps the first twelve generator colours readable as lines on their canvas", () => {
    for (const hex of generatorPaletteLight) {
      expect(contrastRatio(parseHexColor(hex)!, light)).toBeGreaterThanOrEqual(
        3,
      );
    }
    for (const hex of generatorPaletteDark) {
      expect(contrastRatio(parseHexColor(hex)!, dark)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("encodes word-length shells by neutral lightness, without wrapping", () => {
    for (const hex of [...shellRampLight, ...shellRampDark]) {
      expect(saturation(hex)).toBeLessThan(0.16);
    }
    expect(shellColor(0, "light")).toBe(shellRampLight[0]);
    // Lengths past the ramp stay at the last step instead of cycling.
    expect(shellColor(40, "light")).toBe(shellRampLight.at(-1));
    expect(shellColor(6, "dark")).toBe(shellRampDark.at(-1));
    for (const hex of shellRampLight) {
      expect(contrastRatio(parseHexColor(hex)!, light)).toBeGreaterThanOrEqual(
        3,
      );
    }
    for (const hex of shellRampDark) {
      expect(contrastRatio(parseHexColor(hex)!, dark)).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("keeps the selection colour out of the generator palette", () => {
    expect(generatorPaletteLight).not.toContain(selectionColor.light);
    expect(generatorPaletteDark).not.toContain(selectionColor.dark);
  });

  it("prefers example colour hints over the fallback palette", () => {
    const generators = [{ label: "a", colorHint: "#123456" }, { label: "b" }];
    expect(generatorColor(generators, 0, "dark")).toBe("#123456");
    expect(generatorColor(generators, 1, "dark")).toBe(generatorPaletteDark[1]);
    expect(generatorColor(generators, 13)).toBe(fallbackGeneratorColor(13));
  });
});
