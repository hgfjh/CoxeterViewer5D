import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateCayleyBall } from "../src/cayley";
import { parseCoxeterSystemInput } from "../src/coxeter";
import {
  computeRankTwoDavisCells,
  deriveVisibleHigherDavisCells,
  enumerateSphericalSubsets,
} from "../src/davis";
import { legacyGenerateCayleyBall } from "./reference/legacyGenerateCayleyBall";
import { legacyDeriveVisibleHigherDavisCells } from "./reference/legacyHigherCells";

// The optimized ball generator (typed matrices, hashed rounded entries) and
// the indexed higher-cell derivation must reproduce the frozen reference
// implementations exactly: same node order, ids, words, matrix keys, edges,
// and higher-cell incidence.
const CASES: Array<[string, number]> = [
  ["I2_5", 6],
  ["A3", 6],
  ["universal_rank3", 4],
  ["hyperbolic_toy_rank2", 7],
  ["compact_5_prism_makarov", 6],
  ["compact_5_cube_gamma1", 4],
  ["tumarkin_5d_8facet_g11411_01", 5],
];

describe("viewer ball generation equivalence", () => {
  for (const [example, radius] of CASES) {
    it(`${example} at radius ${radius} matches the reference generator`, () => {
      const system = parseCoxeterSystemInput(
        JSON.parse(readFileSync(`public/examples/${example}.json`, "utf8")),
      );
      const options = {
        radius,
        maxRadius: 8,
        maxNodes: 12_000,
        maxEdges: 45_000,
        matrixKeyPrecision: 10,
        createdAt: "fixed",
      };
      const fresh = generateCayleyBall(system, options);
      const reference = legacyGenerateCayleyBall(system, options);
      expect(fresh).toEqual(reference);

      const { cells } = computeRankTwoDavisCells(fresh, system);
      const subsets = enumerateSphericalSubsets(system).subsets;
      const withCells = { ...fresh, twoCells: cells };
      expect(deriveVisibleHigherDavisCells(withCells, subsets)).toEqual(
        legacyDeriveVisibleHigherDavisCells(withCells, subsets),
      );
    });
  }
});
