import type { CoxeterMatrixEntry, GeometricEntry } from "../types";

export interface ApproximateGramOptions {
  infiniteValue?: number;
}

const defaultInfiniteValue = -1;

/**
 * Numeric Gram entry for a finite Coxeter angle: B_ij = -cos(pi / m_ij).
 */
export function finiteCoxeterGramValue(m: number): number {
  if (!Number.isInteger(m) || m < 2) {
    throw new Error(`Finite Coxeter entries must be integers >= 2; got ${m}.`);
  }

  if (m === 2) {
    return 0;
  }

  return -Math.cos(Math.PI / m);
}

/**
 * Converts the structured geometric Gram schema without evaluating formulas
 * from user-provided strings.
 */
export function geometricGramEntryValue(entry: GeometricEntry): number {
  switch (entry.kind) {
    case "coxeter":
      return finiteCoxeterGramValue(entry.m);
    case "right":
      return 0;
    case "dotted":
      return -(entry.exact?.decimal ?? entry.coshDistance);
    case "numericGram":
      return entry.exact?.decimal ?? entry.value;
  }
}

export function evaluatePolynomial(coefficients: number[], x: number): number {
  return coefficients.reduce(
    (total, coefficient) => total * x + coefficient,
    0,
  );
}

export function exactRealApproximation(
  entry: GeometricEntry,
): number | undefined {
  return entry.exact?.decimal;
}

/**
 * Coxeter matrices with "inf" entries do not determine a finite angle.
 * This helper is named approximate because it chooses a numeric value for
 * browser-side reflection enumeration.
 */
export function approximateCoxeterGramValue(
  entry: CoxeterMatrixEntry,
  options: ApproximateGramOptions = {},
): number {
  if (entry === "inf") {
    // Infinite Coxeter entries have no finite angle. The Tits drawing backend
    // uses a named numeric value so the browser can build reflection matrices.
    return options.infiniteValue ?? defaultInfiniteValue;
  }

  return finiteCoxeterGramValue(entry);
}

/**
 * Builds the Gram matrix used by the approximate Tits reflection backend.
 */
export function approximateCoxeterGramMatrix(
  matrix: CoxeterMatrixEntry[][],
  options: ApproximateGramOptions = {},
): number[][] {
  return matrix.map((row, i) =>
    row.map((entry, j) => {
      if (i === j) {
        return 1;
      }

      return approximateCoxeterGramValue(entry, options);
    }),
  );
}
