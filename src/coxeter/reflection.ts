import type { CoxeterMatrixEntry } from "../types";
import { approximateCoxeterGramMatrix } from "./gram";
import type { Matrix } from "./linearAlgebra";

/**
 * Matrix of s_i in the simple-root basis. Column j is the image of alpha_j:
 * s_i(alpha_j) = alpha_j - 2 B(alpha_j, alpha_i) alpha_i.
 */
export function simpleReflectionMatrix(
  gram: Matrix,
  generator: number,
): Matrix {
  const rank = gram.length;
  const reflection = Array.from({ length: rank }, (_, i) =>
    Array.from({ length: rank }, (_unused, j) => (i === j ? 1 : 0)),
  );

  for (let column = 0; column < rank; column += 1) {
    reflection[generator][column] -= 2 * gram[column][generator];
  }

  return reflection;
}

/**
 * Builds one simple-reflection matrix per Coxeter generator for the
 * approximate browser backend.
 */
export function buildSimpleReflectionMatrices(
  matrix: CoxeterMatrixEntry[][],
): Matrix[] {
  const gram = approximateCoxeterGramMatrix(matrix);
  return matrix.map((_row, generator) =>
    simpleReflectionMatrix(gram, generator),
  );
}
