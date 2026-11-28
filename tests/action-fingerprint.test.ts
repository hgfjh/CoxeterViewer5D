import { describe, expect, it } from "vitest";
import { torsionFreeActionFingerprint } from "../src/torsionFree/certification";
import type { CoxeterSystemInput } from "../src/types";
import type { TorsionFreeActionCandidate } from "../src/torsionFree/types";

// The pre-streaming definition: FNV-1a 64 of one joined string.  Kept here as
// the reference so the streamed implementation stays digest-compatible.
function legacyFingerprint(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): string {
  const canonical = [
    system.rank,
    system.coxeterMatrix.flat().join(","),
    candidate.index,
    ...candidate.generatorImages.map((images) => images.join(",")),
  ].join("|");
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function randomInvolution(degree: number, seed: number): number[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state;
  };
  const order = Array.from({ length: degree }, (_unused, point) => point);
  for (let index = degree - 1; index > 0; index -= 1) {
    const swap = next() % (index + 1);
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  const images = new Array<number>(degree);
  for (let index = 0; index + 1 < degree; index += 2) {
    images[order[index]] = order[index + 1];
    images[order[index + 1]] = order[index];
  }
  return images;
}

const system = {
  schemaVersion: 1,
  name: "fingerprint fixture",
  rank: 3,
  generators: [0, 1, 2].map((index) => ({
    id: `s${index}`,
    label: `s${index}`,
  })),
  coxeterMatrix: [
    [1, 3, "inf"],
    [3, 1, 2],
    ["inf", 2, 1],
  ],
} as unknown as CoxeterSystemInput;

describe("torsionFreeActionFingerprint", () => {
  it("matches the joined-string FNV-1a reference for plain and packed rows", () => {
    for (const degree of [2, 10, 1_000, 12_346]) {
      const rows = [0, 1, 2].map((generator) =>
        randomInvolution(degree, degree + generator),
      );
      const plain: TorsionFreeActionCandidate = {
        id: "plain",
        index: degree,
        generatorImages: rows,
      };
      const packed: TorsionFreeActionCandidate = {
        id: "packed",
        index: degree,
        generatorImages: rows.map((row) => Uint32Array.from(row)),
      };
      const expected = legacyFingerprint(system, plain);
      expect(torsionFreeActionFingerprint(system, plain)).toBe(expected);
      expect(torsionFreeActionFingerprint(system, packed)).toBe(expected);
    }
  });

  it("matches the reference for empty and invalid rows", () => {
    const odd: TorsionFreeActionCandidate = {
      id: "odd",
      index: 3,
      generatorImages: [[], [0.5, -1, 2], [1, 0, 2]],
    };
    expect(torsionFreeActionFingerprint(system, odd)).toBe(
      legacyFingerprint(system, odd),
    );
  });
});
