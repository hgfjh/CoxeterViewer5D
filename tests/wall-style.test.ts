import { describe, expect, it } from "vitest";
import { buildCoverCompression } from "../src/compression";
import {
  buildWallScene,
  WALL_STYLE_CAPACITY,
  wallStyle,
} from "../src/app/wallScene";
import { buildC44Psl27Cover } from "../src/torsionFree";
import { findWallSystem } from "../src/walls";
import C44_SYSTEM from "../src/examples/compact_3_tetrahedron_c44_2233.json";
import type { CoxeterSystemInput } from "../src/types";

/** WCAG relative luminance contrast ratio. */
function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );
  return (light + 0.05) / (dark + 0.05);
}

describe("wall style cues", () => {
  it("gives distinct (colour, line style) pairs up to the capacity", () => {
    const pairs = Array.from(
      { length: WALL_STYLE_CAPACITY },
      (_unused, index) => {
        const style = wallStyle(index);
        expect(style.unique).toBe(true);
        return `${style.color}|${style.lineStyle}`;
      },
    );
    expect(new Set(pairs).size).toBe(WALL_STYLE_CAPACITY);
    expect(WALL_STYLE_CAPACITY).toBeGreaterThanOrEqual(42);
    expect(wallStyle(WALL_STYLE_CAPACITY).unique).toBe(false);
  });

  it("keeps every wall hue at 3:1 contrast on both canvas themes", () => {
    const hues = new Set(
      Array.from(
        { length: WALL_STYLE_CAPACITY },
        (_unused, index) => wallStyle(index).color,
      ),
    );
    for (const hue of hues) {
      expect(contrast(hue, "#f6f7f9")).toBeGreaterThanOrEqual(3);
      expect(contrast(hue, "#0d1117")).toBeGreaterThanOrEqual(3);
    }
  });

  it("separates colour-blind-confusable hues by line style within a cycle", () => {
    // Pairs whose CIEDE2000 distance drops below 9 under protanopia or
    // deuteranopia simulation (red/brown, red/orange, brown/orange,
    // green/teal, sky/teal); they must differ in dash pattern.
    const confusable = [
      ["#dc2626", "#a16207"],
      ["#dc2626", "#ea580c"],
      ["#a16207", "#ea580c"],
      ["#16a34a", "#0d9488"],
      ["#0284c7", "#0d9488"],
    ];
    for (let cycle = 0; cycle < 5; cycle += 1) {
      const styles = new Map(
        Array.from({ length: 9 }, (_unused, hue) => {
          const style = wallStyle(cycle * 9 + hue);
          return [style.color, style.lineStyle] as const;
        }),
      );
      for (const [left, right] of confusable) {
        expect(styles.get(left)).not.toBe(styles.get(right));
      }
    }
  });

  it("never draws two C44 walls with the same cue", () => {
    const c44 = buildCoverCompression(
      buildC44Psl27Cover(C44_SYSTEM as CoxeterSystemInput),
    );
    const walls = findWallSystem(c44.barX);
    expect(walls.walls).toHaveLength(42);
    const scene = buildWallScene(c44.barX, walls, { showWalls: false });
    const cueByWall = new Map<string, string>();
    for (const edge of scene.edges) {
      const wallId = walls.edgeToWallId[edge.id];
      const cue = `${edge.colorHint}|${edge.lineStyle}`;
      expect(cueByWall.get(wallId) ?? cue).toBe(cue);
      cueByWall.set(wallId, cue);
    }
    expect(new Set(cueByWall.values()).size).toBe(42);
    expect(scene.warnings.join(" ")).not.toContain("repeat a pair");
  });
});
