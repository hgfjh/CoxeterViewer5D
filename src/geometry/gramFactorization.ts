import { geometricGramEntryValue } from "../coxeter";
import type { GeometricEntry } from "../types";
import {
  maxAbsMatrixDifference,
  matrixShape,
  type Matrix,
  type Vector,
} from "./linearAlgebra";
import { lorentzDot } from "./lorentz";
import { jacobiEigenDecomposition } from "./symmetricEigen";

export interface LorentzGramFactorizationDiagnostics {
  signature: {
    positive: number;
    negative: number;
    zero: number;
  };
  residual: number;
  tolerance: number;
  eigenvalues: number[];
}

export interface LorentzGramFactorizationResult {
  ok: boolean;
  normals: Vector[];
  gramMatrix: Matrix;
  diagnostics: LorentzGramFactorizationDiagnostics;
  warnings: string[];
}

export function geometricNormalGramToMatrix(
  normalGram: GeometricEntry[][],
): Matrix {
  return normalGram.map((row) => row.map(geometricGramEntryValue));
}

/**
 * Factors a symmetric normal Gram matrix G as N J N^T with
 * J = diag(-1, 1, ..., 1). This is a numerical visualization step, so the
 * residual and signature are returned as product data rather than hidden.
 */
export function factorLorentzianNormalGram(
  normalGram: GeometricEntry[][] | Matrix,
  dimension: number,
  tolerance = 1e-8,
): LorentzGramFactorizationResult {
  const gramMatrix = isGeometricGram(normalGram)
    ? geometricNormalGramToMatrix(normalGram)
    : normalGram.map((row) => [...row]);
  const [rows, columns] = matrixShape(gramMatrix, "normal Gram matrix");
  const warnings: string[] = [
    "Geometric normal coordinates were numerically factored from normalGram; this is not an exact certificate.",
  ];

  if (rows !== columns) {
    throw new Error(`normalGram must be square, got ${rows}x${columns}.`);
  }

  const eigenpairs = jacobiEigenDecomposition(gramMatrix, tolerance / 100);
  const positivePairs = eigenpairs.filter((pair) => pair.value > tolerance);
  const negativePairs = eigenpairs.filter((pair) => pair.value < -tolerance);
  const zeroPairs = eigenpairs.filter(
    (pair) => Math.abs(pair.value) <= tolerance,
  );
  const coordinateCount = dimension + 1;
  const normals = Array.from({ length: rows }, () =>
    Array.from({ length: coordinateCount }, () => 0),
  );

  if (negativePairs.length !== 1 || positivePairs.length > dimension) {
    const diagnostics = {
      signature: {
        positive: positivePairs.length,
        negative: negativePairs.length,
        zero: zeroPairs.length,
      },
      residual: Number.POSITIVE_INFINITY,
      tolerance,
      eigenvalues: eigenpairs.map((pair) => pair.value),
    };
    return {
      ok: false,
      normals,
      gramMatrix,
      diagnostics,
      warnings: [
        ...warnings,
        `normalGram has numerical signature (${diagnostics.signature.positive}, ${diagnostics.signature.negative}, ${diagnostics.signature.zero}); expected at most (${dimension}, 1, *).`,
      ],
    };
  }

  if (positivePairs.length < dimension) {
    warnings.push(
      `normalGram has ${positivePairs.length} positive directions for H^${dimension}; unused spatial coordinates were padded with zeros.`,
    );
  }

  const negative = negativePairs[0];
  for (let row = 0; row < rows; row += 1) {
    normals[row][0] = Math.sqrt(-negative.value) * negative.vector[row];
  }

  positivePairs.slice(0, dimension).forEach((pair, spatialIndex) => {
    for (let row = 0; row < rows; row += 1) {
      normals[row][spatialIndex + 1] = Math.sqrt(pair.value) * pair.vector[row];
    }
  });

  const reconstructed = reconstructLorentzGram(normals);
  const residual = maxAbsMatrixDifference(reconstructed, gramMatrix);
  const diagnostics = {
    signature: {
      positive: positivePairs.length,
      negative: negativePairs.length,
      zero: zeroPairs.length,
    },
    residual,
    tolerance,
    eigenvalues: eigenpairs.map((pair) => pair.value),
  };

  return {
    ok: residual <= tolerance * 20,
    normals,
    gramMatrix,
    diagnostics,
    warnings:
      residual <= tolerance * 20
        ? warnings
        : [
            ...warnings,
            `normalGram factorization residual ${formatNumber(residual)} exceeds tolerance ${tolerance}.`,
          ],
  };
}

export function reconstructLorentzGram(normals: Vector[]): Matrix {
  return normals.map((left) => normals.map((right) => lorentzDot(left, right)));
}

function isGeometricGram(
  value: GeometricEntry[][] | Matrix,
): value is GeometricEntry[][] {
  return typeof value[0]?.[0] === "object";
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toPrecision(6) : String(value);
}
