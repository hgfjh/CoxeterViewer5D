import { describe, expect, it } from "vitest";
import { buildDefiningGraphScene } from "../src/app/definingGraphScene";
import IDEAL_3_CUBE from "../src/examples/ideal_hyperbolic_3_cube_m3.json";
import C44_SYSTEM from "../src/examples/compact_3_tetrahedron_c44_2233.json";
import COMPACT_5_CUBE from "../src/examples/compact_5_cube_gamma1.json";
import type { CoxeterSystemInput } from "../src/types";

type Point = [number, number, number];

function properCrossings(
  positions: Map<string, Point>,
  edges: ReadonlyArray<{ source: string; target: string }>,
): number {
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let count = 0;
  for (let left = 0; left < edges.length; left += 1) {
    for (let right = left + 1; right < edges.length; right += 1) {
      const ids = [
        edges[left].source,
        edges[left].target,
        edges[right].source,
        edges[right].target,
      ];
      if (new Set(ids).size < 4) continue;
      const [a, b, c, d] = ids.map((id) => positions.get(id)!);
      if (
        cross(a, b, c) * cross(a, b, d) < -1e-9 &&
        cross(c, d, a) * cross(c, d, b) < -1e-9
      ) {
        count += 1;
      }
    }
  }
  return count;
}

describe("automatic Gamma layout", () => {
  it.each([
    ["ideal cube (octahedron graph)", IDEAL_3_CUBE],
    ["C(4,4;2,2;3,3) (K4)", C44_SYSTEM],
  ])(
    "draws planar Gamma for the %s crossing-free in one plane",
    (_name, data) => {
      const scene = buildDefiningGraphScene(data as CoxeterSystemInput);
      expect(scene.layoutMode).toBe("auto");
      expect(scene.layoutKind).toBe("plane");
      expect(scene.nodes.every((node) => node.position?.[2] === 0)).toBe(true);
      const positions = new Map(
        scene.nodes.map((node) => [node.id, node.position!] as const),
      );
      expect(properCrossings(positions, scene.edges)).toBe(0);
      // Planar drawings get explicit label positions near their own edge.
      expect(
        scene.edges.every((edge) => edge.labelPosition !== undefined),
      ).toBe(true);
      const gaps = scene.nodes.flatMap((left, index) =>
        scene.nodes
          .slice(index + 1)
          .map((right) =>
            Math.hypot(
              left.position![0] - right.position![0],
              left.position![1] - right.position![1],
            ),
          ),
      );
      expect(Math.min(...gaps)).toBeGreaterThan(1.5);
    },
  );

  it("falls back to 3D for the non-planar compact 5-cube Gamma", () => {
    const scene = buildDefiningGraphScene(COMPACT_5_CUBE as CoxeterSystemInput);
    expect(scene.planarity.isPlanar).toBe(false);
    expect(scene.layoutKind).toBe("space");
    expect(scene.nodes.some((node) => Math.abs(node.position![2]) > 0.5)).toBe(
      true,
    );
    expect(scene.warnings.join(" ")).toContain("stress layout");
  });

  it("is deterministic", () => {
    const first = buildDefiningGraphScene({
      ...(IDEAL_3_CUBE as CoxeterSystemInput),
    });
    const second = buildDefiningGraphScene({
      ...(IDEAL_3_CUBE as CoxeterSystemInput),
    });
    expect(first.nodes.map((node) => node.position)).toEqual(
      second.nodes.map((node) => node.position),
    );
  });

  it("colours vertices by generator and edges by neutral order cues", () => {
    const system = IDEAL_3_CUBE as CoxeterSystemInput;
    const scene = buildDefiningGraphScene(system);
    expect(scene.nodes.map((node) => node.colorHint)).toEqual(
      system.generators.map((generator) => generator.colorHint),
    );
    expect(scene.nodes.map((node) => node.generatorColorIndex)).toEqual(
      system.generators.map((_generator, index) => index),
    );
    const generatorHues = new Set(
      system.generators.map((generator) => generator.colorHint),
    );
    expect(
      scene.edges.every((edge) => !generatorHues.has(edge.colorHint)),
    ).toBe(true);
    expect(scene.edges.every((edge) => edge.compactLabel === "m=3")).toBe(true);
    expect(scene.edges.every((edge) => edge.lineStyle === "solid")).toBe(true);
  });
});
