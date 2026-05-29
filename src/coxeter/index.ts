export {
  approximateCoxeterGramMatrix,
  approximateCoxeterGramValue,
  evaluatePolynomial,
  exactRealApproximation,
  finiteCoxeterGramValue,
  geometricGramEntryValue,
} from "./gram";
export {
  identityMatrix,
  matrixPower,
  maxMatrixDifference,
  multiplyMatrices,
  roundedMatrixKey,
} from "./linearAlgebra";
export type { Matrix } from "./linearAlgebra";
export {
  buildSimpleReflectionMatrices,
  simpleReflectionMatrix,
} from "./reflection";
export {
  CoxeterValidationError,
  parseCoxeterSystemInput,
  validateCoxeterSystemInput,
} from "./validation";
export type { CoxeterValidationResult } from "./validation";
