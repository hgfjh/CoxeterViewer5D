import { canonicalSha256 } from "../utils/canonicalSha256";

export type HeightArrangementInteger = number | string | bigint;
export type HeightArrangementSign = -1 | 0 | 1;

interface Rational {
  numerator: bigint;
  denominator: bigint;
}

export interface CanonicalHeightNormal {
  zero: boolean;
  primitive: string[];
  /** The input normal is multiplier times primitive. */
  multiplier: string;
  key: string;
}

export interface AntipodalSignRepresentative {
  signs: HeightArrangementSign[];
  reversed: boolean;
  selfAntipodal: boolean;
  key: string;
}

export interface HeightConeAssignment {
  normal: string[];
  normalKey: string;
  sign: HeightArrangementSign;
}

export interface HeightConeFeasibleCertificate {
  kind: "feasible";
  dimension: number;
  /** Null only for the zero cone. */
  primitiveWitness: string[] | null;
  certificateHash: string;
}

export interface HeightConeFarkasCertificate {
  kind: "infeasible";
  inequalityMultipliers: Array<{
    assignmentIndex: number;
    value: string;
  }>;
  equalityMultipliers: Array<{
    assignmentIndex: number;
    value: string;
  }>;
  certificateHash: string;
}

export type HeightConeFeasibilityCertificate =
  | HeightConeFeasibleCertificate
  | HeightConeFarkasCertificate;

export interface HeightConeContext {
  rank: number;
  assignments: readonly HeightConeAssignment[];
  feasibility: HeightConeFeasibleCertificate;
  depth: number;
  constraintDigest: string;
}

export type HeightConeDecision<PruneProof, LeafValue> =
  | { kind: "split"; normal: readonly HeightArrangementInteger[] }
  | { kind: "prune"; proof: PruneProof }
  | { kind: "leaf"; value: LeafValue };

export interface HeightConeInfeasibleBranch {
  sign: HeightArrangementSign;
  outcome: "infeasible";
  certificate: HeightConeFarkasCertificate;
}

export interface HeightConeFeasibleBranch<PruneProof, LeafValue> {
  sign: HeightArrangementSign;
  outcome: "feasible";
  child: HeightConeCoverNode<PruneProof, LeafValue>;
}

export type HeightConeCoverBranch<PruneProof, LeafValue> =
  | HeightConeInfeasibleBranch
  | HeightConeFeasibleBranch<PruneProof, LeafValue>;

export interface HeightConeCoverNode<PruneProof, LeafValue> {
  depth: number;
  constraintDigest: string;
  feasibility: HeightConeFeasibleCertificate;
  decision:
    | {
        kind: "split";
        normal: string[];
        normalKey: string;
        branches: Array<HeightConeCoverBranch<PruneProof, LeafValue>>;
      }
    | { kind: "prune"; proof: PruneProof; proofDigest: string }
    | { kind: "leaf"; value: LeafValue; valueDigest: string }
    | { kind: "zero-character" };
  nodeHash: string;
}

export interface HeightConeCoverCertificate<PruneProof, LeafValue> {
  schemaVersion: 1;
  kind: "exact-ternary-height-cone-cover";
  method: "exact-rational-ternary-cone-splitting";
  rank: number;
  root: HeightConeCoverNode<PruneProof, LeafValue>;
  nodeCount: number;
  splitNodeCount: number;
  pruneLeafCount: number;
  ordinaryLeafCount: number;
  zeroCharacterLeafCount: number;
  infeasibleBranchCount: number;
  checks: {
    rootFeasible: boolean;
    everySplitHasThreeBranches: boolean;
    everyInfeasibleBranchCertified: boolean;
    zeroCharacterSeparated: boolean;
  };
  coverHash: string;
}

export interface BuildHeightConeCoverOptions<PruneProof, LeafValue> {
  rank: number;
  decide(context: HeightConeContext): HeightConeDecision<PruneProof, LeafValue>;
  maxNodes?: number;
  maxIntermediateInequalities?: number;
}

export interface ReplayHeightConeCoverOptions<PruneProof, LeafValue> {
  verifyPrune?: (context: HeightConeContext, proof: PruneProof) => boolean;
  verifyLeaf?: (context: HeightConeContext, value: LeafValue) => boolean;
  maxIntermediateInequalities?: number;
}

export interface HeightConeCoverReplay {
  status: "passed" | "failed";
  checks: {
    storedCoverHashValid: boolean;
    geometryComplete: boolean;
    everyPruneVerified: boolean;
    everyLeafVerified: boolean;
  };
  rebuiltCoverHash: string;
  errors: string[];
}

interface FourierInequality {
  coefficients: Rational[];
  bound: Rational;
  multipliers: Map<number, Rational>;
}

type FourierResult =
  | { feasible: true; solution: Rational[] }
  | { feasible: false; multipliers: Map<number, Rational> };

const ZERO: Rational = Object.freeze({ numerator: 0n, denominator: 1n });
const ONE: Rational = Object.freeze({ numerator: 1n, denominator: 1n });

