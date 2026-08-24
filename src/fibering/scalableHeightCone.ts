import { canonicalSha256 } from "../utils/canonicalSha256";

export type ScalableConeInteger = number | string | bigint;
export type ScalableConeSign = -1 | 0 | 1;
export type ObstructionPrunedConeTraversalStrategy =
  | "canonical"
  | "witness-last";

export interface ScalableConeAssignment {
  normal: string[];
  normalKey: string;
  sign: ScalableConeSign;
}

export interface ExactConeOracleRequest {
  schemaVersion: 1;
  kind: "exact-height-cone-oracle-request";
  sourceHash: string;
  rank: number;
  assignments: ScalableConeAssignment[];
  constraintDigest: string;
  requestHash: string;
}

export interface ExactConeOracleBackendMetadata {
  id: string;
  version: string;
  algorithm: string;
  transcriptSha256: string;
}

export interface ExactConeOracleFeasibleResult {
  kind: "feasible";
  equalityRank: number;
  dimension: number;
  /** Null exactly when the equality space is the zero vector space. */
  primitiveWitness: string[] | null;
}

export interface ExactConeOracleInfeasibleResult {
  kind: "infeasible";
  inequalityMultipliers: Array<{
    assignmentIndex: number;
    value: string;
  }>;
  equalityMultipliers: Array<{
    assignmentIndex: number;
    value: string;
  }>;
}

export interface ExactConeOracleCertificate {
  schemaVersion: 1;
  kind: "external-exact-height-cone-certificate";
  requestHash: string;
  backend: ExactConeOracleBackendMetadata;
  result: ExactConeOracleFeasibleResult | ExactConeOracleInfeasibleResult;
  certificateHash: string;
}

export interface ExactConeOracleReplay {
  passed: boolean;
  errors: string[];
}

export interface ExactConeFeasibilityOracle {
  solve(request: ExactConeOracleRequest): ExactConeOracleCertificate;
}

export interface AsyncExactConeFeasibilityOracle {
  solve(request: ExactConeOracleRequest): Promise<ExactConeOracleCertificate>;
}

export interface ObstructionPrunedConeContext {
  request: ExactConeOracleRequest;
  certificate: ExactConeOracleCertificate;
  feasibility: ExactConeOracleFeasibleResult;
  depth: number;
}

export type ObstructionPrunedConeDecision<PruneProof, Survivor> =
  | { kind: "split"; normal: readonly ScalableConeInteger[] }
  | { kind: "prune"; proof: PruneProof }
  | { kind: "survivor"; value: Survivor };

export interface ObstructionPrunedInfeasibleBranch {
  sign: ScalableConeSign;
  outcome: "infeasible";
  requestHash: string;
  certificate: ExactConeOracleCertificate;
}

export interface ObstructionPrunedFeasibleBranch<PruneProof, Survivor> {
  sign: ScalableConeSign;
  outcome: "feasible";
  child: ObstructionPrunedConeNode<PruneProof, Survivor>;
}

export type ObstructionPrunedConeBranch<PruneProof, Survivor> =
  | ObstructionPrunedInfeasibleBranch
  | ObstructionPrunedFeasibleBranch<PruneProof, Survivor>;

export interface ObstructionPrunedConeNode<PruneProof, Survivor> {
  depth: number;
  constraintDigest: string;
  requestHash: string;
  feasibility: ExactConeOracleCertificate;
  decision:
    | {
        kind: "split";
        normal: string[];
        normalKey: string;
        branches: Array<ObstructionPrunedConeBranch<PruneProof, Survivor>>;
      }
    | { kind: "prune"; proof: PruneProof; proofDigest: string }
    | { kind: "survivor"; value: Survivor; valueDigest: string }
    | { kind: "zero-character" };
  nodeHash: string;
}

export interface ObstructionPrunedConeCover<PruneProof, Survivor> {
  schemaVersion: 1;
  kind: "oracle-backed-obstruction-pruned-cone-cover";
  method: "lazy-ternary-splits-with-exact-oracle-certificates";
  sourceHash: string;
  rank: number;
  root: ObstructionPrunedConeNode<PruneProof, Survivor>;
  nodeCount: number;
  oracleQueryCount: number;
  splitNodeCount: number;
  pruneLeafCount: number;
  survivorLeafCount: number;
  zeroCharacterLeafCount: number;
  infeasibleBranchCount: number;
  coverHash: string;
}

export interface BuildObstructionPrunedConeCoverOptions<PruneProof, Survivor> {
  sourceHash: string;
  rank: number;
  oracle: ExactConeFeasibilityOracle;
  decide(
    context: ObstructionPrunedConeContext,
  ): ObstructionPrunedConeDecision<PruneProof, Survivor>;
  maxNodes?: number;
  maxOracleQueries?: number;
}

export type BuildObstructionPrunedConeCoverAsyncOptions<PruneProof, Survivor> =
  Omit<
    BuildObstructionPrunedConeCoverOptions<PruneProof, Survivor>,
    "oracle"
  > & {
    oracle: AsyncExactConeFeasibilityOracle;
    /**
     * Operational DFS order only. Completed covers are always stored in the
     * canonical -1,0,+1 order and therefore have the same proof hash.
     */
    traversalStrategy?: ObstructionPrunedConeTraversalStrategy;
  };

export interface OperationalFirstSurvivorHit<Survivor> {
  schemaVersion: 1;
  kind: "operational-first-survivor-hit";
  method: "depth-first-lazy-ternary-splits-with-exact-oracle-certificates";
  proofStatus: "operational-only-not-an-exhaustive-cover";
  sourceHash: string;
  rank: number;
  depth: number;
  request: ExactConeOracleRequest;
  certificate: ExactConeOracleCertificate;
  value: Survivor;
  valueDigest: string;
  visitedFeasibleNodeCount: number;
  oracleQueryCount: number;
  openedSplitNodeCount: number;
  completedPruneLeafCount: number;
  completedZeroCharacterLeafCount: number;
  infeasibleBranchCount: number;
  hitHash: string;
}

export type FirstSurvivorOrObstructionPrunedConeCover<PruneProof, Survivor> =
  | OperationalFirstSurvivorHit<Survivor>
  | ObstructionPrunedConeCover<PruneProof, Survivor>;

export type SearchFirstSurvivorOrBuildObstructionPrunedConeCoverAsyncOptions<
  PruneProof,
  Survivor,
> = BuildObstructionPrunedConeCoverAsyncOptions<PruneProof, Survivor> & {
  /**
   * A survivor ends the DFS only after the caller's independent checker accepts
   * it in the exact feasible-cone context returned by the oracle.
   */
  verifySurvivor(
    context: ObstructionPrunedConeContext,
    value: Survivor,
  ): boolean;
};

export interface ReplayOperationalFirstSurvivorHitOptions<Survivor> {
  verifySurvivor(
    context: ObstructionPrunedConeContext,
    value: Survivor,
  ): boolean;
}

export interface OperationalFirstSurvivorHitReplay {
  status: "passed" | "failed";
  checks: {
    storedHitHashValid: boolean;
    requestEnvelopeValid: boolean;
    oracleCertificateValid: boolean;
    survivorDigestValid: boolean;
    censusValid: boolean;
    survivorVerified: boolean;
  };
  errors: string[];
}

export interface DeriveAntipodalObstructionPrunedConeCoverOptions<
  PruneProof,
  Survivor,
> {
  source: ObstructionPrunedConeCover<PruneProof, Survivor>;
  /** Decision rule for the opposite offset polarity. */
  decide(
    context: ObstructionPrunedConeContext,
  ): ObstructionPrunedConeDecision<PruneProof, Survivor>;
}

