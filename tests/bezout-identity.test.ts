import { describe, expect, it } from "vitest";
import { computeBezoutIdentity } from "../src/fibering/wallHomomorphism";

// The previous quadratic algorithm, kept as the reference: every new step
// rescales all coefficients chosen so far.
function extendedGcd(left: bigint, right: bigint) {
  let [oldR, r] = [left, right];
  let [oldS, s] = [1n, 0n];
  let [oldT, t] = [0n, 1n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
    [oldT, t] = [t, oldT - q * t];
  }
  return { gcd: oldR, leftCoefficient: oldS, rightCoefficient: oldT };
}

function referenceCoefficients(
  values: Array<{ generatorId: string; value: number }>,
) {
  const sorted = [...values].sort((a, b) =>
    a.generatorId < b.generatorId ? -1 : a.generatorId > b.generatorId ? 1 : 0,
  );
  const coefficients = new Map<string, bigint>();
  let gcd = 0n;
  for (const entry of sorted) {
    const value = BigInt(entry.value);
    if (value === 0n) continue;
    const magnitude = value < 0n ? -value : value;
    if (gcd === 0n) {
      gcd = magnitude;
      coefficients.set(entry.generatorId, value > 0n ? 1n : -1n);
      continue;
    }
    const result = extendedGcd(gcd, magnitude);
    for (const [id, coefficient] of coefficients) {
      coefficients.set(id, coefficient * result.leftCoefficient);
    }
    coefficients.set(
      entry.generatorId,
      result.rightCoefficient * (value > 0n ? 1n : -1n),
    );
    gcd = result.gcd;
  }
  return { gcd, coefficients };
}

describe("Bezout identity", () => {
  it("matches the quadratic reference on random inputs", () => {
    let seed = 12345;
    const random = (bound: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % bound;
    };
    for (let trial = 0; trial < 200; trial += 1) {
      const count = 1 + random(12);
      const values = Array.from({ length: count }, (_unused, index) => ({
        generatorId: `g${random(1000)}-${index}`,
        value: random(5) === 0 ? 0 : (random(2) ? 1 : -1) * (1 + random(60)),
      }));
      const reference = referenceCoefficients(values);
      const identity = computeBezoutIdentity(values);
      expect(identity.verified).toBe(true);
      expect(BigInt(identity.gcd)).toBe(reference.gcd);
      for (const term of identity.terms) {
        expect(BigInt(term.coefficient)).toBe(
          reference.coefficients.get(term.generatorId),
        );
      }
      const nonzero = [...reference.coefficients].filter(([, c]) => c !== 0n);
      expect(identity.terms.length).toBe(nonzero.length);
    }
  });
});