function bigintAbs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function bigintGcd(left: bigint, right: bigint): bigint {
  let a = bigintAbs(left);
  let b = bigintAbs(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function bigintLcm(left: bigint, right: bigint): bigint {
  if (left === 0n || right === 0n) return 0n;
  return bigintAbs((left / bigintGcd(left, right)) * right);
}

function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new Error("A rational denominator is zero.");
  if (numerator === 0n) return ZERO;
  const sign = denominator < 0n ? -1n : 1n;
  const gcd = bigintGcd(numerator, denominator);
  return {
    numerator: (sign * numerator) / gcd,
    denominator: bigintAbs(denominator) / gcd,
  };
}

function rationalAdd(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function rationalNegate(value: Rational): Rational {
  return rational(-value.numerator, value.denominator);
}

function rationalSubtract(left: Rational, right: Rational): Rational {
  return rationalAdd(left, rationalNegate(right));
}

function rationalMultiply(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function rationalDivide(left: Rational, right: Rational): Rational {
  if (right.numerator === 0n) throw new Error("Division by zero rational.");
  return rational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function rationalCompare(left: Rational, right: Rational): number {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function rationalIsZero(value: Rational): boolean {
  return value.numerator === 0n;
}

function rationalToString(value: Rational): string {
  return value.denominator === 1n
    ? value.numerator.toString()
    : `${value.numerator}/${value.denominator}`;
}

function rationalFromString(value: string): Rational {
  const match = /^(-?(?:0|[1-9][0-9]*))(?:\/([1-9][0-9]*))?$/.exec(value);
  if (!match)
    throw new Error(`Invalid canonical rational ${JSON.stringify(value)}.`);
  const parsed = rational(BigInt(match[1]), BigInt(match[2] ?? "1"));
  if (rationalToString(parsed) !== value) {
    throw new Error(`Rational ${JSON.stringify(value)} is not reduced.`);
  }
  return parsed;
}

function canonicalInteger(
  value: HeightArrangementInteger,
  context: string,
): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${context} must be a safe integer or decimal string.`);
    }
    return BigInt(value);
  }
  if (!/^-?(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${context} is not a canonical decimal integer.`);
  }
  return BigInt(value);
}

function integerVector(
  values: readonly HeightArrangementInteger[],
  context: string,
): bigint[] {
  return values.map((value, index) =>
    canonicalInteger(value, `${context}[${index}]`),
  );
}

function dotInteger(left: readonly bigint[], right: readonly bigint[]): bigint {
  let sum = 0n;
  for (let index = 0; index < left.length; index += 1) {
    sum += left[index] * right[index];
  }
  return sum;
}

function dotRational(
  left: readonly Rational[],
  right: readonly Rational[],
): Rational {
  let sum = ZERO;
  for (let index = 0; index < left.length; index += 1) {
    sum = rationalAdd(sum, rationalMultiply(left[index], right[index]));
  }
  return sum;
}

function primitiveIntegerVector(values: readonly bigint[]): bigint[] {
  let gcd = 0n;
  for (const value of values) gcd = bigintGcd(gcd, value);
  if (gcd === 0n) return [...values];
  return values.map((value) => value / gcd);
}

export function canonicalizeHeightNormal(
  input: readonly HeightArrangementInteger[],
): CanonicalHeightNormal {
  if (input.length === 0 || input.length > 4) {
    throw new RangeError(
      "A height normal must have rank between one and four.",
    );
  }
  const values = integerVector(input, "normal");
  let gcd = 0n;
  for (const value of values) gcd = bigintGcd(gcd, value);
  if (gcd === 0n) {
    const primitive = values.map(() => "0");
    return {
      zero: true,
      primitive,
      multiplier: "0",
      key: primitive.join(","),
    };
  }
  let primitive = values.map((value) => value / gcd);
  const first = primitive.find((value) => value !== 0n)!;
  const orientation = first < 0n ? -1n : 1n;
  if (orientation < 0n) primitive = primitive.map((value) => -value);
  const serialized = primitive.map(String);
  return {
    zero: false,
    primitive: serialized,
    multiplier: (orientation * gcd).toString(),
    key: serialized.join(","),
  };
}

export function canonicalizeAntipodalSigns(
  input: readonly HeightArrangementSign[],
): AntipodalSignRepresentative {
  if (input.some((sign) => sign !== -1 && sign !== 0 && sign !== 1)) {
    throw new Error("An antipodal sign vector contains a non-ternary value.");
  }
  const first = input.find((sign) => sign !== 0) ?? 0;
  const reversed = first < 0;
  const signs = input.map((sign) =>
    sign === 0 ? 0 : reversed ? (-sign as HeightArrangementSign) : sign,
  );
  return {
    signs,
    reversed,
    selfAntipodal: first === 0,
    key: signs.join(","),
  };
}

function assignmentDigest(
  assignments: readonly HeightConeAssignment[],
): string {
  return canonicalSha256(
    assignments.map((assignment) => ({
      normal: assignment.normal,
      normalKey: assignment.normalKey,
      sign: assignment.sign,
    })),
  );
}

function rationalMatrixRank(input: readonly (readonly Rational[])[]): number {
  if (input.length === 0) return 0;
  const matrix = input.map((row) => row.map((value) => value));
  const columnCount = matrix[0].length;
  let pivotRow = 0;
  for (let column = 0; column < columnCount; column += 1) {
    const source = matrix.findIndex(
      (row, index) => index >= pivotRow && !rationalIsZero(row[column]),
    );
    if (source < 0) continue;
    [matrix[pivotRow], matrix[source]] = [matrix[source], matrix[pivotRow]];
    const pivot = matrix[pivotRow][column];
    matrix[pivotRow] = matrix[pivotRow].map((value) =>
      rationalDivide(value, pivot),
    );
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === pivotRow || rationalIsZero(matrix[row][column])) continue;
      const factor = matrix[row][column];
      matrix[row] = matrix[row].map((value, index) =>
        rationalSubtract(
          value,
          rationalMultiply(factor, matrix[pivotRow][index]),
        ),
      );
    }
    pivotRow += 1;
    if (pivotRow === matrix.length) break;
  }
  return pivotRow;
}