export interface ReplayObstructionPrunedConeCoverOptions<PruneProof, Survivor> {
  verifyPrune?: (
    context: ObstructionPrunedConeContext,
    proof: PruneProof,
  ) => boolean;
  verifySurvivor?: (
    context: ObstructionPrunedConeContext,
    value: Survivor,
  ) => boolean;
}

export interface ObstructionPrunedConeCoverReplay {
  status: "passed" | "failed";
  checks: {
    storedCoverHashValid: boolean;
    geometryComplete: boolean;
    everyOracleCertificateValid: boolean;
    everyPruneVerified: boolean;
    everySurvivorVerified: boolean;
  };
  errors: string[];
}

interface Rational {
  numerator: bigint;
  denominator: bigint;
}

const MAX_SCALABLE_RANK = 256;

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function canonicalInteger(value: ScalableConeInteger, context: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${context} must be a safe integer or decimal string.`);
    }
    return BigInt(value);
  }
  if (!/^(0|-?[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${context} is not a canonical decimal integer.`);
  }
  return BigInt(value);
}

function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new Error("A rational denominator is zero.");
  if (numerator === 0n) return { numerator: 0n, denominator: 1n };
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return {
    numerator: (sign * numerator) / divisor,
    denominator: absolute(denominator) / divisor,
  };
}

function parseRational(value: string, context: string): Rational {
  const match = /^(0|-?[1-9][0-9]*)(?:\/([1-9][0-9]*))?$/.exec(value);
  if (!match) throw new Error(`${context} is not a canonical rational.`);
  const parsed = rational(BigInt(match[1]), BigInt(match[2] ?? "1"));
  const normalized =
    parsed.denominator === 1n
      ? parsed.numerator.toString()
      : `${parsed.numerator}/${parsed.denominator}`;
  if (normalized !== value) {
    throw new Error(`${context} is not a reduced canonical rational.`);
  }
  return parsed;
}

