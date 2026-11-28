import { describe, expect, it } from "vitest";
import { firstAlternatingRelationFailure } from "../src/torsionFree/relationCheck";

// Reference: check every point, report the first failure in increasing order.
function bruteForce(left: number[], right: number[], m: number) {
  for (let point = 0; point < left.length; point += 1) {
    let image = point;
    for (let repeat = 0; repeat < m; repeat += 1) image = right[left[image]];
    if (image !== point) return { point, image };
  }
  return undefined;
}

function randomInvolution(degree: number, seed: number): number[] {
  let state = seed;
  const next = () => (state = (state * 1103515245 + 12345) % 2 ** 31);
  const order = Array.from({ length: degree }, (_unused, point) => point);
  for (let index = degree - 1; index > 0; index -= 1) {
    const swap = next() % (index + 1);
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  const images = Array.from({ length: degree }, (_unused, point) => point);
  for (let index = 0; index + 1 < degree; index += 2) {
    images[order[index]] = order[index + 1];
    images[order[index + 1]] = order[index];
  }
  return images;
}

describe("orbit-skipping Coxeter relation check", () => {
  it("reports the same first failure as a point-by-point scan", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const degree = 4 + (seed % 37);
      const left = randomInvolution(degree, seed);
      const right = randomInvolution(degree, seed * 7 + 3);
      for (const m of [2, 3, 4, 5, 6]) {
        expect(
          firstAlternatingRelationFailure(left, right, m, degree, true),
        ).toEqual(bruteForce(left, right, m));
      }
    }
  });

  it("accepts a dihedral action where the relation holds everywhere", () => {
    // Regular action of the dihedral group of order 2m on 2m points.
    const m = 5;
    const point = (rotation: number, flip: number) =>
      2 * (((rotation % m) + m) % m) + flip;
    const left = Array.from({ length: 2 * m }, (_unused, state) =>
      point(Math.floor(state / 2), (state % 2) ^ 1),
    );
    const right = Array.from({ length: 2 * m }, (_unused, state) => {
      const rotation = Math.floor(state / 2);
      const flip = state % 2;
      return point(rotation + (flip === 0 ? 1 : -1), flip ^ 1);
    });
    expect(
      firstAlternatingRelationFailure(left, right, m, 2 * m, true),
    ).toBeUndefined();
  });
});