function rationalNullspace(
  input: readonly (readonly bigint[])[],
  columnCount: number,
): { basis: Rational[][]; rank: number } {
  if (input.length === 0) {
    return {
      basis: Array.from({ length: columnCount }, (_unused, column) =>
        Array.from({ length: columnCount }, (_unused2, row) =>
          row === column ? ONE : ZERO,
        ),
      ),
      rank: 0,
    };
  }
  const matrix = input.map((row) => row.map((value) => rational(value)));
  const pivots: number[] = [];
  let pivotRow = 0;
  for (let column = 0; column < columnCount; column += 1) {
    const source = matrix.findIndex(
      (row, index) => index >= pivotRow && !rationalIsZero(row[column]),
    );
    if (source < 0) continue;
    [matrix[pivotRow], matrix[source]] = [matrix[source], matrix[pivotRow]];
    const pivot = matrix[pivotRow][column];
    matrix[pivotRow] = matrix[pivotRow].map((value) =>
      rationalDivide(value, pivot),
    );
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === pivotRow || rationalIsZero(matrix[row][column])) continue;
      const factor = matrix[row][column];
      matrix[row] = matrix[row].map((value, index) =>
        rationalSubtract(
          value,
          rationalMultiply(factor, matrix[pivotRow][index]),
        ),
      );
    }
    pivots.push(column);
    pivotRow += 1;
    if (pivotRow === matrix.length) break;
  }
  const pivotSet = new Set(pivots);
  const freeColumns = Array.from(
    { length: columnCount },
    (_unused, column) => column,
  ).filter((column) => !pivotSet.has(column));
  const basis = freeColumns.map((freeColumn) => {
    const vector = Array.from({ length: columnCount }, () => ZERO);
    vector[freeColumn] = ONE;
    for (let row = 0; row < pivots.length; row += 1) {
      vector[pivots[row]] = rationalNegate(matrix[row][freeColumn]);
    }
    return vector;
  });
  return { basis, rank: pivots.length };
}

function scaleMultiplierMap(
  source: ReadonlyMap<number, Rational>,
  factor: Rational,
): Map<number, Rational> {
  const result = new Map<number, Rational>();
  for (const [index, value] of source) {
    const scaled = rationalMultiply(value, factor);
    if (!rationalIsZero(scaled)) result.set(index, scaled);
  }
  return result;
}

function addMultiplierMaps(
  left: ReadonlyMap<number, Rational>,
  right: ReadonlyMap<number, Rational>,
): Map<number, Rational> {
  const result = new Map(left);
  for (const [index, value] of right) {
    const sum = rationalAdd(result.get(index) ?? ZERO, value);
    if (rationalIsZero(sum)) result.delete(index);
    else result.set(index, sum);
  }
  return result;
}

function scaleFourierInequality(
  source: FourierInequality,
  factor: Rational,
): FourierInequality {
  if (rationalCompare(factor, ZERO) < 0) {
    throw new Error("A Fourier inequality was scaled by a negative number.");
  }
  return {
    coefficients: source.coefficients.map((value) =>
      rationalMultiply(value, factor),
    ),
    bound: rationalMultiply(source.bound, factor),
    multipliers: scaleMultiplierMap(source.multipliers, factor),
  };
}

function addFourierInequalities(
  left: FourierInequality,
  right: FourierInequality,
): FourierInequality {
  return {
    coefficients: left.coefficients.map((value, index) =>
      rationalAdd(value, right.coefficients[index]),
    ),
    bound: rationalAdd(left.bound, right.bound),
    multipliers: addMultiplierMaps(left.multipliers, right.multipliers),
  };
}

function normalizeFourierInequality(source: FourierInequality): {
  row: FourierInequality;
  key: string;
} {
  const entries = [...source.coefficients, source.bound];
  let commonDenominator = 1n;
  for (const value of entries) {
    commonDenominator = bigintLcm(commonDenominator, value.denominator);
  }
  const integers = entries.map(
    (value) => value.numerator * (commonDenominator / value.denominator),
  );
  let gcd = 0n;
  for (const value of integers) gcd = bigintGcd(gcd, value);
  if (gcd === 0n) gcd = 1n;
  const factor = rational(commonDenominator, gcd);
  const normalized = scaleFourierInequality(source, factor);
  const normalizedIntegers = integers.map((value) => value / gcd);
  return { row: normalized, key: normalizedIntegers.join(",") };
}

function deduplicateFourierInequalities(
  input: readonly FourierInequality[],
): FourierInequality[] {
  const byKey = new Map<string, FourierInequality>();
  for (const inequality of input) {
    const normalized = normalizeFourierInequality(inequality);
    if (!byKey.has(normalized.key)) byKey.set(normalized.key, normalized.row);
  }
  return [...byKey.values()];
}

function solveFourierMotzkin(
  input: readonly FourierInequality[],
  dimension: number,
  maxIntermediateInequalities: number,
): FourierResult {
  const inequalities = deduplicateFourierInequalities(input);
  if (inequalities.length > maxIntermediateInequalities) {
    throw new RangeError(
      `Fourier-Motzkin generated ${inequalities.length} inequalities, exceeding the exact solver cap ${maxIntermediateInequalities}.`,
    );
  }
  if (dimension === 0) {
    const contradiction = inequalities.find(
      (row) => rationalCompare(row.bound, ZERO) > 0,
    );
    return contradiction
      ? { feasible: false, multipliers: contradiction.multipliers }
      : { feasible: true, solution: [] };
  }

  const last = dimension - 1;
  const positive: FourierInequality[] = [];
  const negative: FourierInequality[] = [];
  const zero: FourierInequality[] = [];
  for (const inequality of inequalities) {
    const comparison = rationalCompare(inequality.coefficients[last], ZERO);
    if (comparison > 0) positive.push(inequality);
    else if (comparison < 0) negative.push(inequality);
    else {
      zero.push({
        ...inequality,
        coefficients: inequality.coefficients.slice(0, last),
      });
    }
  }

  const projected = [...zero];
  if (positive.length > 0 && negative.length > 0) {
    const prospective = projected.length + positive.length * negative.length;
    if (prospective > maxIntermediateInequalities * 4) {
      throw new RangeError(
        `Fourier-Motzkin projection would create ${prospective} pair inequalities beyond the exact solver cap.`,
      );
    }
    for (const lower of positive) {
      const lowerCoefficient = lower.coefficients[last];
      for (const upper of negative) {
        const upperCoefficient = upper.coefficients[last];
        const combined = addFourierInequalities(
          scaleFourierInequality(lower, rationalNegate(upperCoefficient)),
          scaleFourierInequality(upper, lowerCoefficient),
        );
        combined.coefficients = combined.coefficients.slice(0, last);
        if (
          combined.coefficients.every(rationalIsZero) &&
          rationalCompare(combined.bound, ZERO) > 0
        ) {
          return { feasible: false, multipliers: combined.multipliers };
        }
        projected.push(combined);
      }
    }
  }

  const projectedResult = solveFourierMotzkin(
    projected,
    dimension - 1,
    maxIntermediateInequalities,
  );
  if (!projectedResult.feasible) return projectedResult;

  let lowerBound: Rational | undefined;
  let upperBound: Rational | undefined;
  for (const inequality of inequalities) {
    const coefficient = inequality.coefficients[last];
    if (rationalIsZero(coefficient)) continue;
    const prefixValue = dotRational(
      inequality.coefficients.slice(0, last),
      projectedResult.solution,
    );
    const bound = rationalDivide(
      rationalSubtract(inequality.bound, prefixValue),
      coefficient,
    );
    if (rationalCompare(coefficient, ZERO) > 0) {
      if (!lowerBound || rationalCompare(bound, lowerBound) > 0) {
        lowerBound = bound;
      }
    } else if (!upperBound || rationalCompare(bound, upperBound) < 0) {
      upperBound = bound;
    }
  }
  if (lowerBound && upperBound && rationalCompare(lowerBound, upperBound) > 0) {
    throw new Error("Fourier-Motzkin back-substitution found inverted bounds.");
  }
  const coordinate = lowerBound ?? upperBound ?? ZERO;
  const solution = [...projectedResult.solution, coordinate];
  for (const inequality of inequalities) {
    if (
      rationalCompare(
        dotRational(inequality.coefficients, solution),
        inequality.bound,
      ) < 0
    ) {
      throw new Error("Fourier-Motzkin produced an invalid feasible witness.");
    }
  }
  return { feasible: true, solution };
}