function addRational(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiplyRational(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function isZero(value: Rational): boolean {
  return value.numerator === 0n;
}

function canonicalNormal(
  input: readonly ScalableConeInteger[],
  expectedRank?: number,
): {
  zero: boolean;
  primitive: string[];
  key: string;
  orientation: -1 | 1;
} {
  if (
    input.length < 1 ||
    input.length > MAX_SCALABLE_RANK ||
    (expectedRank !== undefined && input.length !== expectedRank)
  ) {
    throw new Error("A scalable cone normal has the wrong rank.");
  }
  const values = input.map((value, index) =>
    canonicalInteger(value, `normal[${index}]`),
  );
  let divisor = 0n;
  for (const value of values) divisor = gcd(divisor, value);
  if (divisor === 0n) {
    const primitive = values.map(() => "0");
    return {
      zero: true,
      primitive,
      key: primitive.join(","),
      orientation: 1,
    };
  }
  let primitive = values.map((value) => value / divisor);
  const orientation = primitive.find((value) => value !== 0n)! < 0n ? -1 : 1;
  if (orientation === -1) {
    primitive = primitive.map((value) => -value);
  }
  const serialized = primitive.map(String);
  return {
    zero: false,
    primitive: serialized,
    key: serialized.join(","),
    orientation,
  };
}

function integerMatrixRank(input: readonly (readonly bigint[])[]): number {
  if (input.length === 0) return 0;
  const matrix = input.map((row) => [...row]);
  const columnCount = matrix[0].length;
  let pivotRow = 0;
  for (let column = 0; column < columnCount; column += 1) {
    let source = pivotRow;
    while (source < matrix.length && matrix[source][column] === 0n) source += 1;
    if (source === matrix.length) continue;
    [matrix[pivotRow], matrix[source]] = [matrix[source], matrix[pivotRow]];
    const pivot = matrix[pivotRow][column];
    for (let row = pivotRow + 1; row < matrix.length; row += 1) {
      const entry = matrix[row][column];
      if (entry === 0n) continue;
      const divisor = gcd(pivot, entry);
      const pivotFactor = entry / divisor;
      const rowFactor = pivot / divisor;
      for (let index = column; index < columnCount; index += 1) {
        matrix[row][index] =
          rowFactor * matrix[row][index] -
          pivotFactor * matrix[pivotRow][index];
      }
      let rowDivisor = 0n;
      for (let index = column + 1; index < columnCount; index += 1) {
        rowDivisor = gcd(rowDivisor, matrix[row][index]);
      }
      if (rowDivisor > 1n) {
        for (let index = column + 1; index < columnCount; index += 1) {
          matrix[row][index] /= rowDivisor;
        }
      }
    }
    pivotRow += 1;
    if (pivotRow === matrix.length) break;
  }
  return pivotRow;
}

function parseAssignments(request: ExactConeOracleRequest): Array<{
  normal: bigint[];
  sign: ScalableConeSign;
}> {
  return request.assignments.map((assignment, index) => {
    const canonical = canonicalNormal(assignment.normal, request.rank);
    if (canonical.zero || canonical.key !== assignment.normalKey) {
      throw new Error(`Assignment ${index} has a noncanonical normal.`);
    }
    if (
      assignment.sign !== -1 &&
      assignment.sign !== 0 &&
      assignment.sign !== 1
    ) {
      throw new Error(`Assignment ${index} has a non-ternary sign.`);
    }
    return {
      normal: canonical.primitive.map(BigInt),
      sign: assignment.sign,
    };
  });
}

export function buildExactConeOracleRequest(input: {
  sourceHash: string;
  rank: number;
  assignments: readonly {
    normal: readonly ScalableConeInteger[];
    sign: ScalableConeSign;
  }[];
}): ExactConeOracleRequest {
  if (!/^[0-9a-f]{64}$/.test(input.sourceHash)) {
    throw new Error("An exact cone request needs a lowercase source SHA-256.");
  }
  if (
    !Number.isInteger(input.rank) ||
    input.rank < 1 ||
    input.rank > MAX_SCALABLE_RANK
  ) {
    throw new Error(
      `The scalable cone rank must lie in 1..${MAX_SCALABLE_RANK}.`,
    );
  }
  const seen = new Set<string>();
  const assignments: ScalableConeAssignment[] = input.assignments.map(
    (assignment, index) => {
      const normal = canonicalNormal(assignment.normal, input.rank);
      if (normal.zero) throw new Error(`Assignment ${index} has zero normal.`);
      if (seen.has(normal.key)) {
        throw new Error(`Assignment ${index} repeats normal ${normal.key}.`);
      }
      if (
        assignment.sign !== -1 &&
        assignment.sign !== 0 &&
        assignment.sign !== 1
      ) {
        throw new Error(`Assignment ${index} has a non-ternary sign.`);
      }
      seen.add(normal.key);
      return {
        normal: normal.primitive,
        normalKey: normal.key,
        // Reversing a normal reverses its two open half-spaces.  The zero
        // face is unchanged.
        sign:
          assignment.sign === 0
            ? 0
            : ((assignment.sign * normal.orientation) as -1 | 1),
      };
    },
  );
  const constraintDigest = canonicalSha256(assignments);
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: "exact-height-cone-oracle-request" as const,
    sourceHash: input.sourceHash,
    rank: input.rank,
    assignments,
    constraintDigest,
    requestHash: "",
  };
  return {
    ...withoutHash,
    requestHash: canonicalSha256(withoutHash),
  };
}

export function computeExactConeOracleCertificateHash(
  certificate: ExactConeOracleCertificate,
): string {
  return canonicalSha256({ ...certificate, certificateHash: "" });
}

export function sealExactConeOracleCertificate(
  certificate: ExactConeOracleCertificate,
): ExactConeOracleCertificate {
  const sealed = structuredClone(certificate);
  sealed.certificateHash = computeExactConeOracleCertificateHash(sealed);
  return sealed;
}

/**
 * Rebind a previously known primitive integral witness to a new cone request.
 * This is an exact fast path: the ordinary certificate replayer checks every
 * original equality and strict sign before the result is returned.
 */
export function certifyExactConeRequestWithPrimitiveWitness(
  request: ExactConeOracleRequest,
  primitiveWitness: readonly string[],
): ExactConeOracleCertificate | null {
  try {
    const assignments = parseAssignments(request);
    const equalityRank = integerMatrixRank(
      assignments
        .filter((assignment) => assignment.sign === 0)
        .map((assignment) => assignment.normal),
    );
    const algorithm = "cached-primitive-witness-exact-revalidation";
    const result: ExactConeOracleFeasibleResult = {
      kind: "feasible",
      equalityRank,
      dimension: request.rank - equalityRank,
      primitiveWitness: [...primitiveWitness],
    };
    const certificate = sealExactConeOracleCertificate({
      schemaVersion: 1,
      kind: "external-exact-height-cone-certificate",
      requestHash: request.requestHash,
      backend: {
        id: "local-exact-witness-revalidation",
        version: "1.0.0",
        algorithm,
        transcriptSha256: canonicalSha256({
          algorithm,
          requestHash: request.requestHash,
          result,
        }),
      },
      result,
      certificateHash: "",
    });
    return replayExactConeOracleCertificate(request, certificate).passed
      ? certificate
      : null;
  } catch {
    return null;
  }
}

export function replayExactConeOracleCertificate(
  request: ExactConeOracleRequest,
  certificate: ExactConeOracleCertificate,
): ExactConeOracleReplay {
  const errors: string[] = [];
  if (
    request.schemaVersion !== 1 ||
    request.kind !== "exact-height-cone-oracle-request"
  ) {
    errors.push("The exact cone request has the wrong schema or kind.");
  }
  if (
    certificate.schemaVersion !== 1 ||
    certificate.kind !== "external-exact-height-cone-certificate"
  ) {
    errors.push("The cone certificate has the wrong schema or kind.");
  }
  const rebuiltRequest = buildExactConeOracleRequest({
    sourceHash: request.sourceHash,
    rank: request.rank,
    assignments: request.assignments,
  });
  if (canonicalSha256(rebuiltRequest) !== canonicalSha256(request)) {
    errors.push("The exact cone request is not canonical.");
  }
  if (certificate.requestHash !== request.requestHash) {
    errors.push("The cone certificate is bound to another request.");
  }
  if (
    certificate.certificateHash !==
    computeExactConeOracleCertificateHash(certificate)
  ) {
    errors.push("The cone certificate hash is invalid.");
  }
  if (
    certificate.backend.id.length === 0 ||
    certificate.backend.version.length === 0 ||
    certificate.backend.algorithm.length === 0 ||
    !/^[0-9a-f]{64}$/.test(certificate.backend.transcriptSha256)
  ) {
    errors.push("The cone certificate has invalid backend metadata.");
  }

  let assignments: ReturnType<typeof parseAssignments> = [];
  try {
    assignments = parseAssignments(request);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { passed: false, errors: [...new Set(errors)].sort() };
  }
  const equalityRows = assignments
    .filter((assignment) => assignment.sign === 0)
    .map((assignment) => assignment.normal);
  const equalityRank = integerMatrixRank(equalityRows);
  const dimension = request.rank - equalityRank;

  if (certificate.result.kind === "feasible") {
    if (
      certificate.result.equalityRank !== equalityRank ||
      certificate.result.dimension !== dimension
    ) {
      errors.push(
        "The feasible certificate has the wrong equality rank or dimension.",
      );
    }
    if (certificate.result.primitiveWitness === null) {
      if (dimension !== 0) {
        errors.push("A positive-dimensional cone is missing its witness.");
      }
      if (assignments.some((assignment) => assignment.sign !== 0)) {
        errors.push("A strict cone was mislabeled as the zero cone.");
      }
    } else {
      try {
        if (certificate.result.primitiveWitness.length !== request.rank) {
          throw new Error("The cone witness has the wrong rank.");
        }
        const witness = certificate.result.primitiveWitness.map(
          (value, index) => canonicalInteger(value, `witness[${index}]`),
        );
        let divisor = 0n;
        for (const value of witness) divisor = gcd(divisor, value);
        if (divisor !== 1n) errors.push("The cone witness is not primitive.");
        for (const assignment of assignments) {
          let value = 0n;
          for (let index = 0; index < request.rank; index += 1) {
            value += assignment.normal[index] * witness[index];
          }
          if (
            assignment.sign === 0
              ? value !== 0n
              : value * BigInt(assignment.sign) <= 0n
          ) {
            errors.push("The cone witness violates an assigned sign.");
          }
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  } else {
    const total = Array.from({ length: request.rank }, () => rational(0n));
    let positiveMass = rational(0n);
    const seenInequalities = new Set<number>();
    const seenEqualities = new Set<number>();
    try {
      for (const entry of certificate.result.inequalityMultipliers) {
        if (
          !Number.isInteger(entry.assignmentIndex) ||
          entry.assignmentIndex < 0 ||
          entry.assignmentIndex >= assignments.length ||
          seenInequalities.has(entry.assignmentIndex)
        ) {
          throw new Error("A Farkas inequality index is invalid or repeated.");
        }
        const assignment = assignments[entry.assignmentIndex];
        if (assignment.sign === 0) {
          throw new Error("A Farkas inequality references an equality.");
        }
        seenInequalities.add(entry.assignmentIndex);
        const multiplier = parseRational(entry.value, "Farkas multiplier");
        if (multiplier.numerator < 0n) {
          throw new Error("A Farkas inequality multiplier is negative.");
        }
        positiveMass = addRational(positiveMass, multiplier);
        for (let coordinate = 0; coordinate < request.rank; coordinate += 1) {
          total[coordinate] = addRational(
            total[coordinate],
            multiplyRational(
              multiplier,
              rational(assignment.normal[coordinate] * BigInt(assignment.sign)),
            ),
          );
        }
      }
      for (const entry of certificate.result.equalityMultipliers) {
        if (
          !Number.isInteger(entry.assignmentIndex) ||
          entry.assignmentIndex < 0 ||
          entry.assignmentIndex >= assignments.length ||
          seenEqualities.has(entry.assignmentIndex)
        ) {
          throw new Error("A Farkas equality index is invalid or repeated.");
        }
        const assignment = assignments[entry.assignmentIndex];
        if (assignment.sign !== 0) {
          throw new Error(
            "A Farkas equality multiplier references an inequality.",
          );
        }
        seenEqualities.add(entry.assignmentIndex);
        const multiplier = parseRational(entry.value, "Farkas multiplier");
        for (let coordinate = 0; coordinate < request.rank; coordinate += 1) {
          total[coordinate] = addRational(
            total[coordinate],
            multiplyRational(
              multiplier,
              rational(assignment.normal[coordinate]),
            ),
          );
        }
      }
      if (positiveMass.numerator <= 0n) {
        errors.push("The Farkas certificate has no positive inequality mass.");
      }
      if (total.some((value) => !isZero(value))) {
        errors.push("The Farkas combination does not vanish.");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { passed: errors.length === 0, errors: [...new Set(errors)].sort() };
}

function negateCanonicalRational(value: string): string {
  const parsed = parseRational(value, "Farkas equality multiplier");
  const numerator = -parsed.numerator;
  return parsed.denominator === 1n
    ? numerator.toString()
    : `${numerator}/${parsed.denominator}`;
}

/**
 * Transport an exact certificate through x -> -x while reversing every open
 * half-space sign. Equalities are fixed. A primal witness negates; in a dual
 * certificate the inequality multipliers stay nonnegative and the free
 * equality multipliers negate.
 */
export function transformExactConeOracleCertificateAntipodally(
  sourceRequest: ExactConeOracleRequest,
  targetRequest: ExactConeOracleRequest,
  sourceCertificate: ExactConeOracleCertificate,
): ExactConeOracleCertificate {
  const sourceReplay = replayExactConeOracleCertificate(
    sourceRequest,
    sourceCertificate,
  );
  if (!sourceReplay.passed) {
    throw new Error(
      `Cannot transform an invalid cone certificate: ${sourceReplay.errors.join(" ")}`,
    );
  }
  if (
    sourceRequest.sourceHash !== targetRequest.sourceHash ||
    sourceRequest.rank !== targetRequest.rank ||
    sourceRequest.assignments.length !== targetRequest.assignments.length ||
    sourceRequest.assignments.some((source, index) => {
      const target = targetRequest.assignments[index];
      return (
        source.normalKey !== target.normalKey ||
        canonicalSha256(source.normal) !== canonicalSha256(target.normal) ||
        target.sign !== (source.sign === 0 ? 0 : -source.sign)
      );
    })
  ) {
    throw new Error(
      "The target cone request is not the antipode of the source request.",
    );
  }
  const result: ExactConeOracleCertificate["result"] =
    sourceCertificate.result.kind === "feasible"
      ? {
          ...sourceCertificate.result,
          primitiveWitness:
            sourceCertificate.result.primitiveWitness === null
              ? null
              : sourceCertificate.result.primitiveWitness.map((value) =>
                  (-canonicalInteger(value, "source witness")).toString(),
                ),
        }
      : {
          kind: "infeasible",
          inequalityMultipliers:
            sourceCertificate.result.inequalityMultipliers.map((entry) => ({
              ...entry,
            })),
          equalityMultipliers: sourceCertificate.result.equalityMultipliers.map(
            (entry) => ({
              assignmentIndex: entry.assignmentIndex,
              value: negateCanonicalRational(entry.value),
            }),
          ),
        };
  const transformed = sealExactConeOracleCertificate({
    schemaVersion: 1,
    kind: "external-exact-height-cone-certificate",
    requestHash: targetRequest.requestHash,
    backend: {
      id: "exact-antipodal-certificate-transform",
      version: "1",
      algorithm: "sign-reversal-of-primal-or-farkas-certificate",
      transcriptSha256: canonicalSha256({
        method: "exact-antipodal-certificate-transform",
        sourceRequestHash: sourceRequest.requestHash,
        sourceCertificateHash: sourceCertificate.certificateHash,
        targetRequestHash: targetRequest.requestHash,
      }),
    },
    result,
    certificateHash: "",
  });
  const targetReplay = replayExactConeOracleCertificate(
    targetRequest,
    transformed,
  );
  if (!targetReplay.passed) {
    throw new Error(
      `The antipodal cone certificate failed replay: ${targetReplay.errors.join(" ")}`,
    );
  }
  return transformed;
}

function nodeHash<PruneProof, Survivor>(
  node: ObstructionPrunedConeNode<PruneProof, Survivor>,
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
    requestHash: node.requestHash,
    feasibility: node.feasibility,
    decision,
    nodeHash: "",
  });
}

export function buildObstructionPrunedConeCover<PruneProof, Survivor>(
  options: BuildObstructionPrunedConeCoverOptions<PruneProof, Survivor>,
): ObstructionPrunedConeCover<PruneProof, Survivor> {
  const maxNodes = options.maxNodes ?? 1_000_000;
  const maxOracleQueries = options.maxOracleQueries ?? 3_000_000;
  let nodeCount = 0;
  let oracleQueryCount = 0;
  let splitNodeCount = 0;
  let pruneLeafCount = 0;
  let survivorLeafCount = 0;
  let zeroCharacterLeafCount = 0;
  let infeasibleBranchCount = 0;

  const query = (
    assignments: readonly ScalableConeAssignment[],
  ): {
    request: ExactConeOracleRequest;
    certificate: ExactConeOracleCertificate;
  } => {
    oracleQueryCount += 1;
    if (oracleQueryCount > maxOracleQueries) {
      throw new Error("The exact cone oracle-query cap was exceeded.");
    }
    const request = buildExactConeOracleRequest({
      sourceHash: options.sourceHash,
      rank: options.rank,
      assignments,
    });
    const certificate = options.oracle.solve(request);
    const replay = replayExactConeOracleCertificate(request, certificate);
    if (!replay.passed) {
      throw new Error(
        `The exact cone oracle returned an invalid certificate: ${replay.errors.join(" ")}`,
      );
    }
    return { request, certificate };
  };

  const buildNode = (
    assignments: ScalableConeAssignment[],
    supplied?: {
      request: ExactConeOracleRequest;
      certificate: ExactConeOracleCertificate;
    },
  ): ObstructionPrunedConeNode<PruneProof, Survivor> => {
    nodeCount += 1;
    if (nodeCount > maxNodes)
      throw new Error("The cone-cover node cap was exceeded.");
    const resolved = supplied ?? query(assignments);
    if (resolved.certificate.result.kind !== "feasible") {
      throw new Error("The cone-cover builder entered an infeasible node.");
    }
    const context: ObstructionPrunedConeContext = {
      request: resolved.request,
      certificate: resolved.certificate,
      feasibility: resolved.certificate.result,
      depth: assignments.length,
    };
    let decision: ObstructionPrunedConeNode<PruneProof, Survivor>["decision"];
    if (resolved.certificate.result.dimension === 0) {
      zeroCharacterLeafCount += 1;
      decision = { kind: "zero-character" };
    } else {
      const requested = options.decide(context);
      if (requested.kind === "prune") {
        pruneLeafCount += 1;
        decision = {
          kind: "prune",
          proof: requested.proof,
          proofDigest: canonicalSha256(requested.proof),
        };
      } else if (requested.kind === "survivor") {
        survivorLeafCount += 1;
        decision = {
          kind: "survivor",
          value: requested.value,
          valueDigest: canonicalSha256(requested.value),
        };
      } else {
        const normal = canonicalNormal(requested.normal, options.rank);
        if (
          normal.zero ||
          assignments.some((entry) => entry.normalKey === normal.key)
        ) {
          throw new Error("A cone split uses a zero or repeated normal.");
        }
        splitNodeCount += 1;
        const branches: Array<
          ObstructionPrunedConeBranch<PruneProof, Survivor>
        > = [];
        for (const sign of [-1, 0, 1] as const) {
          const childAssignments = [
            ...assignments,
            { normal: normal.primitive, normalKey: normal.key, sign },
          ];
          const child = query(childAssignments);
          if (child.certificate.result.kind === "infeasible") {
            infeasibleBranchCount += 1;
            branches.push({
              sign,
              outcome: "infeasible",
              requestHash: child.request.requestHash,
              certificate: child.certificate,
            });
          } else {
            branches.push({
              sign,
              outcome: "feasible",
              child: buildNode(childAssignments, child),
            });
          }
        }
        decision = {
          kind: "split",
          normal: normal.primitive,
          normalKey: normal.key,
          branches,
        };
      }
    }
    const node: ObstructionPrunedConeNode<PruneProof, Survivor> = {
      depth: assignments.length,
      constraintDigest: resolved.request.constraintDigest,
      requestHash: resolved.request.requestHash,
      feasibility: resolved.certificate,
      decision,
      nodeHash: "",
    };
    node.nodeHash = nodeHash(node);
    return node;
  };

  const root = buildNode([]);
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: "oracle-backed-obstruction-pruned-cone-cover" as const,
    method: "lazy-ternary-splits-with-exact-oracle-certificates" as const,
    sourceHash: options.sourceHash,
    rank: options.rank,
    root,
    nodeCount,
    oracleQueryCount,
    splitNodeCount,
    pruneLeafCount,
    survivorLeafCount,
    zeroCharacterLeafCount,
    infeasibleBranchCount,
    coverHash: "",
  };
  return { ...withoutHash, coverHash: canonicalSha256(withoutHash) };
}

export function computeOperationalFirstSurvivorHitHash<Survivor>(
  hit: OperationalFirstSurvivorHit<Survivor>,
): string {
  return canonicalSha256({ ...hit, hitHash: "" });
}

function witnessLastTraversalOrder(
  normal: readonly string[],
  feasibility: ExactConeOracleFeasibleResult,
): readonly ScalableConeSign[] {
  if (feasibility.primitiveWitness === null) {
    throw new Error("A positive-dimensional cone is missing its witness.");
  }
  let dot = 0n;
  for (let index = 0; index < normal.length; index += 1) {
    dot += BigInt(normal[index]) * BigInt(feasibility.primitiveWitness[index]);
  }
  if (dot > 0n) return [-1, 0, 1];
  if (dot < 0n) return [1, 0, -1];
  return [-1, 1, 0];
}

function traversalOrder(
  strategy: ObstructionPrunedConeTraversalStrategy,
  normal: readonly string[],
  feasibility: ExactConeOracleFeasibleResult,
): readonly ScalableConeSign[] {
  return strategy === "canonical"
    ? [-1, 0, 1]
    : witnessLastTraversalOrder(normal, feasibility);
}

async function runObstructionPrunedConeDfsAsync<PruneProof, Survivor>(
  options: BuildObstructionPrunedConeCoverAsyncOptions<PruneProof, Survivor>,
  stopAtFirstSurvivor: boolean,
  verifySurvivor?: (
    context: ObstructionPrunedConeContext,
    value: Survivor,
  ) => boolean,
): Promise<FirstSurvivorOrObstructionPrunedConeCover<PruneProof, Survivor>> {
  const maxNodes = options.maxNodes ?? 1_000_000;
  const maxOracleQueries = options.maxOracleQueries ?? 3_000_000;
  const traversalStrategy = options.traversalStrategy ?? "canonical";
  let nodeCount = 0;
  let oracleQueryCount = 0;
  let splitNodeCount = 0;
  let pruneLeafCount = 0;
  let survivorLeafCount = 0;
  let zeroCharacterLeafCount = 0;
  let infeasibleBranchCount = 0;

  const query = async (
    assignments: readonly ScalableConeAssignment[],
  ): Promise<{
    request: ExactConeOracleRequest;
    certificate: ExactConeOracleCertificate;
  }> => {
    oracleQueryCount += 1;
    if (oracleQueryCount > maxOracleQueries) {
      throw new Error("The exact cone oracle-query cap was exceeded.");
    }
    const request = buildExactConeOracleRequest({
      sourceHash: options.sourceHash,
      rank: options.rank,
      assignments,
    });
    const certificate = await options.oracle.solve(request);
    const replay = replayExactConeOracleCertificate(request, certificate);
    if (!replay.passed) {
      throw new Error(
        `The exact cone oracle returned an invalid certificate: ${replay.errors.join(" ")}`,
      );
    }
    return { request, certificate };
  };

  type NodeResult =
    | {
        kind: "complete-node";
        node: ObstructionPrunedConeNode<PruneProof, Survivor>;
      }
    | { kind: "first-survivor"; hit: OperationalFirstSurvivorHit<Survivor> };

  const buildNode = async (
    assignments: ScalableConeAssignment[],
    supplied?: {
      request: ExactConeOracleRequest;
      certificate: ExactConeOracleCertificate;
    },
  ): Promise<NodeResult> => {
    nodeCount += 1;
    if (nodeCount > maxNodes) {
      throw new Error("The cone-cover node cap was exceeded.");
    }
    const resolved = supplied ?? (await query(assignments));
    if (resolved.certificate.result.kind !== "feasible") {
      throw new Error("The cone-cover builder entered an infeasible node.");
    }
    const context: ObstructionPrunedConeContext = {
      request: resolved.request,
      certificate: resolved.certificate,
      feasibility: resolved.certificate.result,
      depth: assignments.length,
    };
    let decision: ObstructionPrunedConeNode<PruneProof, Survivor>["decision"];
    if (resolved.certificate.result.dimension === 0) {
      zeroCharacterLeafCount += 1;
      decision = { kind: "zero-character" };
    } else {
      const requested = options.decide(context);
      if (requested.kind === "prune") {
        pruneLeafCount += 1;
        decision = {
          kind: "prune",
          proof: requested.proof,
          proofDigest: canonicalSha256(requested.proof),
        };
      } else if (requested.kind === "survivor") {
        survivorLeafCount += 1;
        if (stopAtFirstSurvivor) {
          if (!verifySurvivor?.(context, requested.value)) {
            throw new Error(
              "The caller rejected the first cone survivor during exact replay.",
            );
          }
          const withoutHash = {
            schemaVersion: 1 as const,
            kind: "operational-first-survivor-hit" as const,
            method:
              "depth-first-lazy-ternary-splits-with-exact-oracle-certificates" as const,
            proofStatus: "operational-only-not-an-exhaustive-cover" as const,
            sourceHash: options.sourceHash,
            rank: options.rank,
            depth: assignments.length,
            request: resolved.request,
            certificate: resolved.certificate,
            value: requested.value,
            valueDigest: canonicalSha256(requested.value),
            visitedFeasibleNodeCount: nodeCount,
            oracleQueryCount,
            openedSplitNodeCount: splitNodeCount,
            completedPruneLeafCount: pruneLeafCount,
            completedZeroCharacterLeafCount: zeroCharacterLeafCount,
            infeasibleBranchCount,
            hitHash: "",
          };
          const hit: OperationalFirstSurvivorHit<Survivor> = {
            ...withoutHash,
            hitHash: canonicalSha256(withoutHash),
          };
          return { kind: "first-survivor", hit };
        }
        decision = {
          kind: "survivor",
          value: requested.value,
          valueDigest: canonicalSha256(requested.value),
        };
      } else {
        const normal = canonicalNormal(requested.normal, options.rank);
        if (
          normal.zero ||
          assignments.some((entry) => entry.normalKey === normal.key)
        ) {
          throw new Error("A cone split uses a zero or repeated normal.");
        }
        splitNodeCount += 1;
        const branchBySign = new Map<
          ScalableConeSign,
          ObstructionPrunedConeBranch<PruneProof, Survivor>
        >();
        for (const sign of traversalOrder(
          traversalStrategy,
          normal.primitive,
          resolved.certificate.result,
        )) {
          const childAssignments = [
            ...assignments,
            { normal: normal.primitive, normalKey: normal.key, sign },
          ];
          const child = await query(childAssignments);
          if (child.certificate.result.kind === "infeasible") {
            infeasibleBranchCount += 1;
            branchBySign.set(sign, {
              sign,
              outcome: "infeasible",
              requestHash: child.request.requestHash,
              certificate: child.certificate,
            });
          } else {
            const childResult = await buildNode(childAssignments, child);
            if (childResult.kind === "first-survivor") return childResult;
            branchBySign.set(sign, {
              sign,
              outcome: "feasible",
              child: childResult.node,
            });
          }
        }
        // Traversal order is an operational optimization. The proof object has
        // one canonical ternary order, so an exhausted search hashes exactly as
        // the ordinary cover builder does.
        const branches = ([-1, 0, 1] as const).map((sign) => {
          const branch = branchBySign.get(sign);
          if (!branch) throw new Error("A cone split lacks a ternary branch.");
          return branch;
        });
        decision = {
          kind: "split",
          normal: normal.primitive,
          normalKey: normal.key,
          branches,
        };
      }
    }
    const node: ObstructionPrunedConeNode<PruneProof, Survivor> = {
      depth: assignments.length,
      constraintDigest: resolved.request.constraintDigest,
      requestHash: resolved.request.requestHash,
      feasibility: resolved.certificate,
      decision,
      nodeHash: "",
    };
    node.nodeHash = nodeHash(node);
    return { kind: "complete-node", node };
  };

  const rootResult = await buildNode([]);
  if (rootResult.kind === "first-survivor") return rootResult.hit;
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: "oracle-backed-obstruction-pruned-cone-cover" as const,
    method: "lazy-ternary-splits-with-exact-oracle-certificates" as const,
    sourceHash: options.sourceHash,
    rank: options.rank,
    root: rootResult.node,
    nodeCount,
    oracleQueryCount,
    splitNodeCount,
    pruneLeafCount,
    survivorLeafCount,
    zeroCharacterLeafCount,
    infeasibleBranchCount,
    coverHash: "",
  };
  return { ...withoutHash, coverHash: canonicalSha256(withoutHash) };
}

/**
 * Async counterpart of `buildObstructionPrunedConeCover`.
 *
 * Children use the requested deterministic traversal strategy, then are stored
 * in canonical `-1, 0, 1` order. Consequently traversal order does not enter
 * the proof object or its hash. Canonical traversal is the default because it
 * maximizes reuse of certificates produced by the original exhaustive DFS.
 */
export async function buildObstructionPrunedConeCoverAsync<
  PruneProof,
  Survivor,
>(
  options: BuildObstructionPrunedConeCoverAsyncOptions<PruneProof, Survivor>,
): Promise<ObstructionPrunedConeCover<PruneProof, Survivor>> {
  const result = await runObstructionPrunedConeDfsAsync(options, false);
  if (result.kind === "operational-first-survivor-hit") {
    throw new Error("An exhaustive cone-cover build stopped at a survivor.");
  }
  return result;
}

/**
 * Depth-first exact cone search that returns as soon as the caller verifies a
 * survivor. A hit is deliberately not a partial cover: it is an operational
 * witness record bound to its exact feasible-cone request and certificate.
 * When no survivor exists, the return value is the ordinary complete cover.
 */
export async function searchFirstSurvivorOrBuildObstructionPrunedConeCoverAsync<
  PruneProof,
  Survivor,
>(
  options: SearchFirstSurvivorOrBuildObstructionPrunedConeCoverAsyncOptions<
    PruneProof,
    Survivor
  >,
): Promise<FirstSurvivorOrObstructionPrunedConeCover<PruneProof, Survivor>> {
  return runObstructionPrunedConeDfsAsync(
    options,
    true,
    options.verifySurvivor,
  );
}

export function replayOperationalFirstSurvivorHit<Survivor>(
  hit: OperationalFirstSurvivorHit<Survivor>,
  options: ReplayOperationalFirstSurvivorHitOptions<Survivor>,
): OperationalFirstSurvivorHitReplay {
  const errors: string[] = [];
  const storedHitHashValid =
    typeof hit.hitHash === "string" &&
    /^[0-9a-f]{64}$/.test(hit.hitHash) &&
    hit.hitHash === computeOperationalFirstSurvivorHitHash(hit);
  if (!storedHitHashValid) errors.push("The operational hit hash is invalid.");

  let requestEnvelopeValid = false;
  try {
    const rebuilt = buildExactConeOracleRequest({
      sourceHash: hit.request.sourceHash,
      rank: hit.request.rank,
      assignments: hit.request.assignments,
    });
    requestEnvelopeValid =
      hit.schemaVersion === 1 &&
      hit.kind === "operational-first-survivor-hit" &&
      hit.method ===
        "depth-first-lazy-ternary-splits-with-exact-oracle-certificates" &&
      hit.proofStatus === "operational-only-not-an-exhaustive-cover" &&
      hit.sourceHash === hit.request.sourceHash &&
      hit.rank === hit.request.rank &&
      hit.depth === hit.request.assignments.length &&
      canonicalSha256(rebuilt) === canonicalSha256(hit.request);
  } catch {
    requestEnvelopeValid = false;
  }
  if (!requestEnvelopeValid) {
    errors.push("The operational hit request envelope is invalid.");
  }

  let oracleCertificateValid = false;
  let feasibility: ExactConeOracleFeasibleResult | null = null;
  try {
    const replay = replayExactConeOracleCertificate(
      hit.request,
      hit.certificate,
    );
    if (
      replay.passed &&
      hit.certificate.result.kind === "feasible" &&
      hit.certificate.result.dimension > 0 &&
      hit.certificate.result.primitiveWitness !== null
    ) {
      oracleCertificateValid = true;
      feasibility = hit.certificate.result;
    } else {
      errors.push(...replay.errors);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (!oracleCertificateValid) {
    errors.push("The operational hit oracle certificate is invalid.");
  }

  const survivorDigestValid =
    typeof hit.valueDigest === "string" &&
    /^[0-9a-f]{64}$/.test(hit.valueDigest) &&
    hit.valueDigest === canonicalSha256(hit.value);
  if (!survivorDigestValid) {
    errors.push("The operational hit survivor digest is invalid.");
  }

  const censusEntries = [
    hit.depth,
    hit.visitedFeasibleNodeCount,
    hit.oracleQueryCount,
    hit.openedSplitNodeCount,
    hit.completedPruneLeafCount,
    hit.completedZeroCharacterLeafCount,
    hit.infeasibleBranchCount,
  ];
  const censusValid =
    censusEntries.every((entry) => Number.isSafeInteger(entry) && entry >= 0) &&
    hit.visitedFeasibleNodeCount >= 1 &&
    hit.oracleQueryCount ===
      hit.visitedFeasibleNodeCount + hit.infeasibleBranchCount &&
    hit.visitedFeasibleNodeCount ===
      hit.openedSplitNodeCount +
        hit.completedPruneLeafCount +
        hit.completedZeroCharacterLeafCount +
        1 &&
    hit.depth <= hit.openedSplitNodeCount;
  if (!censusValid) errors.push("The operational hit census is invalid.");

  let survivorVerified = false;
  if (requestEnvelopeValid && oracleCertificateValid && feasibility) {
    try {
      survivorVerified = options.verifySurvivor(
        {
          request: hit.request,
          certificate: hit.certificate,
          feasibility,
          depth: hit.depth,
        },
        hit.value,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!survivorVerified) {
    errors.push("The caller rejected the operational survivor.");
  }

  return {
    status: errors.length === 0 ? "passed" : "failed",
    checks: {
      storedHitHashValid,
      requestEnvelopeValid,
      oracleCertificateValid,
      survivorDigestValid,
      censusValid,
      survivorVerified,
    },
    errors: [...new Set(errors)].sort(),
  };
}

/**
 * Build the opposite-polarity cover by the exact antipodal equivalence
 * `(weight,sigma) ~ (-weight,-sigma)`. The target decision rule is rerun at
 * every feasible node, so target prune/survivor records are newly generated
 * and are not copied from the source polarity.
 */
export function deriveAntipodalObstructionPrunedConeCover<PruneProof, Survivor>(
  options: DeriveAntipodalObstructionPrunedConeCoverOptions<
    PruneProof,
    Survivor
  >,
): ObstructionPrunedConeCover<PruneProof, Survivor> {
  const source = options.source;
  if (
    source.schemaVersion !== 1 ||
    source.kind !== "oracle-backed-obstruction-pruned-cone-cover" ||
    source.method !== "lazy-ternary-splits-with-exact-oracle-certificates" ||
    source.coverHash !== canonicalSha256({ ...source, coverHash: "" })
  ) {
    throw new Error("The source antipodal cone cover has an invalid envelope.");
  }

  let nodeCount = 0;
  let oracleQueryCount = 0;
  let splitNodeCount = 0;
  let pruneLeafCount = 0;
  let survivorLeafCount = 0;
  let zeroCharacterLeafCount = 0;
  let infeasibleBranchCount = 0;

  const visit = (
    sourceNode: ObstructionPrunedConeNode<PruneProof, Survivor>,
    sourceAssignments: ScalableConeAssignment[],
    targetAssignments: ScalableConeAssignment[],
  ): ObstructionPrunedConeNode<PruneProof, Survivor> => {
    nodeCount += 1;
    oracleQueryCount += 1;
    if (
      sourceNode.depth !== sourceAssignments.length ||
      sourceNode.nodeHash !== nodeHash(sourceNode)
    ) {
      throw new Error("The source antipodal cone node has an invalid hash.");
    }
    const sourceRequest = buildExactConeOracleRequest({
      sourceHash: source.sourceHash,
      rank: source.rank,
      assignments: sourceAssignments,
    });
    const targetRequest = buildExactConeOracleRequest({
      sourceHash: source.sourceHash,
      rank: source.rank,
      assignments: targetAssignments,
    });
    if (
      sourceNode.requestHash !== sourceRequest.requestHash ||
      sourceNode.constraintDigest !== sourceRequest.constraintDigest ||
      sourceNode.feasibility.result.kind !== "feasible"
    ) {
      throw new Error("The source antipodal feasible node is inconsistent.");
    }
    const feasibility = transformExactConeOracleCertificateAntipodally(
      sourceRequest,
      targetRequest,
      sourceNode.feasibility,
    );
    if (feasibility.result.kind !== "feasible") {
      throw new Error("An antipodal feasible node became infeasible.");
    }
    const context: ObstructionPrunedConeContext = {
      request: targetRequest,
      certificate: feasibility,
      feasibility: feasibility.result,
      depth: targetAssignments.length,
    };
    let decision: ObstructionPrunedConeNode<PruneProof, Survivor>["decision"];

    if (sourceNode.decision.kind === "zero-character") {
      if (feasibility.result.dimension !== 0) {
        throw new Error("An antipodal zero-character leaf has positive rank.");
      }
      zeroCharacterLeafCount += 1;
      decision = { kind: "zero-character" };
    } else {
      if (feasibility.result.dimension === 0) {
        throw new Error("A positive-dimensional source leaf became zero.");
      }
      const requested = options.decide(context);
      if (sourceNode.decision.kind === "prune") {
        if (requested.kind !== "prune") {
          throw new Error("Antipodal transport changed a prune-leaf kind.");
        }
        pruneLeafCount += 1;
        decision = {
          kind: "prune",
          proof: requested.proof,
          proofDigest: canonicalSha256(requested.proof),
        };
      } else if (sourceNode.decision.kind === "survivor") {
        if (requested.kind !== "survivor") {
          throw new Error("Antipodal transport changed a survivor-leaf kind.");
        }
        survivorLeafCount += 1;
        decision = {
          kind: "survivor",
          value: requested.value,
          valueDigest: canonicalSha256(requested.value),
        };
      } else {
        if (requested.kind !== "split") {
          throw new Error("Antipodal transport changed a split-node kind.");
        }
        const sourceNormal = canonicalNormal(
          sourceNode.decision.normal,
          source.rank,
        );
        const targetNormal = canonicalNormal(requested.normal, source.rank);
        if (
          sourceNormal.zero ||
          targetNormal.zero ||
          sourceNormal.key !== sourceNode.decision.normalKey ||
          targetNormal.key !== sourceNormal.key ||
          sourceAssignments.some(
            (assignment) => assignment.normalKey === sourceNormal.key,
          )
        ) {
          throw new Error("Antipodal transport changed the requested split.");
        }
        const sourceBranches = new Map(
          sourceNode.decision.branches.map((branch) => [branch.sign, branch]),
        );
        if (
          sourceBranches.size !== 3 ||
          !([-1, 0, 1] as const).every((sign) => sourceBranches.has(sign))
        ) {
          throw new Error("An antipodal split lacks a ternary branch.");
        }
        splitNodeCount += 1;
        const branches: Array<
          ObstructionPrunedConeBranch<PruneProof, Survivor>
        > = [];
        for (const targetSign of [-1, 0, 1] as const) {
          const sourceSign = (
            targetSign === 0 ? 0 : -targetSign
          ) as ScalableConeSign;
          const sourceBranch = sourceBranches.get(sourceSign)!;
          const sourceChildAssignments = [
            ...sourceAssignments,
            {
              normal: sourceNormal.primitive,
              normalKey: sourceNormal.key,
              sign: sourceSign,
            },
          ];
          const targetChildAssignments = [
            ...targetAssignments,
            {
              normal: targetNormal.primitive,
              normalKey: targetNormal.key,
              sign: targetSign,
            },
          ];
          if (sourceBranch.outcome === "feasible") {
            branches.push({
              sign: targetSign,
              outcome: "feasible",
              child: visit(
                sourceBranch.child,
                sourceChildAssignments,
                targetChildAssignments,
              ),
            });
          } else {
            oracleQueryCount += 1;
            infeasibleBranchCount += 1;
            const sourceChildRequest = buildExactConeOracleRequest({
              sourceHash: source.sourceHash,
              rank: source.rank,
              assignments: sourceChildAssignments,
            });
            const targetChildRequest = buildExactConeOracleRequest({
              sourceHash: source.sourceHash,
              rank: source.rank,
              assignments: targetChildAssignments,
            });
            if (sourceBranch.requestHash !== sourceChildRequest.requestHash) {
              throw new Error(
                "An antipodal infeasible branch has the wrong request hash.",
              );
            }
            const certificate = transformExactConeOracleCertificateAntipodally(
              sourceChildRequest,
              targetChildRequest,
              sourceBranch.certificate,
            );
            if (certificate.result.kind !== "infeasible") {
              throw new Error(
                "An antipodal infeasible branch became feasible.",
              );
            }
            branches.push({
              sign: targetSign,
              outcome: "infeasible",
              requestHash: targetChildRequest.requestHash,
              certificate,
            });
          }
        }
        decision = {
          kind: "split",
          normal: targetNormal.primitive,
          normalKey: targetNormal.key,
          branches,
        };
      }
    }

    const targetNode: ObstructionPrunedConeNode<PruneProof, Survivor> = {
      depth: targetAssignments.length,
      constraintDigest: targetRequest.constraintDigest,
      requestHash: targetRequest.requestHash,
      feasibility,
      decision,
      nodeHash: "",
    };
    targetNode.nodeHash = nodeHash(targetNode);
    return targetNode;
  };

  const root = visit(source.root, [], []);
  if (
    nodeCount !== source.nodeCount ||
    oracleQueryCount !== source.oracleQueryCount ||
    splitNodeCount !== source.splitNodeCount ||
    pruneLeafCount !== source.pruneLeafCount ||
    survivorLeafCount !== source.survivorLeafCount ||
    zeroCharacterLeafCount !== source.zeroCharacterLeafCount ||
    infeasibleBranchCount !== source.infeasibleBranchCount
  ) {
    throw new Error("The source antipodal cone-cover census is inconsistent.");
  }
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: "oracle-backed-obstruction-pruned-cone-cover" as const,
    method: "lazy-ternary-splits-with-exact-oracle-certificates" as const,
    sourceHash: source.sourceHash,
    rank: source.rank,
    root,
    nodeCount,
    oracleQueryCount,
    splitNodeCount,
    pruneLeafCount,
    survivorLeafCount,
    zeroCharacterLeafCount,
    infeasibleBranchCount,
    coverHash: "",
  };
  return { ...withoutHash, coverHash: canonicalSha256(withoutHash) };
}

export function replayObstructionPrunedConeCover<PruneProof, Survivor>(
  cover: ObstructionPrunedConeCover<PruneProof, Survivor>,
  options: ReplayObstructionPrunedConeCoverOptions<PruneProof, Survivor> = {},
): ObstructionPrunedConeCoverReplay {
  const errors: string[] = [];
  const storedCoverHashValid =
    cover.coverHash === canonicalSha256({ ...cover, coverHash: "" });
  if (!storedCoverHashValid) errors.push("The cone-cover hash is invalid.");
  let nodeCount = 0;
  let oracleQueryCount = 0;
  let splitNodeCount = 0;
  let pruneLeafCount = 0;
  let survivorLeafCount = 0;
  let zeroCharacterLeafCount = 0;
  let infeasibleBranchCount = 0;
  let geometryComplete = true;
  let everyOracleCertificateValid = true;
  let everyPruneVerified = true;
  let everySurvivorVerified = true;
  const envelopeInvalid =
    cover.schemaVersion !== 1 ||
    cover.kind !== "oracle-backed-obstruction-pruned-cone-cover" ||
    cover.method !== "lazy-ternary-splits-with-exact-oracle-certificates" ||
    typeof cover.sourceHash !== "string" ||
    !Number.isInteger(cover.rank) ||
    cover.rank < 1 ||
    cover.rank > MAX_SCALABLE_RANK;
  if (envelopeInvalid) {
    // The expression above records invalidity so malformed runtime input does
    // not reach exact-request construction.
    geometryComplete = false;
    everyOracleCertificateValid = false;
    errors.push("The cone-cover envelope is invalid.");
  }

  const visit = (
    node: ObstructionPrunedConeNode<PruneProof, Survivor>,
    assignments: ScalableConeAssignment[],
  ): void => {
    nodeCount += 1;
    oracleQueryCount += 1;
    const request = buildExactConeOracleRequest({
      sourceHash: cover.sourceHash,
      rank: cover.rank,
      assignments,
    });
    const replay = replayExactConeOracleCertificate(request, node.feasibility);
    if (
      !replay.passed ||
      node.feasibility.result.kind !== "feasible" ||
      node.requestHash !== request.requestHash ||
      node.constraintDigest !== request.constraintDigest
    ) {
      everyOracleCertificateValid = false;
      errors.push(...replay.errors, "A feasible cone node is invalid.");
      return;
    }
    const context: ObstructionPrunedConeContext = {
      request,
      certificate: node.feasibility,
      feasibility: node.feasibility.result,
      depth: assignments.length,
    };
    if (node.depth !== assignments.length) {
      geometryComplete = false;
      errors.push("A cone node has the wrong stored depth.");
    }
    if (node.decision.kind === "zero-character") {
      zeroCharacterLeafCount += 1;
      if (node.feasibility.result.dimension !== 0) {
        geometryComplete = false;
        errors.push("A zero-character node has positive dimension.");
      }
    } else if (node.decision.kind === "prune") {
      pruneLeafCount += 1;
      if (node.feasibility.result.dimension === 0) {
        geometryComplete = false;
        errors.push("A prune leaf is stored at the zero character.");
      }
      if (
        node.decision.proofDigest !== canonicalSha256(node.decision.proof) ||
        !options.verifyPrune?.(context, node.decision.proof)
      ) {
        everyPruneVerified = false;
        errors.push("A prune leaf lacks a valid external proof.");
      }
    } else if (node.decision.kind === "survivor") {
      survivorLeafCount += 1;
      if (node.feasibility.result.dimension === 0) {
        geometryComplete = false;
        errors.push("A survivor leaf is stored at the zero character.");
      }
      if (
        node.decision.valueDigest !== canonicalSha256(node.decision.value) ||
        !options.verifySurvivor?.(context, node.decision.value)
      ) {
        everySurvivorVerified = false;
        errors.push("A survivor leaf lacks a valid external proof.");
      }
    } else {
      splitNodeCount += 1;
      const normal = canonicalNormal(node.decision.normal, cover.rank);
      if (
        node.feasibility.result.dimension === 0 ||
        normal.zero ||
        canonicalSha256(node.decision.normal) !==
          canonicalSha256(normal.primitive) ||
        normal.key !== node.decision.normalKey ||
        assignments.some((entry) => entry.normalKey === normal.key) ||
        node.decision.branches.length !== 3 ||
        node.decision.branches.some(
          (branch, index) => branch.sign !== ([-1, 0, 1] as const)[index],
        )
      ) {
        geometryComplete = false;
        errors.push("A split node is not canonical.");
        return;
      }
      for (const branch of node.decision.branches) {
        const childAssignments = [
          ...assignments,
          {
            normal: normal.primitive,
            normalKey: normal.key,
            sign: branch.sign,
          },
        ];
        if (branch.outcome === "infeasible") {
          oracleQueryCount += 1;
          infeasibleBranchCount += 1;
          const childRequest = buildExactConeOracleRequest({
            sourceHash: cover.sourceHash,
            rank: cover.rank,
            assignments: childAssignments,
          });
          const childReplay = replayExactConeOracleCertificate(
            childRequest,
            branch.certificate,
          );
          if (
            !childReplay.passed ||
            branch.certificate.result.kind !== "infeasible" ||
            branch.requestHash !== childRequest.requestHash
          ) {
            everyOracleCertificateValid = false;
            errors.push(
              ...childReplay.errors,
              "An infeasible branch is invalid.",
            );
          }
        } else {
          visit(branch.child, childAssignments);
        }
      }
    }
    if (node.nodeHash !== nodeHash(node)) {
      geometryComplete = false;
      errors.push("A cone node hash is invalid.");
    }
  };

  if (!envelopeInvalid) visit(cover.root, []);
  if (
    nodeCount !== cover.nodeCount ||
    oracleQueryCount !== cover.oracleQueryCount ||
    splitNodeCount !== cover.splitNodeCount ||
    pruneLeafCount !== cover.pruneLeafCount ||
    survivorLeafCount !== cover.survivorLeafCount ||
    zeroCharacterLeafCount !== cover.zeroCharacterLeafCount ||
    infeasibleBranchCount !== cover.infeasibleBranchCount
  ) {
    geometryComplete = false;
    errors.push("The cone-cover census is inconsistent.");
  }
  const checks = {
    storedCoverHashValid,
    geometryComplete,
    everyOracleCertificateValid,
    everyPruneVerified,
    everySurvivorVerified,
  };
  return {
    status:
      errors.length === 0 && Object.values(checks).every(Boolean)
        ? "passed"
        : "failed",
    checks,
    errors: [...new Set(errors)].sort(),
  };
}
