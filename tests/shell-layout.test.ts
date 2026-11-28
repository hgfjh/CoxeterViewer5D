import { describe, expect, it } from "vitest";
import { assignShellLayout } from "../src/cayley/shellLayout";
import type { CayleyNode } from "../src/types";

// The full I2(5) group: shells of sizes 1, 2, 2, 2, 2, 1 (order 10).
function dihedralNodes(m: number): CayleyNode[] {
  const nodes: CayleyNode[] = [{ id: "e", word: [], length: 0 }];
  for (let length = 1; length < m; length += 1) {
    for (const first of [0, 1]) {
      const word = Array.from({ length }, (_, i) => (first + i) % 2);
      nodes.push({ id: word.join("."), word, length });
    }
  }
  const longest = Array.from({ length: m }, (_, i) => i % 2);
  nodes.push({ id: longest.join("."), word: longest, length: m });
  return nodes;
}

describe("shell layout for dihedral balls", () => {
  it("draws the 2m-cycle as a polygon, not a line through the poles", () => {
    const placed = assignShellLayout(dihedralNodes(5));
    const positions = placed.map((node) => node.position!);
    expect(positions).toHaveLength(10);

    // Planar, and every two-element shell opens away from the x axis.
    for (const [, , z] of positions) expect(z).toBe(0);
    for (const node of placed) {
      if (node.length === 0 || node.length === 5) continue;
      expect(Math.abs(node.position![1])).toBeGreaterThan(0.5);
    }
    // Shell radii still equal word length: the convention the docs describe.
    for (const node of placed) {
      expect(Math.hypot(...node.position!)).toBeCloseTo(node.length, 10);
    }
    // The two words of each length sit symmetrically across the x axis.
    const shellThree = placed.filter((node) => node.length === 3);
    expect(shellThree[0].position![1]).toBeCloseTo(-shellThree[1].position![1]);
  });
});