function selectIndependentRows(rows: readonly (readonly bigint[])[]): number[] {
  const selected: number[] = [];
  let rank = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const candidateRows = [...selected, index].map((row) =>
      rows[row].map((value) => rational(value)),
    );
    const candidateRank = rationalMatrixRank(candidateRows);
    if (candidateRank > rank) {
      selected.push(index);
      rank = candidateRank;
    }
  }
  return selected;
}

function solveUniqueLinearSystem(
  coefficients: readonly (readonly Rational[])[],
  targets: readonly Rational[],
  variableCount: number,
): Rational[] {
  const matrix = coefficients.map((row, index) => [...row, targets[index]]);
  const pivots = new Map<number, number>();
  let pivotRow = 0;
  for (let column = 0; column < variableCount; column += 1) {
    const source = matrix.findIndex(
      (row, index) => index >= pivotRow && !rationalIsZero(row[column]),
    );
    if (source < 0) continue;
    [matrix[pivotRow], matrix[source]] = [matrix[source], matrix[pivotRow]];
    const pivot = matrix[pivotRow][column];
    matrix[pivotRow] = matrix[pivotRow].map((value) =>
      rationalDivide(value, pivot),
    );
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === pivotRow || rationalIsZero(matrix[row][column])) continue;
      const factor = matrix[row][column];
      matrix[row] = matrix[row].map((value, index) =>
        rationalSubtract(
          value,
          rationalMultiply(factor, matrix[pivotRow][index]),
        ),
      );
    }
    pivots.set(column, pivotRow);
    pivotRow += 1;
  }
  for (const row of matrix) {
    if (
      row.slice(0, variableCount).every(rationalIsZero) &&
      !rationalIsZero(row[variableCount])
    ) {
      throw new Error("The exact linear system is inconsistent.");
    }
  }
  if (pivots.size !== variableCount) {
    throw new Error("The exact linear system does not have a unique solution.");
  }
  return Array.from(
    { length: variableCount },
    (_unused, column) => matrix[pivots.get(column)!][variableCount],
  );
}

function rationalVectorToPrimitiveInteger(
  values: readonly Rational[],
): bigint[] {
  let denominatorLcm = 1n;
  for (const value of values) {
    denominatorLcm = bigintLcm(denominatorLcm, value.denominator);
  }
  return primitiveIntegerVector(
    values.map(
      (value) => value.numerator * (denominatorLcm / value.denominator),
    ),
  );
}

function certificateHash<T extends { certificateHash: string }>(
  certificate: T,
): string {
  return canonicalSha256({ ...certificate, certificateHash: "" });
}

/**
 * Decide one relatively open rational cone exactly.
 *
 * Nonzero sign constraints are homogeneous and strict. They have a rational
 * solution iff, after rescaling that solution, the corresponding inequalities
 * have right-hand side one. Fourier--Motzkin is used only to discover either
 * a point or a dual obstruction. Replay trusts neither the elimination nor
 * floating point: it checks a primitive integer point or Farkas identity
 * directly with bigint rational arithmetic.
 */
export function certifyHeightCone(
  rank: number,
  assignments: readonly HeightConeAssignment[],
  maxIntermediateInequalities = 250_000,
): HeightConeFeasibilityCertificate {
  if (!Number.isInteger(rank) || rank < 1 || rank > 4) {
    throw new RangeError(
      "The exact height-cone solver supports ranks one through four.",
    );
  }
  if (
    !Number.isInteger(maxIntermediateInequalities) ||
    maxIntermediateInequalities < 1
  ) {
    throw new RangeError(
      "The Fourier-Motzkin inequality cap must be positive.",
    );
  }
  const seenNormals = new Set<string>();
  const equalityRows: bigint[][] = [];
  const equalityAssignmentIndices: number[] = [];
  const inequalityRows: bigint[][] = [];
  const inequalityAssignmentIndices: number[] = [];
  assignments.forEach((assignment, assignmentIndex) => {
    const canonical = canonicalizeHeightNormal(assignment.normal);
    if (canonical.zero || canonical.key !== assignment.normalKey) {
      throw new Error(
        `Cone assignment ${assignmentIndex} has a noncanonical normal.`,
      );
    }
    if (canonical.primitive.length !== rank) {
      throw new Error(`Cone assignment ${assignmentIndex} has the wrong rank.`);
    }
    if (seenNormals.has(canonical.key)) {
      throw new Error(
        `Cone normal ${canonical.key} is assigned more than once.`,
      );
    }
    seenNormals.add(canonical.key);
    if (
      assignment.sign !== -1 &&
      assignment.sign !== 0 &&
      assignment.sign !== 1
    ) {
      throw new Error(
        `Cone assignment ${assignmentIndex} has an invalid sign.`,
      );
    }
    const normal = canonical.primitive.map(BigInt);
    if (assignment.sign === 0) {
      equalityRows.push(normal);
      equalityAssignmentIndices.push(assignmentIndex);
    } else {
      inequalityRows.push(
        normal.map((value) => value * BigInt(assignment.sign)),
      );
      inequalityAssignmentIndices.push(assignmentIndex);
    }
  });

  const nullspace = rationalNullspace(equalityRows, rank);
  const dimension = rank - nullspace.rank;
  if (inequalityRows.length === 0) {
    const primitiveWitness =
      dimension === 0
        ? null
        : rationalVectorToPrimitiveInteger(nullspace.basis[0]).map(String);
    const withoutHash = {
      kind: "feasible" as const,
      dimension,
      primitiveWitness,
      certificateHash: "",
    };
    return {
      ...withoutHash,
      certificateHash: certificateHash(withoutHash),
    };
  }

  const inequalities: FourierInequality[] = inequalityRows.map(
    (row, inequalityIndex) => ({
      coefficients: nullspace.basis.map((basisVector) =>
        dotRational(
          row.map((value) => rational(value)),
          basisVector,
        ),
      ),
      bound: ONE,
      multipliers: new Map([[inequalityIndex, ONE]]),
    }),
  );
  const solved = solveFourierMotzkin(
    inequalities,
    dimension,
    maxIntermediateInequalities,
  );
  if (solved.feasible) {
    const ambient = Array.from({ length: rank }, () => ZERO);
    for (let basisIndex = 0; basisIndex < dimension; basisIndex += 1) {
      for (let coordinate = 0; coordinate < rank; coordinate += 1) {
        ambient[coordinate] = rationalAdd(
          ambient[coordinate],
          rationalMultiply(
            nullspace.basis[basisIndex][coordinate],
            solved.solution[basisIndex],
          ),
        );
      }
    }
    const primitive = rationalVectorToPrimitiveInteger(ambient);
    if (primitive.every((value) => value === 0n)) {
      throw new Error("A strict height cone produced the zero witness.");
    }
    const withoutHash = {
      kind: "feasible" as const,
      dimension,
      primitiveWitness: primitive.map(String),
      certificateHash: "",
    };
    return {
      ...withoutHash,
      certificateHash: certificateHash(withoutHash),
    };
  }

  const inequalityMultipliers = [...solved.multipliers.entries()]
    .filter(([, value]) => !rationalIsZero(value))
    .sort(([left], [right]) => left - right);
  const combinedRow = Array.from({ length: rank }, () => ZERO);
  for (const [inequalityIndex, multiplier] of inequalityMultipliers) {
    for (let coordinate = 0; coordinate < rank; coordinate += 1) {
      combinedRow[coordinate] = rationalAdd(
        combinedRow[coordinate],
        rationalMultiply(
          multiplier,
          rational(inequalityRows[inequalityIndex][coordinate]),
        ),
      );
    }
  }
  const independentEqualityRows = selectIndependentRows(equalityRows);
  const equalityMultipliers: Array<[number, Rational]> = [];
  if (independentEqualityRows.length > 0) {
    const coefficientRows = Array.from(
      { length: rank },
      (_unused, coordinate) =>
        independentEqualityRows.map((rowIndex) =>
          rational(equalityRows[rowIndex][coordinate]),
        ),
    );
    const solution = solveUniqueLinearSystem(
      coefficientRows,
      combinedRow.map(rationalNegate),
      independentEqualityRows.length,
    );
    solution.forEach((value, index) => {
      if (!rationalIsZero(value)) {
        equalityMultipliers.push([independentEqualityRows[index], value]);
      }
    });
  } else if (combinedRow.some((value) => !rationalIsZero(value))) {
    throw new Error(
      "A Fourier contradiction did not lift through the equality space.",
    );
  }
  const withoutHash = {
    kind: "infeasible" as const,
    inequalityMultipliers: inequalityMultipliers.map(
      ([inequalityIndex, value]) => ({
        assignmentIndex: inequalityAssignmentIndices[inequalityIndex],
        value: rationalToString(value),
      }),
    ),
    equalityMultipliers: equalityMultipliers.map(([equalityIndex, value]) => ({
      assignmentIndex: equalityAssignmentIndices[equalityIndex],
      value: rationalToString(value),
    })),
    certificateHash: "",
  };
  return {
    ...withoutHash,
    certificateHash: certificateHash(withoutHash),
  };
}

export function replayHeightConeCertificate(
  rank: number,
  assignments: readonly HeightConeAssignment[],
  certificate: HeightConeFeasibilityCertificate,
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  if (certificate.certificateHash !== certificateHash(certificate)) {
    errors.push("The stored cone-certificate hash is invalid.");
  }
  let parsedAssignments: Array<{
    normal: bigint[];
    sign: HeightArrangementSign;
  }> = [];
  try {
    if (!Number.isInteger(rank) || rank < 1 || rank > 4) {
      throw new Error("The cone rank is outside one through four.");
    }
    const keys = new Set<string>();
    parsedAssignments = assignments.map((assignment, index) => {
      const canonical = canonicalizeHeightNormal(assignment.normal);
      if (
        canonical.zero ||
        canonical.key !== assignment.normalKey ||
        canonical.primitive.length !== rank
      ) {
        throw new Error(
          `Assignment ${index} is not a canonical rank-${rank} normal.`,
        );
      }
      if (keys.has(canonical.key)) {
        throw new Error(
          `Assignment ${index} duplicates normal ${canonical.key}.`,
        );
      }
      if (
        assignment.sign !== -1 &&
        assignment.sign !== 0 &&
        assignment.sign !== 1
      ) {
        throw new Error(`Assignment ${index} has a non-ternary sign.`);
      }
      keys.add(canonical.key);
      return {
        normal: canonical.primitive.map(BigInt),
        sign: assignment.sign,
      };
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { passed: false, errors };
  }

  if (certificate.kind === "feasible") {
    const equalityRows = parsedAssignments
      .filter((assignment) => assignment.sign === 0)
      .map((assignment) => assignment.normal.map((value) => rational(value)));
    const expectedDimension = rank - rationalMatrixRank(equalityRows);
    if (certificate.dimension !== expectedDimension) {
      errors.push("The feasible cone dimension is incorrect.");
    }
    if (certificate.primitiveWitness === null) {
      if (expectedDimension !== 0) {
        errors.push(
          "A positive-dimensional cone is missing its primitive witness.",
        );
      }
      if (parsedAssignments.some((assignment) => assignment.sign !== 0)) {
        errors.push("A strict cone was mislabeled as the zero cone.");
      }
    } else {
      try {
        if (certificate.primitiveWitness.length !== rank) {
          throw new Error("The primitive witness has the wrong rank.");
        }
        const witness = certificate.primitiveWitness.map((value) =>
          canonicalInteger(value, "primitive witness"),
        );
        let gcd = 0n;
        for (const value of witness) gcd = bigintGcd(gcd, value);
        if (gcd !== 1n) errors.push("The cone witness is not primitive.");
        for (const assignment of parsedAssignments) {
          const value = dotInteger(assignment.normal, witness);
          if (assignment.sign === 0 && value !== 0n) {
            errors.push("The cone witness violates a zero-sign equality.");
          } else if (
            assignment.sign !== 0 &&
            value * BigInt(assignment.sign) <= 0n
          ) {
            errors.push("The cone witness violates a strict sign constraint.");
          }
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  } else {
    try {
      const total = Array.from({ length: rank }, () => ZERO);
      let positiveMass = ZERO;
      const seenInequalities = new Set<number>();
      for (const entry of certificate.inequalityMultipliers) {
        if (
          !Number.isInteger(entry.assignmentIndex) ||
          entry.assignmentIndex < 0 ||
          entry.assignmentIndex >= parsedAssignments.length ||
          seenInequalities.has(entry.assignmentIndex)
        ) {
          throw new Error("A Farkas inequality index is invalid or repeated.");
        }
        seenInequalities.add(entry.assignmentIndex);
        const assignment = parsedAssignments[entry.assignmentIndex];
        if (assignment.sign === 0) {
          throw new Error(
            "A Farkas inequality multiplier references an equality.",
          );
        }
        const multiplier = rationalFromString(entry.value);
        if (rationalCompare(multiplier, ZERO) < 0) {
          throw new Error("A Farkas inequality multiplier is negative.");
        }
        positiveMass = rationalAdd(positiveMass, multiplier);
        for (let coordinate = 0; coordinate < rank; coordinate += 1) {
          total[coordinate] = rationalAdd(
            total[coordinate],
            rationalMultiply(
              multiplier,
              rational(assignment.normal[coordinate] * BigInt(assignment.sign)),
            ),
          );
        }
      }
      const seenEqualities = new Set<number>();
      for (const entry of certificate.equalityMultipliers) {
        if (
          !Number.isInteger(entry.assignmentIndex) ||
          entry.assignmentIndex < 0 ||
          entry.assignmentIndex >= parsedAssignments.length ||
          seenEqualities.has(entry.assignmentIndex)
        ) {
          throw new Error("A Farkas equality index is invalid or repeated.");
        }
        seenEqualities.add(entry.assignmentIndex);
        const assignment = parsedAssignments[entry.assignmentIndex];
        if (assignment.sign !== 0) {
          throw new Error(
            "A Farkas equality multiplier references an inequality.",
          );
        }
        const multiplier = rationalFromString(entry.value);
        for (let coordinate = 0; coordinate < rank; coordinate += 1) {
          total[coordinate] = rationalAdd(
            total[coordinate],
            rationalMultiply(
              multiplier,
              rational(assignment.normal[coordinate]),
            ),
          );
        }
      }
      if (rationalCompare(positiveMass, ZERO) <= 0) {
        errors.push("The Farkas certificate has no positive inequality mass.");
      }
      if (total.some((value) => !rationalIsZero(value))) {
        errors.push("The Farkas linear combination does not vanish.");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { passed: errors.length === 0, errors: [...new Set(errors)].sort() };
}

function nodeHash<PruneProof, LeafValue>(
  node: HeightConeCoverNode<PruneProof, LeafValue>,
): string {
  const decision =
    node.decision.kind === "split"
      ? {
          ...node.decision,
          branches: node.decision.branches.map((branch) =>
            branch.outcome === "infeasible"
              ? branch
              : {
                  sign: branch.sign,
                  outcome: branch.outcome,
                  childHash: branch.child.nodeHash,
                },
          ),
        }
      : node.decision;
  return canonicalSha256({
    depth: node.depth,
    constraintDigest: node.constraintDigest,
    feasibility: node.feasibility,
    decision,
    nodeHash: "",
  });
}

/**
 * Build an exact cone-cover tree. Every split records all three intersections
 * with a central hyperplane. A missing child is allowed only with a replayable
 * Farkas certificate, so induction from the root proves that terminal nodes
 * cover character space, including lower-dimensional zero-sign faces.
 */
export function buildExactTernaryHeightConeCover<PruneProof, LeafValue>(
  options: BuildHeightConeCoverOptions<PruneProof, LeafValue>,
): HeightConeCoverCertificate<PruneProof, LeafValue> {
  if (!Number.isInteger(options.rank) || options.rank < 1 || options.rank > 4) {
    throw new RangeError(
      "The exact cone-cover engine supports ranks one through four.",
    );
  }
  const maxNodes = options.maxNodes ?? 1_000_000;
  const maxIntermediateInequalities =
    options.maxIntermediateInequalities ?? 250_000;
  if (!Number.isInteger(maxNodes) || maxNodes < 1) {
    throw new RangeError("The cone-cover node cap must be positive.");
  }
  let nodeCount = 0;
  let splitNodeCount = 0;
  let pruneLeafCount = 0;
  let ordinaryLeafCount = 0;
  let zeroCharacterLeafCount = 0;
  let infeasibleBranchCount = 0;

  const buildNode = (
    assignments: HeightConeAssignment[],
    suppliedFeasibility?: HeightConeFeasibleCertificate,
  ): HeightConeCoverNode<PruneProof, LeafValue> => {
    nodeCount += 1;
    if (nodeCount > maxNodes) {
      throw new RangeError(`The cone-cover node cap ${maxNodes} was exceeded.`);
    }
    const feasibility =
      suppliedFeasibility ??
      (() => {
        const certificate = certifyHeightCone(
          options.rank,
          assignments,
          maxIntermediateInequalities,
        );
        if (certificate.kind !== "feasible") {
          throw new Error("The cone-cover builder entered an infeasible node.");
        }
        return certificate;
      })();
    const constraintDigest = assignmentDigest(assignments);
    const context: HeightConeContext = {
      rank: options.rank,
      assignments,
      feasibility,
      depth: assignments.length,
      constraintDigest,
    };
    let decision: HeightConeCoverNode<PruneProof, LeafValue>["decision"];
    if (feasibility.dimension === 0) {
      if (feasibility.primitiveWitness !== null) {
        throw new Error(
          "A zero-dimensional central cone has a nonzero witness.",
        );
      }
      zeroCharacterLeafCount += 1;
      decision = { kind: "zero-character" };
    } else {
      const requested = options.decide(context);
      // A central cone contains the zero character exactly while every
      // assigned sign is zero.  Do not let an adaptive pruning/leaf callback
      // silently absorb that point: the all-zero branch must keep splitting
      // until its equality space is zero-dimensional and is recorded by the
      // dedicated zero-character leaf above.
      if (
        requested.kind !== "split" &&
        assignments.every((assignment) => assignment.sign === 0)
      ) {
        throw new Error(
          "A positive-dimensional cone containing the zero character must be split before it can be pruned or stored as a leaf.",
        );
      }
      if (requested.kind === "prune") {
        pruneLeafCount += 1;
        decision = {
          kind: "prune",
          proof: requested.proof,
          proofDigest: canonicalSha256(requested.proof),
        };
      } else if (requested.kind === "leaf") {
        ordinaryLeafCount += 1;
        decision = {
          kind: "leaf",
          value: requested.value,
          valueDigest: canonicalSha256(requested.value),
        };
      } else {
        const canonical = canonicalizeHeightNormal(requested.normal);
        if (canonical.zero || canonical.primitive.length !== options.rank) {
          throw new Error(
            "A cone split needs a nonzero normal of the declared rank.",
          );
        }
        if (
          assignments.some(
            (assignment) => assignment.normalKey === canonical.key,
          )
        ) {
          throw new Error(`Cone normal ${canonical.key} is already assigned.`);
        }
        splitNodeCount += 1;
        const branches: Array<HeightConeCoverBranch<PruneProof, LeafValue>> =
          [];
        for (const sign of [-1, 0, 1] as const) {
          const childAssignments = [
            ...assignments,
            {
              normal: canonical.primitive,
              normalKey: canonical.key,
              sign,
            },
          ];
          const childFeasibility = certifyHeightCone(
            options.rank,
            childAssignments,
            maxIntermediateInequalities,
          );
          if (childFeasibility.kind === "infeasible") {
            infeasibleBranchCount += 1;
            branches.push({
              sign,
              outcome: "infeasible",
              certificate: childFeasibility,
            });
          } else {
            branches.push({
              sign,
              outcome: "feasible",
              child: buildNode(childAssignments, childFeasibility),
            });
          }
        }
        decision = {
          kind: "split",
          normal: canonical.primitive,
          normalKey: canonical.key,
          branches,
        };
      }
    }
    const node: HeightConeCoverNode<PruneProof, LeafValue> = {
      depth: assignments.length,
      constraintDigest,
      feasibility,
      decision,
      nodeHash: "",
    };
    node.nodeHash = nodeHash(node);
    return node;
  };

  const root = buildNode([]);
  const checks = {
    rootFeasible: root.feasibility.kind === "feasible",
    everySplitHasThreeBranches: true,
    everyInfeasibleBranchCertified: true,
    zeroCharacterSeparated: true,
  };
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: "exact-ternary-height-cone-cover" as const,
    method: "exact-rational-ternary-cone-splitting" as const,
    rank: options.rank,
    root,
    nodeCount,
    splitNodeCount,
    pruneLeafCount,
    ordinaryLeafCount,
    zeroCharacterLeafCount,
    infeasibleBranchCount,
    checks,
    coverHash: "",
  };
  return {
    ...withoutHash,
    coverHash: canonicalSha256(withoutHash),
  };
}

export function replayExactTernaryHeightConeCover<PruneProof, LeafValue>(
  stored: HeightConeCoverCertificate<PruneProof, LeafValue>,
  options: ReplayHeightConeCoverOptions<PruneProof, LeafValue> = {},
): HeightConeCoverReplay {
  const errors: string[] = [];
  const storedCoverHashValid =
    stored.coverHash === canonicalSha256({ ...stored, coverHash: "" });
  if (!storedCoverHashValid)
    errors.push("The stored cone-cover hash is invalid.");
  let nodeCount = 0;
  let splitNodeCount = 0;
  let pruneLeafCount = 0;
  let ordinaryLeafCount = 0;
  let zeroCharacterLeafCount = 0;
  let infeasibleBranchCount = 0;
  let geometryComplete = true;
  let everyPruneVerified = true;
  let everyLeafVerified = true;
  const maxIntermediateInequalities =
    options.maxIntermediateInequalities ?? 250_000;

  const visit = (
    node: HeightConeCoverNode<PruneProof, LeafValue>,
    assignments: HeightConeAssignment[],
  ): void => {
    nodeCount += 1;
    const constraintDigest = assignmentDigest(assignments);
    if (
      node.depth !== assignments.length ||
      node.constraintDigest !== constraintDigest
    ) {
      geometryComplete = false;
      errors.push("A cone-cover node has the wrong constraint path.");
    }
    const replay = replayHeightConeCertificate(
      stored.rank,
      assignments,
      node.feasibility,
    );
    if (!replay.passed || node.feasibility.kind !== "feasible") {
      geometryComplete = false;
      errors.push(
        ...replay.errors,
        "A cone-cover node is not certified feasible.",
      );
      return;
    }
    const context: HeightConeContext = {
      rank: stored.rank,
      assignments,
      feasibility: node.feasibility,
      depth: assignments.length,
      constraintDigest,
    };
    if (node.decision.kind === "zero-character") {
      zeroCharacterLeafCount += 1;
      if (
        node.feasibility.dimension !== 0 ||
        node.feasibility.primitiveWitness !== null
      ) {
        geometryComplete = false;
        errors.push("A zero-character leaf is not the zero cone.");
      }
    } else if (node.decision.kind === "prune") {
      pruneLeafCount += 1;
      if (assignments.every((assignment) => assignment.sign === 0)) {
        geometryComplete = false;
        errors.push(
          "A pruning leaf contains the zero character instead of separating it.",
        );
      }
      if (node.decision.proofDigest !== canonicalSha256(node.decision.proof)) {
        everyPruneVerified = false;
        errors.push("A pruning proof digest is invalid.");
      }
      if (
        !options.verifyPrune ||
        !options.verifyPrune(context, node.decision.proof)
      ) {
        everyPruneVerified = false;
        errors.push("A pruning leaf lacks a verified external proof.");
      }
    } else if (node.decision.kind === "leaf") {
      ordinaryLeafCount += 1;
      if (assignments.every((assignment) => assignment.sign === 0)) {
        geometryComplete = false;
        errors.push(
          "An ordinary leaf contains the zero character instead of separating it.",
        );
      }
      if (node.decision.valueDigest !== canonicalSha256(node.decision.value)) {
        everyLeafVerified = false;
        errors.push("A leaf value digest is invalid.");
      }
      if (
        !options.verifyLeaf ||
        !options.verifyLeaf(context, node.decision.value)
      ) {
        everyLeafVerified = false;
        errors.push("An ordinary leaf lacks a verified external proof.");
      }
    } else {
      splitNodeCount += 1;
      const canonical = canonicalizeHeightNormal(node.decision.normal);
      if (
        canonical.zero ||
        canonical.key !== node.decision.normalKey ||
        canonical.primitive.length !== stored.rank ||
        assignments.some((assignment) => assignment.normalKey === canonical.key)
      ) {
        geometryComplete = false;
        errors.push("A split uses an invalid or repeated normal.");
        return;
      }
      const signs = node.decision.branches.map((branch) => branch.sign);
      if (
        node.decision.branches.length !== 3 ||
        signs[0] !== -1 ||
        signs[1] !== 0 ||
        signs[2] !== 1
      ) {
        geometryComplete = false;
        errors.push(
          "A ternary split does not contain canonical -/0/+ branches.",
        );
        return;
      }
      for (const branch of node.decision.branches) {
        const childAssignments = [
          ...assignments,
          {
            normal: canonical.primitive,
            normalKey: canonical.key,
            sign: branch.sign,
          },
        ];
        if (branch.outcome === "infeasible") {
          infeasibleBranchCount += 1;
          const branchReplay = replayHeightConeCertificate(
            stored.rank,
            childAssignments,
            branch.certificate,
          );
          if (
            !branchReplay.passed ||
            branch.certificate.kind !== "infeasible"
          ) {
            geometryComplete = false;
            errors.push(
              ...branchReplay.errors,
              "An omitted ternary branch lacks an exact infeasibility certificate.",
            );
          }
        } else {
          visit(branch.child, childAssignments);
        }
      }
    }
    if (node.nodeHash !== nodeHash(node)) {
      geometryComplete = false;
      errors.push("A cone-cover node hash is invalid.");
    }
  };

  try {
    if (
      stored.schemaVersion !== 1 ||
      stored.kind !== "exact-ternary-height-cone-cover" ||
      stored.method !== "exact-rational-ternary-cone-splitting" ||
      !Number.isInteger(stored.rank) ||
      stored.rank < 1 ||
      stored.rank > 4
    ) {
      throw new Error("The cone-cover envelope is invalid.");
    }
    // Rebuilding branch feasibility is optional; arithmetic certificate replay
    // above is independent of the solver that originally found each witness.
    void maxIntermediateInequalities;
    visit(stored.root, []);
  } catch (error) {
    geometryComplete = false;
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (
    nodeCount !== stored.nodeCount ||
    splitNodeCount !== stored.splitNodeCount ||
    pruneLeafCount !== stored.pruneLeafCount ||
    ordinaryLeafCount !== stored.ordinaryLeafCount ||
    zeroCharacterLeafCount !== stored.zeroCharacterLeafCount ||
    infeasibleBranchCount !== stored.infeasibleBranchCount
  ) {
    geometryComplete = false;
    errors.push("The stored cone-cover census is incorrect.");
  }
  const recomputedChecks = {
    rootFeasible: stored.root.feasibility.kind === "feasible",
    everySplitHasThreeBranches: geometryComplete,
    everyInfeasibleBranchCertified: geometryComplete,
    zeroCharacterSeparated: geometryComplete,
  };
  if (
    canonicalSha256(stored.checks) !== canonicalSha256(recomputedChecks) ||
    !Object.values(stored.checks).every(Boolean)
  ) {
    geometryComplete = false;
    errors.push("The stored cone-cover checks are incorrect.");
  }
  const rebuiltCoverHash = canonicalSha256({ ...stored, coverHash: "" });
  const checks = {
    storedCoverHashValid,
    geometryComplete,
    everyPruneVerified,
    everyLeafVerified,
  };
  return {
    status:
      errors.length === 0 && Object.values(checks).every(Boolean)
        ? "passed"
        : "failed",
    checks,
    rebuiltCoverHash,
    errors: [...new Set(errors)].sort(),
  };
}
