import {
  computeGeneralizedCompressionArchiveHash,
  verifyGeneralizedCompressionCertificate,
  type GeneralizedCompressionCertificate,
  type GeneralizedCompressionBuildOptions,
} from "../davis/generalizedCompression";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import { canonicalSha256 } from "../utils/canonicalSha256";
import { generalizedLawfulCellId } from "./generalizedLawfulCertificate";
import { buildStreamedLawfulDavisOracle } from "./streamedLawfulDavis";
import type {
  StreamedDavisCell,
  StreamedLawfulDavisOracle,
  StreamedLawfulEvaluation,
} from "./streamedLawfulDavis";

/** Input shared by the exact affine-feasibility and direct-link replays. */
export interface DirectCellwiseAffineOptions {
  oracle: StreamedLawfulDavisOracle;
  evaluation: StreamedLawfulEvaluation;
  /** Position in `evaluation.candidates`; it is not a stable candidate id. */
  candidateIndex: number;
  generalizedCompression: GeneralizedCompressionCertificate;
  /** Needed only when replaying a materialized rank-at-most-two bridge. */
  generalizedCompressionReplayOptions?: Pick<
    GeneralizedCompressionBuildOptions,
    "sourceQuotientVertexIds" | "coverCompression"
  >;
  affineScan?: "exhaustive" | "stop-on-first-obstruction";
  linkScan?: "exhaustive" | "stop-on-first-failure";
  maxAffineWitnesses?: number;
  maxLinkWitnesses?: number;
}

export type DirectAffineFeasibilityOutcome =
  | "feasible"
  | "infeasible-for-canonical-model"
  | "not-established";

export interface DirectAffineEquationWitness {
  cellId: string;
  point: number;
  generator: number;
  relation: string;
}

export interface DirectAffineScaleResult {
  outcome: DirectAffineFeasibilityOutcome;
  weightRule:
    | "equal-zone-scales"
    | "positive-ambient-wall-inverse-zone-scales"
    | "positive-retained-wall-component-inverse-zone-scales";
  variableScope:
    | "all-zones-equal"
    | "ambient-quotient-walls-before-retention"
    | "retained-opposite-edge-components";
  equationCount: number;
  independentEquationCount: number;
  /**
   * The variables y_A=1/c_A deform zone lengths by c_A. They are not new
   * cocycle coefficients: the original integral edge increment remains +/-1.
   */
  inverseZoneScales: Readonly<Record<string, string>> | null;
  violatingEquationCount: number;
  witnesses: DirectAffineEquationWitness[];
  checks: {
    everyRetainedCellEnumerated: boolean;
    rootRepresentationExact: boolean;
    everyCellOrbitMatrixConsistent: boolean;
    everyRetainedHigherCellSupportedByRetainedRankTwoFaces: boolean;
    affineEdgeEquationsSatisfied: boolean;
    everyInverseZoneScalePositive: boolean;
  };
  equationDigest: string;
  solutionDigest: string | null;
  errors: string[];
  nonClaims: string[];
}

export interface DirectCellwiseAffineFeasibilityCertificate {
  status: "passed" | "not-established" | "failed";
  method: "canonical-coxeter-cell-objective-function-equations";
  affineModel: "zone-scaled-simply-laced-right-angled-coxeter-zonotopes";
  rootCoordinates: "simple-root-basis";
  scanMode: "exhaustive" | "stop-on-first-obstruction";
  sourceCompressionArchiveHash: string;
  sourceCellSetDigest: string;
  retainedCellCount: number;
  retainedCellCountByDimension: Record<string, number>;
  explicitlyCheckedRankTwoCells: number;
  explicitlyCheckedHigherCells: number;
  higherEdgeEquationsChecked: number;
  higherEdgeEquationsExpected: number;
  higherChartsVerifiedByFullRootTraversal: number;
  supportedFiniteExponents: number[];
  retainedZoneComponents: {
    method: "opposite-edge-dsu-over-retained-rank-two-cells";
    geometricEdgeCount: number;
    retainedRankTwoCellCount: number;
    oppositeEdgeRelationCount: number;
    componentCount: number;
    componentDigest: string;
    checks: {
      everyGeometricEdgeAssigned: boolean;
      everyRetainedRankTwoCellVisited: boolean;
      onlyRetainedRankTwoOppositionsUsed: boolean;
    };
  };
  higherCellExtension: {
    theoremId: "simply-laced-weighted-root-zonotope-face-gluing";
    theoremVersion: 1;
    verificationMode: "full-retained-cell-root-traversal";
    transitionConvention: "R(ws_i)=R(w)R(s_i)-on-root-columns";
    retainedHigherCellsExpected: number;
    retainedHigherCellsChecked: number;
    higherEdgeEquationsExpected: number;
    higherEdgeEquationsChecked: number;
    rankTwoFaceOccurrencesChecked: number;
    evidenceDigest: string;
    checks: {
      everyRetainedHigherCellVisited: boolean;
      everyRetainedHigherCellEdgeEquationChecked: boolean;
      everyExpectedRankTwoFacePresent: boolean;
      everySupportingRankTwoFaceRetained: boolean;
      sharedFacesUseZoneComponentsAndCocycle: boolean;
    };
  };
  equalZoneScales: DirectAffineScaleResult;
  ambientWallInverseZoneScales: DirectAffineScaleResult;
  retainedWallComponentInverseZoneScales: DirectAffineScaleResult;
  feasibilityDigest: string;
  errors: string[];
  nonClaims: string[];
}

export interface DirectPolyhedralLinkSummary {
  point: number;
  ascendingVertexCount: number;
  ascendingMaximalCellCount: number;
  ascendingComponentCount: number;
  descendingVertexCount: number;
  descendingMaximalCellCount: number;
  descendingComponentCount: number;
  ascendingNonempty: boolean;
  ascendingConnected: boolean;
  descendingNonempty: boolean;
  descendingConnected: boolean;
  linkDigest: string;
}

export interface DirectPolyhedralLinkWitness {
  point: number;
  kind: "ascending" | "descending";
  reason: "empty" | "disconnected";
  components: string[][];
}

export interface DirectPolyhedralLinksCertificate {
  status: "passed" | "not-established" | "failed";
  method: "direct-ascending-and-descending-coxeter-cell-links";
  representation: "maximal-spherical-link-cells";
  scanMode: "exhaustive" | "stop-on-first-failure";
  scanOutcome: "exhaustive" | "counterexample-found" | "incomplete";
  sourceCellSetDigest: string;
  sourceFeasibilityDigest: string;
  checkedVertexCount: number;
  vertexSummaries: DirectPolyhedralLinkSummary[];
  witnesses: DirectPolyhedralLinkWitness[];
  checks: {
    affineMorseFunctionCertified: boolean;
    everyQuotientVertexChecked: boolean;
    everyAscendingLinkNonempty: boolean;
    everyDescendingLinkNonempty: boolean;
    everyAscendingLinkConnected: boolean;
    everyDescendingLinkConnected: boolean;
  };
  morseCondition: "passed" | "not-established";
  linksDigest: string;
  errors: string[];
  nonClaims: string[];
}

export interface DirectPolyhedralLinkPointResult {
  schemaVersion: 1;
  kind: "direct-polyhedral-link-point-replay";
  status: "passed" | "not-established";
  candidateId: string;
  sourceHash: string;
  sourceFeasibilityDigest: string;
  point: number;
  ascending: {
    maximalCells: number[][];
    components: string[][];
    nonempty: boolean;
    connected: boolean;
  };
  descending: {
    maximalCells: number[][];
    components: string[][];
    nonempty: boolean;
    connected: boolean;
  };
  linkDigest: string;
  resultHash: string;
}

export interface DirectCellwiseAffineCertificate {
  schemaVersion: 1;
  kind: "direct-cellwise-affine-generalized-lawful-certificate";
  method: "exact-inverse-zone-scales-and-direct-polyhedral-links";
  status: "completed" | "failed";
  candidateId: string;
  candidateIndex: number;
  sourceHash: string;
  source: {
    oracleStructureHash: string;
    actionRowsCanonicalSha256: string;
    wallStructureHash: string;
    coorientationHash: string;
    retentionHash: string;
    closureHash: string;
    generalizedCompressionArchiveHash: string;
    evaluationCandidateIndex: number;
  };
  subdivision: {
    method: "none-direct-coxeter-cell-links";
    introducedVertexIds: string[];
  };
  feasibility: DirectCellwiseAffineFeasibilityCertificate;
  directedLinks: DirectPolyhedralLinksCertificate;
  conclusion: "morse-links-passed" | "not-established";
  artifactHashAlgorithm: "sha256";
  artifactHash: string;
  errors: string[];
  nonClaims: string[];
}

export interface DirectCellwiseAffineReplay {
  schemaVersion: 1;
  kind: "direct-cellwise-affine-generalized-lawful-replay";
  status: "passed" | "failed";
  checks: {
    storedArtifactHashValid: boolean;
    sourceHashesMatch: boolean;
    actionRootedReconstructionMatches: boolean;
    rebuiltCalculationCompleted: boolean;
  };
  rebuiltArtifactHash: string;
  errors: string[];
}

// Implementations follow below. Keeping the theorem-facing data shapes in
// this module prevents the direct calculation from being confused with the
// existing pulling/perturbation certificate.

interface Rational {
  numerator: bigint;
  denominator: bigint;
}

interface PreparedSource {
  /** Canonical replay rebuilt from the action rows; never caller callbacks. */
  oracle: StreamedLawfulDavisOracle;
  /** Content-addressed replay of the supplied wall-sign snapshots. */
  evaluation: StreamedLawfulEvaluation;
  candidateIndex: number;
  candidateId: string;
  sourceHash: string;
  cellSetDigest: string;
  retainedCellCount: number;
  retainedCellCountByDimension: Record<string, number>;
  source: DirectCellwiseAffineCertificate["source"];
  errors: string[];
}

interface EquationSystem {
  variableScope:
    | "ambient-quotient-walls-before-retention"
    | "retained-opposite-edge-components";
  orderedVariableIds: string[];
  variableModelDigest: string;
  rows: bigint[][];
  witnessByRow: Map<string, DirectAffineEquationWitness>;
  equationCount: number;
  retainedCellCount: number;
  retainedCellCountByDimension: Record<string, number>;
  explicitlyCheckedRankTwoCells: number;
  explicitlyCheckedHigherCells: number;
  higherEdgeEquationsChecked: number;
  higherEdgeEquationsExpected: number;
  higherChartsVerifiedByFullRootTraversal: number;
  scanOutcome: "exhaustive" | "positive-obstruction-found";
  decisivePositiveObstruction: DirectAffineEquationWitness | null;
  everyRetainedCellEnumerated: boolean;
  rootRepresentationExact: boolean;
  everyCellOrbitMatrixConsistent: boolean;
  everyRetainedHigherCellSupportedByRetainedRankTwoFaces: boolean;
  everyExpectedRankTwoFacePresent: boolean;
  everySupportingRankTwoFaceRetained: boolean;
  sharedFacesUseZoneComponentsAndCocycle: boolean;
  retainedHigherCellsChecked: number;
  rankTwoFaceOccurrencesChecked: number;
  higherCellEvidenceDigest: string;
  errors: string[];
}

interface LinkData {
  maximalCells: number[][];
  components: string[][];
  nonempty: boolean;
  connected: boolean;
}

interface ZoneVariableModel {
  scope:
    | "ambient-quotient-walls-before-retention"
    | "retained-opposite-edge-components";
  orderedVariableIds: string[];
  edgeVariableIndex: Uint32Array;
  digest: string;
}

type RetainedZoneComponentSummary =
  DirectCellwiseAffineFeasibilityCertificate["retainedZoneComponents"];

const ZERO: Rational = { numerator: 0n, denominator: 1n };
const ONE: Rational = { numerator: 1n, denominator: 1n };
const SUPPORTED_FINITE_EXPONENTS = [2, 3] as const;
const MAX_FOURIER_MOTZKIN_ROWS = 200_000;
const compressionReplayCache = new WeakMap<
  GeneralizedCompressionCertificate,
  Map<string, string[]>
>();
const canonicalOracleReplayCache = new WeakMap<
  StreamedLawfulDavisOracle,
  Map<string, StreamedLawfulDavisOracle>
>();
const canonicalEvaluationReplayCache = new WeakMap<
  StreamedLawfulDavisOracle,
  Map<string, StreamedLawfulEvaluation>
>();

function hashCanonicalActionRows(generatorImages: readonly number[][]): string {
  const chunkSize = 4_096;
  const degree = generatorImages[0]?.length ?? 0;
  const rowChunkHashes = generatorImages.map((row, generator) => {
    const chunks: string[] = [];
    for (let start = 0; start < row.length; start += chunkSize) {
      chunks.push(
        canonicalSha256({
          generator,
          start,
          images: row.slice(start, start + chunkSize),
        }),
      );
    }
    return canonicalSha256({ generator, degree, chunkSize, chunks });
  });
  return canonicalSha256({
    schemaVersion: 1,
    method: "fixed-row-chunk-sha256-tree",
    degree,
    generatorCount: generatorImages.length,
    chunkSize,
    rowChunkHashes,
  });
}

function hashEdgeVariableAssignments(
  sourceCellSetDigest: string,
  scope: ZoneVariableModel["scope"],
  orderedVariableIds: readonly string[],
  edgeVariableIndex: Uint32Array,
): string {
  const chunkSize = 4_096;
  const chunks: string[] = [];
  for (let start = 0; start < edgeVariableIndex.length; start += chunkSize) {
    chunks.push(
      canonicalSha256({
        start,
        variableIndices: Array.from(
          edgeVariableIndex.subarray(start, start + chunkSize),
        ),
      }),
    );
  }
  return canonicalSha256({
    schemaVersion: 1,
    method: "fixed-geometric-edge-zone-variable-chunk-tree",
    sourceCellSetDigest,
    scope,
    chunkSize,
    geometricEdgeCount: edgeVariableIndex.length,
    orderedVariableIds,
    chunks,
  });
}

function buildZoneVariableModels(source: PreparedSource): {
  ambient: ZoneVariableModel;
  retained: ZoneVariableModel;
  retainedSummary: RetainedZoneComponentSummary;
} {
  const { oracle, evaluation, candidateIndex } = source;
  const ambientWalls = [...oracle.walls.walls].sort(
    (left, right) => left.wallIndex - right.wallIndex,
  );
  const ambientEdgeVariableIndex = new Uint32Array(oracle.geometricEdgeCount);
  const ambientVariableIndexByWallIndex = new Map(
    ambientWalls.map((wall, index) => [wall.wallIndex, index] as const),
  );
  for (
    let edgeIndex = 0;
    edgeIndex < oracle.geometricEdgeCount;
    edgeIndex += 1
  ) {
    const wallIndex = oracle.wallForGeometricEdge(edgeIndex).wallIndex;
    const variableIndex = ambientVariableIndexByWallIndex.get(wallIndex);
    if (variableIndex === undefined) {
      throw new Error(`Ambient wall ${wallIndex} has no scale variable.`);
    }
    ambientEdgeVariableIndex[edgeIndex] = variableIndex;
  }
  const ambientVariableIds = ambientWalls.map((wall) => wall.id);
  const ambient: ZoneVariableModel = {
    scope: "ambient-quotient-walls-before-retention",
    orderedVariableIds: ambientVariableIds,
    edgeVariableIndex: ambientEdgeVariableIndex,
    digest: hashEdgeVariableAssignments(
      source.cellSetDigest,
      "ambient-quotient-walls-before-retention",
      ambientVariableIds,
      ambientEdgeVariableIndex,
    ),
  };

  // A deleted polygon no longer identifies its opposite edge zones. Thus the
  // compatible scale variables for the retained complex are components of
  // geometric edges under opposite-edge relations from retained polygons
  // only, not the oracle's ambient Davis-wall components.
  const parent = new Uint32Array(oracle.geometricEdgeCount);
  const rank = new Uint8Array(oracle.geometricEdgeCount);
  const minimum = new Uint32Array(oracle.geometricEdgeCount);
  for (let edgeIndex = 0; edgeIndex < parent.length; edgeIndex += 1) {
    parent[edgeIndex] = edgeIndex;
    minimum[edgeIndex] = edgeIndex;
  }
  const find = (edgeIndex: number): number => {
    let root = edgeIndex;
    while (parent[root] !== root) root = parent[root];
    let current = edgeIndex;
    while (parent[current] !== current) {
      const next = parent[current];
      parent[current] = root;
      current = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const componentMinimum = Math.min(minimum[leftRoot], minimum[rightRoot]);
    if (rank[leftRoot] < rank[rightRoot]) {
      parent[leftRoot] = rightRoot;
      minimum[rightRoot] = componentMinimum;
    } else {
      parent[rightRoot] = leftRoot;
      minimum[leftRoot] = componentMinimum;
      if (rank[leftRoot] === rank[rightRoot]) rank[leftRoot] += 1;
    }
  };
  let retainedRankTwoCellCount = 0;
  let oppositeEdgeRelationCount = 0;
  oracle.forEachRankTwoCell((rankTwoCell) => {
    if (!evaluation.isRetained(rankTwoCell.cell, candidateIndex)) return;
    retainedRankTwoCellCount += 1;
    const half = rankTwoCell.boundary.length / 2;
    if (!Number.isInteger(half) || half !== rankTwoCell.m) {
      throw new Error(
        `${generalizedLawfulCellId(rankTwoCell.cell)} has an invalid opposite-edge boundary.`,
      );
    }
    for (let boundaryIndex = 0; boundaryIndex < half; boundaryIndex += 1) {
      oppositeEdgeRelationCount += 1;
      union(
        rankTwoCell.boundary[boundaryIndex].edgeIndex,
        rankTwoCell.boundary[boundaryIndex + half].edgeIndex,
      );
    }
  });
  const componentMinimumByEdge = new Uint32Array(oracle.geometricEdgeCount);
  const componentMinimums = new Set<number>();
  for (
    let edgeIndex = 0;
    edgeIndex < componentMinimumByEdge.length;
    edgeIndex += 1
  ) {
    const root = find(edgeIndex);
    const componentMinimum = minimum[root];
    componentMinimumByEdge[edgeIndex] = componentMinimum;
    componentMinimums.add(componentMinimum);
  }
  const orderedComponentMinimums = [...componentMinimums].sort(compareNumbers);
  const componentIndexByMinimum = new Map(
    orderedComponentMinimums.map((minimum, index) => [minimum, index] as const),
  );
  const retainedEdgeVariableIndex = new Uint32Array(oracle.geometricEdgeCount);
  for (
    let edgeIndex = 0;
    edgeIndex < retainedEdgeVariableIndex.length;
    edgeIndex += 1
  ) {
    const componentIndex = componentIndexByMinimum.get(
      componentMinimumByEdge[edgeIndex],
    );
    if (componentIndex === undefined) {
      throw new Error(
        `Geometric edge e${edgeIndex} has no retained zone component.`,
      );
    }
    retainedEdgeVariableIndex[edgeIndex] = componentIndex;
  }
  const retainedVariableIds = orderedComponentMinimums.map(
    (minimumEdge) => `dca:retained-zone-component:e${minimumEdge}`,
  );
  const retainedDigest = hashEdgeVariableAssignments(
    source.cellSetDigest,
    "retained-opposite-edge-components",
    retainedVariableIds,
    retainedEdgeVariableIndex,
  );
  const everyRetainedRankTwoCellVisited =
    retainedRankTwoCellCount ===
    (source.retainedCellCountByDimension["2"] ?? 0);
  if (!everyRetainedRankTwoCellVisited) {
    throw new Error(
      `Retained zone construction visited ${retainedRankTwoCellCount}/${source.retainedCellCountByDimension["2"] ?? 0} retained rank-two cells.`,
    );
  }
  return {
    ambient,
    retained: {
      scope: "retained-opposite-edge-components",
      orderedVariableIds: retainedVariableIds,
      edgeVariableIndex: retainedEdgeVariableIndex,
      digest: retainedDigest,
    },
    retainedSummary: {
      method: "opposite-edge-dsu-over-retained-rank-two-cells",
      geometricEdgeCount: oracle.geometricEdgeCount,
      retainedRankTwoCellCount,
      oppositeEdgeRelationCount,
      componentCount: retainedVariableIds.length,
      componentDigest: retainedDigest,
      checks: {
        everyGeometricEdgeAssigned:
          retainedEdgeVariableIndex.length === oracle.geometricEdgeCount,
        everyRetainedRankTwoCellVisited,
        onlyRetainedRankTwoOppositionsUsed: true,
      },
    },
  };
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function lcm(left: bigint, right: bigint): bigint {
  if (left === 0n || right === 0n) return 0n;
  return (left / gcd(left, right)) * right;
}

function rational(
  numerator: bigint | number,
  denominator: bigint | number = 1n,
): Rational {
  let n = BigInt(numerator);
  let d = BigInt(denominator);
  if (d === 0n) throw new Error("A rational denominator cannot be zero.");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const divisor = gcd(n, d);
  return { numerator: n / divisor, denominator: d / divisor };
}

function add(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtract(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function divide(left: Rational, right: Rational): Rational {
  if (right.numerator === 0n) throw new Error("Cannot divide by zero.");
  return rational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function negate(value: Rational): Rational {
  return { numerator: -value.numerator, denominator: value.denominator };
}

function rationalSign(value: Rational): -1 | 0 | 1 {
  return value.numerator < 0n ? -1 : value.numerator > 0n ? 1 : 0;
}

function rationalKey(value: Rational): string {
  return `${value.numerator}/${value.denominator}`;
}

function rationalRowKey(row: readonly Rational[]): string {
  return row.map(rationalKey).join(",");
}

function normalizeEqualityRow(row: readonly bigint[]): bigint[] | null {
  let divisor = 0n;
  for (const coefficient of row) divisor = gcd(divisor, coefficient);
  if (divisor === 0n) return null;
  const normalized = row.map((coefficient) => coefficient / divisor);
  const first = normalized.find((coefficient) => coefficient !== 0n)!;
  return first < 0n
    ? normalized.map((coefficient) => -coefficient)
    : normalized;
}

function equalityRowKey(row: readonly bigint[]): string {
  return row.join(",");
}

function normalizeStrictRow(row: readonly Rational[]): Rational[] {
  let denominator = 1n;
  for (const value of row) denominator = lcm(denominator, value.denominator);
  const integers = row.map(
    (value) => value.numerator * (denominator / value.denominator),
  );
  let divisor = 0n;
  for (const value of integers) divisor = gcd(divisor, value);
  if (divisor === 0n) return row.map(() => ZERO);
  return integers.map((value) => rational(value / divisor));
}

function identityMatrix(size: number): bigint[][] {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_entry, column) =>
      row === column ? 1n : 0n,
    ),
  );
}

function multiplyIntegerMatrices(
  left: readonly (readonly bigint[])[],
  right: readonly (readonly bigint[])[],
): bigint[][] {
  const rows = left.length;
  const inner = right.length;
  const columns = right[0]?.length ?? 0;
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      let sum = 0n;
      for (let index = 0; index < inner; index += 1) {
        sum += left[row][index] * right[index][column];
      }
      return sum;
    }),
  );
}

function integerMatricesEqual(
  left: readonly (readonly bigint[])[],
  right: readonly (readonly bigint[])[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (row, index) =>
        row.length === right[index].length &&
        row.every((value, column) => value === right[index][column]),
    )
  );
}

function rref(source: readonly (readonly Rational[])[]): {
  matrix: Rational[][];
  pivots: number[];
} {
  const matrix = source.map((row) => row.map((value) => ({ ...value })));
  const columns = matrix[0]?.length ?? 0;
  const pivots: number[] = [];
  let pivotRow = 0;
  for (
    let column = 0;
    column < columns && pivotRow < matrix.length;
    column += 1
  ) {
    const selected = matrix.findIndex(
      (row, index) => index >= pivotRow && rationalSign(row[column]) !== 0,
    );
    if (selected < 0) continue;
    [matrix[pivotRow], matrix[selected]] = [matrix[selected], matrix[pivotRow]];
    const pivot = matrix[pivotRow][column];
    matrix[pivotRow] = matrix[pivotRow].map((value) => divide(value, pivot));
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === pivotRow || rationalSign(matrix[row][column]) === 0) continue;
      const scale = matrix[row][column];
      matrix[row] = matrix[row].map((value, index) =>
        subtract(value, multiply(scale, matrix[pivotRow][index])),
      );
    }
    pivots.push(column);
    pivotRow += 1;
  }
  return { matrix, pivots };
}

function nullspaceBasis(
  rows: readonly (readonly bigint[])[],
  width: number,
): {
  basis: Rational[][];
  rank: number;
} {
  if (width === 0) return { basis: [], rank: 0 };
  if (rows.length === 0) {
    return {
      basis: Array.from({ length: width }, (_, column) =>
        Array.from({ length: width }, (_entry, row) =>
          row === column ? ONE : ZERO,
        ),
      ),
      rank: 0,
    };
  }
  const reduced = rref(
    rows.map((row) => row.map((coefficient) => rational(coefficient))),
  );
  const pivotSet = new Set(reduced.pivots);
  const freeColumns = Array.from({ length: width }, (_, index) => index).filter(
    (column) => !pivotSet.has(column),
  );
  const basis = freeColumns.map((freeColumn) => {
    const vector = Array.from({ length: width }, () => ZERO);
    vector[freeColumn] = ONE;
    for (let row = 0; row < reduced.pivots.length; row += 1) {
      vector[reduced.pivots[row]] = negate(reduced.matrix[row][freeColumn]);
    }
    return vector;
  });
  return { basis, rank: reduced.pivots.length };
}

function solveStrictHomogeneousInequalities(
  source: readonly (readonly Rational[])[],
  variableCount: number,
):
  | { status: "feasible"; vector: Rational[] }
  | { status: "infeasible" }
  | { status: "resource-limit" }
  | { status: "internal-error" } {
  const stages: Rational[][][] = [];
  let rows = [
    ...new Map(
      source.map((row) => {
        const normalized = normalizeStrictRow(row);
        return [rationalRowKey(normalized), normalized] as const;
      }),
    ).values(),
  ];
  for (let remaining = variableCount; remaining > 0; remaining -= 1) {
    if (rows.some((row) => row.every((value) => rationalSign(value) === 0))) {
      return { status: "infeasible" };
    }
    stages.push(rows);
    const column = remaining - 1;
    const positive = rows.filter((row) => rationalSign(row[column]) > 0);
    const negative = rows.filter((row) => rationalSign(row[column]) < 0);
    const zero = rows
      .filter((row) => rationalSign(row[column]) === 0)
      .map((row) => row.slice(0, column));
    const next = new Map<string, Rational[]>();
    for (const row of zero) {
      const normalized = normalizeStrictRow(row);
      next.set(rationalRowKey(normalized), normalized);
    }
    for (const lower of positive) {
      for (const upper of negative) {
        const combined = Array.from({ length: column }, (_, index) =>
          add(
            multiply(negate(upper[column]), lower[index]),
            multiply(lower[column], upper[index]),
          ),
        );
        const normalized = normalizeStrictRow(combined);
        next.set(rationalRowKey(normalized), normalized);
        if (next.size > MAX_FOURIER_MOTZKIN_ROWS) {
          return { status: "resource-limit" };
        }
      }
    }
    rows = [...next.values()];
  }
  if (rows.some((row) => row.length === 0)) return { status: "infeasible" };

  const vector: Rational[] = [];
  for (let stage = stages.length - 1; stage >= 0; stage -= 1) {
    const stageRows = stages[stage];
    const column = variableCount - 1 - stage;
    const lowerBounds: Rational[] = [];
    const upperBounds: Rational[] = [];
    for (const row of stageRows) {
      let rest = ZERO;
      for (let index = 0; index < column; index += 1) {
        rest = add(rest, multiply(row[index], vector[index]));
      }
      const coefficient = row[column];
      if (rationalSign(coefficient) > 0) {
        lowerBounds.push(divide(negate(rest), coefficient));
      } else if (rationalSign(coefficient) < 0) {
        upperBounds.push(divide(negate(rest), coefficient));
      } else if (rationalSign(rest) <= 0) {
        return { status: "infeasible" };
      }
    }
    const maximumLower = lowerBounds.reduce<Rational | null>(
      (best, value) =>
        best === null || rationalSign(subtract(value, best)) > 0 ? value : best,
      null,
    );
    const minimumUpper = upperBounds.reduce<Rational | null>(
      (best, value) =>
        best === null || rationalSign(subtract(value, best)) < 0 ? value : best,
      null,
    );
    let selected: Rational;
    if (maximumLower !== null && minimumUpper !== null) {
      if (rationalSign(subtract(minimumUpper, maximumLower)) <= 0) {
        return { status: "infeasible" };
      }
      selected = divide(add(maximumLower, minimumUpper), rational(2));
    } else if (maximumLower !== null) {
      selected = add(maximumLower, ONE);
    } else if (minimumUpper !== null) {
      selected = subtract(minimumUpper, ONE);
    } else {
      selected = ZERO;
    }
    vector[column] = selected;
  }
  const valid = source.every((row) => {
    let value = ZERO;
    for (let index = 0; index < variableCount; index += 1) {
      value = add(value, multiply(row[index], vector[index]));
    }
    return rationalSign(value) > 0;
  });
  return valid ? { status: "feasible", vector } : { status: "internal-error" };
}

function positiveIntegerNullVector(
  rows: readonly (readonly bigint[])[],
  width: number,
):
  | { status: "feasible"; vector: bigint[]; rank: number }
  | { status: "infeasible"; rank: number }
  | { status: "resource-limit"; rank: number }
  | { status: "internal-error"; rank: number } {
  const kernel = nullspaceBasis(rows, width);
  if (width === 0) return { status: "feasible", vector: [], rank: kernel.rank };
  if (kernel.basis.length === 0) {
    return { status: "infeasible", rank: kernel.rank };
  }
  const inequalities = Array.from({ length: width }, (_, coordinate) =>
    kernel.basis.map((basisVector) => basisVector[coordinate]),
  );
  const parameters = solveStrictHomogeneousInequalities(
    inequalities,
    kernel.basis.length,
  );
  if (parameters.status !== "feasible") {
    return { status: parameters.status, rank: kernel.rank };
  }
  const rationalVector = Array.from({ length: width }, (_, coordinate) => {
    let value = ZERO;
    for (let parameter = 0; parameter < kernel.basis.length; parameter += 1) {
      value = add(
        value,
        multiply(
          kernel.basis[parameter][coordinate],
          parameters.vector[parameter],
        ),
      );
    }
    return value;
  });
  if (rationalVector.some((value) => rationalSign(value) <= 0)) {
    return { status: "internal-error", rank: kernel.rank };
  }
  let denominator = 1n;
  for (const value of rationalVector) {
    denominator = lcm(denominator, value.denominator);
  }
  let integers = rationalVector.map(
    (value) => value.numerator * (denominator / value.denominator),
  );
  let divisor = 0n;
  for (const value of integers) divisor = gcd(divisor, value);
  if (divisor > 1n) integers = integers.map((value) => value / divisor);
  const equationsHold = rows.every(
    (row) =>
      row.reduce(
        (sum, coefficient, index) => sum + coefficient * integers[index],
        0n,
      ) === 0n,
  );
  if (!equationsHold || integers.some((value) => value <= 0n)) {
    return { status: "internal-error", rank: kernel.rank };
  }
  return { status: "feasible", vector: integers, rank: kernel.rank };
}

function recordEquals(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  return canonicalSha256(left) === canonicalSha256(right);
}

function replayGeneralizedCompressionFromOracle(
  options: DirectCellwiseAffineOptions,
  oracle: StreamedLawfulDavisOracle,
  generatorImages: number[][],
): string[] {
  const { generalizedCompression } = options;
  const replayOptions = options.generalizedCompressionReplayOptions ?? {};
  const cacheKey =
    options.generalizedCompressionReplayOptions === undefined
      ? `${oracle.structureHash}:${generalizedCompression.archiveHash}`
      : null;
  if (cacheKey !== null) {
    const cached = compressionReplayCache
      .get(generalizedCompression)
      ?.get(cacheKey);
    if (cached !== undefined) return [...cached];
  }
  const candidate: TorsionFreeActionCandidate = {
    id: generalizedCompression.source.candidateId,
    index: oracle.degree,
    generatorImages,
    backend: "direct-cellwise-affine-compression-replay",
  };
  const certificate = certifyTorsionFreeAction(
    oracle.system,
    candidate,
    planSphericalSpecialSubgroups(oracle.system),
  );
  const accepted: TorsionFreeCandidateResult = { candidate, certificate };
  const replay = verifyGeneralizedCompressionCertificate(
    oracle.system,
    accepted,
    generalizedCompression,
    replayOptions,
  );
  const errors = replay.valid
    ? []
    : replay.errors.map(
        (error) => `Generalized-compression action-rooted replay: ${error}`,
      );
  if (cacheKey !== null) {
    const byOracle =
      compressionReplayCache.get(generalizedCompression) ?? new Map();
    byOracle.set(cacheKey, [...errors]);
    compressionReplayCache.set(generalizedCompression, byOracle);
  }
  return errors;
}

function prepareSource(options: DirectCellwiseAffineOptions): PreparedSource {
  const {
    oracle: suppliedOracle,
    evaluation: suppliedEvaluation,
    generalizedCompression,
  } = options;
  const errors: string[] = [];
  const candidate = suppliedEvaluation.candidates[options.candidateIndex];
  const suppliedClosure = suppliedEvaluation.closure.candidateSummaries.find(
    (entry) => entry.candidateIndex === options.candidateIndex,
  );
  if (!candidate || !suppliedClosure) {
    throw new RangeError(
      `Candidate index ${options.candidateIndex} is absent from the lawful evaluation.`,
    );
  }
  if (suppliedClosure.candidateId !== candidate.id) {
    errors.push(
      `The closure summary candidate ${suppliedClosure.candidateId} does not match ${candidate.id}.`,
    );
  }
  const generatorImages = Array.from(
    { length: suppliedOracle.system.rank },
    (_, generator) =>
      Array.from({ length: suppliedOracle.degree }, (_entry, point) =>
        suppliedOracle.neighbor(point, generator),
      ),
  );
  // Public streamed-oracle methods are convenient query callbacks, not a
  // certificate boundary. Rebuilding from the generator rows prevents a
  // wrapper from swapping in forged wall, cell, retention, or sign methods
  // while retaining genuine-looking frozen snapshots.
  const actionRowsCanonicalSha256 = hashCanonicalActionRows(generatorImages);
  const oracleReplayKey = `${canonicalSha256(suppliedOracle.system)}:${actionRowsCanonicalSha256}`;
  const cachedOracles = canonicalOracleReplayCache.get(suppliedOracle);
  let oracle = cachedOracles?.get(oracleReplayKey);
  if (oracle === undefined) {
    oracle = buildStreamedLawfulDavisOracle({
      system: suppliedOracle.system,
      generatorImages,
    });
    const updatedCache = cachedOracles ?? new Map();
    updatedCache.set(oracleReplayKey, oracle);
    canonicalOracleReplayCache.set(suppliedOracle, updatedCache);
  }
  if (oracle.structureHash !== suppliedOracle.structureHash) {
    errors.push(
      "The supplied streamed-oracle methods do not replay its structure hash.",
    );
  }
  if (
    oracle.actionRowsCanonicalSha256 !==
    suppliedOracle.actionRowsCanonicalSha256
  ) {
    errors.push(
      "The supplied streamed-oracle neighbor rows do not replay its action hash.",
    );
  }
  if (oracle.walls.structureHash !== suppliedOracle.walls.structureHash) {
    errors.push(
      "The supplied streamed-oracle methods do not replay its wall-system hash.",
    );
  }
  if (suppliedEvaluation.oracleStructureHash !== oracle.structureHash) {
    errors.push(
      "The lawful evaluation belongs to a different streamed oracle.",
    );
  }
  const canonicalCandidates = suppliedEvaluation.candidates.map((entry) => ({
    id: entry.id,
    wallSigns: { ...entry.wallSigns },
  }));
  const evaluationReplayKey = canonicalSha256({
    schemaVersion: 1,
    oracleStructureHash: oracle.structureHash,
    candidates: canonicalCandidates,
  });
  const cachedEvaluations = canonicalEvaluationReplayCache.get(oracle);
  let evaluation = cachedEvaluations?.get(evaluationReplayKey);
  if (evaluation === undefined) {
    evaluation = oracle.bindCoorientations(canonicalCandidates);
    const updatedCache = cachedEvaluations ?? new Map();
    updatedCache.set(evaluationReplayKey, evaluation);
    canonicalEvaluationReplayCache.set(oracle, updatedCache);
  }
  const candidateIndex = options.candidateIndex;
  const closure = evaluation.closure.candidateSummaries[candidateIndex];
  if (
    closure === undefined ||
    canonicalSha256(suppliedClosure) !== canonicalSha256(closure)
  ) {
    errors.push(
      "The selected lawful closure summary does not equal canonical action-rooted replay.",
    );
  }
  let computedCompressionHash = "";
  try {
    computedCompressionHash = computeGeneralizedCompressionArchiveHash(
      generalizedCompression,
    );
    if (computedCompressionHash !== generalizedCompression.archiveHash) {
      errors.push("The generalized-compression archive hash is stale.");
    }
  } catch (error) {
    errors.push(
      `The generalized-compression archive is not canonical: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (
    generalizedCompression.status !== "passed" ||
    generalizedCompression.method !==
      "exact-action-rooted-spherical-orbit-compression"
  ) {
    errors.push(
      "The supplied generalized compression is not a passed exact artifact.",
    );
  }
  if (
    generalizedCompression.source.systemCanonicalSha256 !==
    canonicalSha256(oracle.system)
  ) {
    errors.push("The generalized compression uses a different Coxeter system.");
  }
  if (generalizedCompression.source.degree !== oracle.degree) {
    errors.push(
      "The generalized compression uses a different quotient action.",
    );
  }
  const generalizedCompressionActionHash = canonicalSha256({
    schemaVersion: 1,
    index: oracle.degree,
    generatorImages,
  });
  if (
    generalizedCompression.source.actionRowsCanonicalSha256 !==
    generalizedCompressionActionHash
  ) {
    errors.push(
      "The generalized compression uses a different quotient action.",
    );
  }
  if (
    !recordEquals(
      generalizedCompression.cellCountByDimension,
      oracle.cellCountByDimension,
    )
  ) {
    errors.push(
      "The generalized-compression and streamed cell counts disagree.",
    );
  }
  const compressionTypes = [...generalizedCompression.sphericalTypes].sort(
    (left, right) => left.typeIndex - right.typeIndex,
  );
  const streamedTypes = [...oracle.sphericalTypes].sort(
    (left, right) => left.typeIndex - right.typeIndex,
  );
  if (
    canonicalSha256(
      compressionTypes.map((type) => ({
        typeIndex: type.typeIndex,
        generators: type.generators,
        dimension: type.dimension,
        subgroupOrder: type.subgroupOrder,
        cellCount: type.compressedCellCount,
      })),
    ) !==
    canonicalSha256(
      streamedTypes.map((type) => ({
        typeIndex: type.typeIndex,
        generators: type.generators,
        dimension: type.dimension,
        subgroupOrder: type.subgroupOrder,
        cellCount: type.cellCount,
      })),
    )
  ) {
    errors.push(
      "The generalized-compression fiber catalogue disagrees with the streamed oracle.",
    );
  }
  const requiredCompressionChecks = [
    generalizedCompression.checks.sourceTorsionFreeCertificateReplayed,
    generalizedCompression.checks.completeSphericalCatalogue,
    generalizedCompression.checks.everyRootedCellRecorded,
    generalizedCompression.checks.allFiberCardinalitiesEqualSphericalOrders,
    generalizedCompression.checks.everyProperSphericalFaceTypeChecked,
    generalizedCompression.checks.allFaceMapsCompatible,
    generalizedCompression.checks.rankAtMostTwoDefinitionAgreementPassed,
  ];
  if (!requiredCompressionChecks.every(Boolean)) {
    errors.push("At least one generalized-compression source check is false.");
  }
  try {
    errors.push(
      ...replayGeneralizedCompressionFromOracle(
        options,
        oracle,
        generatorImages,
      ),
    );
  } catch (error) {
    errors.push(
      `Generalized-compression action-rooted replay failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (
    closure.downwardClosureViolationCount !== 0 ||
    !Object.values(closure.checks).every(Boolean)
  ) {
    errors.push(
      "The streamed retained cell set is not a certified downward-closed lawful complex.",
    );
  }
  const source: DirectCellwiseAffineCertificate["source"] = {
    oracleStructureHash: oracle.structureHash,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    wallStructureHash: oracle.walls.structureHash,
    coorientationHash: closure.coorientationHash,
    retentionHash: closure.retentionHash,
    closureHash: closure.closureHash,
    generalizedCompressionArchiveHash: generalizedCompression.archiveHash,
    evaluationCandidateIndex: options.candidateIndex,
  };
  const sourceHash = canonicalSha256({
    schemaVersion: 1,
    kind: "direct-cellwise-affine-source",
    candidateId: candidate.id,
    candidateIndex: options.candidateIndex,
    source,
  });
  const cellSetDigest = canonicalSha256({
    schemaVersion: 1,
    method: "streamed-exact-retained-cell-set-source-binding",
    sourceHash,
    candidateId: candidate.id,
    streamedRetentionHash: closure.retentionHash,
    streamedClosureHash: closure.closureHash,
  });
  return {
    oracle,
    evaluation,
    candidateIndex,
    candidateId: candidate.id,
    sourceHash,
    cellSetDigest,
    retainedCellCount: closure.retainedCellCount,
    retainedCellCountByDimension: {
      ...closure.retainedCellCountByDimension,
    },
    source,
    errors: uniqueSortedStrings(errors),
  };
}

function reflectionMatrices(
  oracle: StreamedLawfulDavisOracle,
  generators: readonly number[],
): bigint[][][] | null {
  const dimension = generators.length;
  const matrices: bigint[][][] = [];
  for (
    let localGenerator = 0;
    localGenerator < dimension;
    localGenerator += 1
  ) {
    const matrix = identityMatrix(dimension);
    matrix[localGenerator][localGenerator] = -1n;
    for (let localRoot = 0; localRoot < dimension; localRoot += 1) {
      if (localRoot === localGenerator) continue;
      const first = generators[localGenerator];
      const second = generators[localRoot];
      const exponent = oracle.system.coxeterMatrix[first][second];
      if (exponent === 2) continue;
      if (exponent === 3) {
        // Columns are roots. In the simply-laced representation,
        // s_i(alpha_j)=alpha_j+alpha_i when m_ij=3.
        matrix[localGenerator][localRoot] = 1n;
        continue;
      }
      return null;
    }
    matrices.push(matrix);
  }
  return matrices;
}

function formatEquation(
  row: readonly bigint[],
  orderedWallIds: readonly string[],
): string {
  const terms: string[] = [];
  for (let index = 0; index < row.length; index += 1) {
    const coefficient = row[index];
    if (coefficient === 0n) continue;
    terms.push(`${coefficient.toString()}*y(${orderedWallIds[index]})`);
  }
  return `${terms.join(" + ")} = 0`;
}

function enumerateAffineEquations(
  options: DirectCellwiseAffineOptions,
  source: PreparedSource,
  zoneVariables: ZoneVariableModel,
): EquationSystem {
  const { oracle, evaluation, candidateIndex } = source;
  const { orderedVariableIds, edgeVariableIndex } = zoneVariables;
  const rowsByKey = new Map<string, bigint[]>();
  const witnessByRow = new Map<string, DirectAffineEquationWitness>();
  const retainedCellCountByDimension = {
    ...source.retainedCellCountByDimension,
  };
  const errors: string[] = [];
  const unsupportedTypes = new Set<string>();
  let equationCount = 0;
  const retainedCellCount = source.retainedCellCount;
  let explicitlyCheckedRankTwoCells = 0;
  let explicitlyCheckedHigherCells = 0;
  let higherEdgeEquationsChecked = 0;
  let higherEdgeEquationsExpected = 0;
  let everyCellOrbitMatrixConsistent = true;
  let rootRepresentationExact = true;
  let decisivePositiveObstruction: DirectAffineEquationWitness | null = null;
  let stopRequested = false;
  let retainedHigherCellsChecked = 0;
  let rankTwoFaceOccurrencesChecked = 0;
  let everyExpectedRankTwoFacePresent = true;
  let everySupportingRankTwoFaceRetained = true;
  let sharedFacesUseZoneComponentsAndCocycle = true;
  let faceOccurrenceTranscriptHash = canonicalSha256({
    schemaVersion: 1,
    method: "retained-higher-face-global-wall-transcript-seed",
    sourceCellSetDigest: source.cellSetDigest,
  });
  const higherEvidenceByType: Array<{
    typeIndex: number;
    retainedCellsChecked: number;
    rankTwoFaceOccurrencesChecked: number;
    expectedRankTwoFaceOccurrences: number;
  }> = [];

  const addEquation = (
    row: readonly bigint[],
    cell: StreamedDavisCell,
    point: number,
    generator: number,
  ): void => {
    equationCount += 1;
    const normalized = normalizeEqualityRow(row);
    if (normalized === null) return;
    const key = equalityRowKey(normalized);
    if (!rowsByKey.has(key)) rowsByKey.set(key, normalized);
    if (!witnessByRow.has(key)) {
      const witness = {
        cellId: generalizedLawfulCellId(cell),
        point,
        generator,
        relation: formatEquation(normalized, orderedVariableIds),
      };
      witnessByRow.set(key, witness);
      if (normalized.filter((coefficient) => coefficient !== 0n).length === 1) {
        decisivePositiveObstruction = witness;
        if (options.affineScan === "stop-on-first-obstruction") {
          stopRequested = true;
        }
      }
    }
  };

  for (const type of [...oracle.sphericalTypes].sort(
    (left, right) =>
      left.dimension - right.dimension || left.typeIndex - right.typeIndex,
  )) {
    // Rank-two cells are deliberately visited first so an exact obstruction
    // can stop a target-sized scan early. In exhaustive mode we nevertheless
    // replay the full root matrix and every edge equation in every retained
    // higher cell; the higher-cell claim does not rest on a name-only lemma.
    if (type.dimension < 2) continue;
    const typeReflections = reflectionMatrices(oracle, type.generators);
    oracle.forEachCell(type.typeIndex, (cell) => {
      if (stopRequested) return;
      if (!evaluation.isRetained(cell, candidateIndex)) return;
      if (type.dimension === 2) explicitlyCheckedRankTwoCells += 1;
      else {
        explicitlyCheckedHigherCells += 1;
        higherEdgeEquationsExpected +=
          type.subgroupOrder * type.generators.length;
      }
      if (typeReflections === null) {
        rootRepresentationExact = false;
        unsupportedTypes.add(type.id);
      }
      const vertices = [...oracle.cellVertices(cell)].sort(compareNumbers);
      const vertexSet = new Set(vertices);
      if (
        vertices.length !== type.subgroupOrder ||
        vertexSet.size !== vertices.length ||
        vertices[0] !== cell.representativePoint
      ) {
        everyCellOrbitMatrixConsistent = false;
        errors.push(
          `${generalizedLawfulCellId(cell)} does not replay its certified |W_T|-element rooted fiber.`,
        );
        return;
      }
      if (cell.dimension === 0 || typeReflections === null) return;
      const dimension = type.generators.length;
      if (dimension !== cell.dimension) {
        everyCellOrbitMatrixConsistent = false;
        errors.push(
          `${generalizedLawfulCellId(cell)} has dimension ${cell.dimension} but ${dimension} generators.`,
        );
        return;
      }
      const root = cell.representativePoint;
      const matrixByPoint = new Map<number, bigint[][]>([
        [root, identityMatrix(dimension)],
      ]);
      const queue = [root];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const point = queue[cursor];
        const current = matrixByPoint.get(point)!;
        for (let local = 0; local < dimension; local += 1) {
          const generator = type.generators[local];
          const target = oracle.neighbor(point, generator);
          if (!vertexSet.has(target)) {
            everyCellOrbitMatrixConsistent = false;
            errors.push(
              `${generalizedLawfulCellId(cell)} is not closed under generator ${generator}.`,
            );
            continue;
          }
          const expected = multiplyIntegerMatrices(
            current,
            typeReflections[local],
          );
          const existing = matrixByPoint.get(target);
          if (existing === undefined) {
            matrixByPoint.set(target, expected);
            queue.push(target);
          } else if (!integerMatricesEqual(existing, expected)) {
            everyCellOrbitMatrixConsistent = false;
            errors.push(
              `${generalizedLawfulCellId(cell)} gives inconsistent exact root matrices at q${target}.`,
            );
          }
        }
      }
      if (matrixByPoint.size !== vertices.length) {
        everyCellOrbitMatrixConsistent = false;
        errors.push(
          `${generalizedLawfulCellId(cell)} root traversal reached ${matrixByPoint.size}/${vertices.length} vertices.`,
        );
        return;
      }
      const rootTerms = type.generators.map((generator) => {
        const edgeIndex = oracle.wallBinding(root, generator).edgeIndex;
        return {
          variableIndex: edgeVariableIndex[edgeIndex],
          sign: evaluation.edgeIncrement(root, generator, candidateIndex),
        };
      });
      for (const point of vertices) {
        if (stopRequested) break;
        const matrix = matrixByPoint.get(point)!;
        for (let local = 0; local < dimension; local += 1) {
          const generator = type.generators[local];
          const edgeIndex = oracle.wallBinding(point, generator).edgeIndex;
          const variableIndex = edgeVariableIndex[edgeIndex];
          const row = Array.from(
            { length: orderedVariableIds.length },
            () => 0n,
          );
          row[variableIndex] += BigInt(
            evaluation.edgeIncrement(point, generator, candidateIndex),
          );
          for (let rootLocal = 0; rootLocal < dimension; rootLocal += 1) {
            const term = rootTerms[rootLocal];
            row[term.variableIndex] -=
              matrix[rootLocal][local] * BigInt(term.sign);
          }
          if (type.dimension >= 3) higherEdgeEquationsChecked += 1;
          addEquation(row, cell, point, generator);
          if (stopRequested) break;
        }
      }
    });
    if (stopRequested) break;
  }
  if (unsupportedTypes.size > 0) {
    errors.push(
      `Exact simple-root arithmetic currently supports only finite exponents 2 and 3; unsupported retained types: ${[...unsupportedTypes].sort(compareStrings).join(", ")}.`,
    );
  }
  const expectedHigherCells = Object.entries(
    source.retainedCellCountByDimension,
  ).reduce(
    (sum, [dimension, count]) => (Number(dimension) >= 3 ? sum + count : sum),
    0,
  );
  if (!stopRequested) {
    const rankTwoTypes = oracle.sphericalTypes.filter(
      (type) => type.dimension === 2,
    );
    // A weighted simply-laced root zonotope restricts on a parabolic face to
    // the corresponding root-subsystem zonotope, up to translation. The
    // transcript below checks that both sides of every retained face use the
    // same quotient geometric edges, selected zone-component ids, and cocycle
    // signs. The ambient wall map need not be injective: self-osculating zones
    // share a scale only when the selected equivalence relates them.
    for (const type of [...oracle.sphericalTypes]
      .filter((entry) => entry.dimension >= 3)
      .sort((left, right) => left.typeIndex - right.typeIndex)) {
      const generatorSet = new Set(type.generators);
      const supportingPairTypes = rankTwoTypes.filter((pairType) =>
        pairType.generators.every((generator) => generatorSet.has(generator)),
      );
      const expectedFacesPerCell = supportingPairTypes.reduce(
        (sum, pairType) => sum + type.subgroupOrder / pairType.subgroupOrder,
        0,
      );
      let typeCells = 0;
      let typeOccurrences = 0;
      oracle.forEachCell(type.typeIndex, (cell) => {
        if (!evaluation.isRetained(cell, candidateIndex)) return;
        typeCells += 1;
        retainedHigherCellsChecked += 1;
        const higherVertices = new Set(oracle.cellVertices(cell));
        const faceIds = new Set<string>();
        let occurrenceCount = 0;
        oracle.forEachRankTwoFace(cell, (face) => {
          occurrenceCount += 1;
          typeOccurrences += 1;
          rankTwoFaceOccurrencesChecked += 1;
          faceIds.add(generalizedLawfulCellId(face));
          if (!evaluation.isRetained(face, candidateIndex)) {
            everySupportingRankTwoFaceRetained = false;
            errors.push(
              `${generalizedLawfulCellId(cell)} uses discarded supporting face ${generalizedLawfulCellId(face)}.`,
            );
          }
          const faceVertices = [...oracle.cellVertices(face)].sort(
            compareNumbers,
          );
          const edgeZoneSignature: Array<{
            sourcePoint: number;
            targetPoint: number;
            generator: number;
            wallId: string;
            zoneVariableId: string;
            increment: number;
          }> = [];
          for (const sourcePoint of faceVertices) {
            if (!higherVertices.has(sourcePoint)) {
              sharedFacesUseZoneComponentsAndCocycle = false;
              errors.push(
                `${generalizedLawfulCellId(face)} has q${sourcePoint} outside ${generalizedLawfulCellId(cell)}.`,
              );
            }
            for (const generator of face.generators) {
              const targetPoint = oracle.neighbor(sourcePoint, generator);
              if (sourcePoint >= targetPoint) continue;
              if (!higherVertices.has(targetPoint)) {
                sharedFacesUseZoneComponentsAndCocycle = false;
                errors.push(
                  `${generalizedLawfulCellId(face)} edge q${sourcePoint}-q${targetPoint} leaves ${generalizedLawfulCellId(cell)}.`,
                );
              }
              edgeZoneSignature.push({
                sourcePoint,
                targetPoint,
                generator,
                wallId: oracle.wallIdForEdge(sourcePoint, generator),
                zoneVariableId:
                  orderedVariableIds[
                    edgeVariableIndex[
                      oracle.wallBinding(sourcePoint, generator).edgeIndex
                    ]
                  ],
                increment: evaluation.edgeIncrement(
                  sourcePoint,
                  generator,
                  candidateIndex,
                ),
              });
            }
          }
          faceOccurrenceTranscriptHash = canonicalSha256({
            previous: faceOccurrenceTranscriptHash,
            higherCellId: generalizedLawfulCellId(cell),
            faceCellId: generalizedLawfulCellId(face),
            edgeZoneSignature,
          });
        });
        if (
          occurrenceCount !== expectedFacesPerCell ||
          faceIds.size !== expectedFacesPerCell
        ) {
          everyExpectedRankTwoFacePresent = false;
          errors.push(
            `${generalizedLawfulCellId(cell)} exposes ${occurrenceCount} rank-two face occurrences (${faceIds.size} distinct); expected ${expectedFacesPerCell}.`,
          );
        }
      });
      higherEvidenceByType.push({
        typeIndex: type.typeIndex,
        retainedCellsChecked: typeCells,
        rankTwoFaceOccurrencesChecked: typeOccurrences,
        expectedRankTwoFaceOccurrences: typeCells * expectedFacesPerCell,
      });
    }
  }
  const expectedRankTwoCells = source.retainedCellCountByDimension["2"] ?? 0;
  const everyRetainedCellEnumerated =
    !stopRequested &&
    explicitlyCheckedRankTwoCells === expectedRankTwoCells &&
    explicitlyCheckedHigherCells === expectedHigherCells &&
    higherEdgeEquationsChecked === higherEdgeEquationsExpected &&
    retainedHigherCellsChecked === expectedHigherCells;
  if (!everyRetainedCellEnumerated && decisivePositiveObstruction === null) {
    errors.push(
      `Affine transition enumeration reached ${explicitlyCheckedRankTwoCells}/${expectedRankTwoCells} retained rank-two cells, ${explicitlyCheckedHigherCells}/${expectedHigherCells} retained higher cells, and ${higherEdgeEquationsChecked}/${higherEdgeEquationsExpected} higher edge equations.`,
    );
  }
  return {
    variableScope: zoneVariables.scope,
    orderedVariableIds: [...orderedVariableIds],
    variableModelDigest: zoneVariables.digest,
    rows: [...rowsByKey.values()].sort((left, right) =>
      compareStrings(equalityRowKey(left), equalityRowKey(right)),
    ),
    witnessByRow,
    equationCount,
    retainedCellCount,
    retainedCellCountByDimension,
    explicitlyCheckedRankTwoCells,
    explicitlyCheckedHigherCells,
    higherEdgeEquationsChecked,
    higherEdgeEquationsExpected,
    higherChartsVerifiedByFullRootTraversal: explicitlyCheckedHigherCells,
    scanOutcome:
      stopRequested && decisivePositiveObstruction !== null
        ? "positive-obstruction-found"
        : "exhaustive",
    decisivePositiveObstruction,
    everyRetainedCellEnumerated,
    rootRepresentationExact,
    everyCellOrbitMatrixConsistent,
    everyRetainedHigherCellSupportedByRetainedRankTwoFaces:
      !stopRequested &&
      retainedHigherCellsChecked === expectedHigherCells &&
      higherEdgeEquationsChecked === higherEdgeEquationsExpected &&
      everyExpectedRankTwoFacePresent &&
      everySupportingRankTwoFaceRetained &&
      sharedFacesUseZoneComponentsAndCocycle,
    everyExpectedRankTwoFacePresent,
    everySupportingRankTwoFaceRetained,
    sharedFacesUseZoneComponentsAndCocycle,
    retainedHigherCellsChecked,
    rankTwoFaceOccurrencesChecked,
    higherCellEvidenceDigest: canonicalSha256({
      schemaVersion: 1,
      theoremId: "simply-laced-weighted-root-zonotope-face-gluing",
      theoremVersion: 1,
      verificationMode: "full-retained-cell-root-traversal",
      sourceCellSetDigest: source.cellSetDigest,
      variableScope: zoneVariables.scope,
      variableModelDigest: zoneVariables.digest,
      expectedHigherCells,
      retainedHigherCellsChecked,
      explicitlyCheckedHigherCells,
      higherEdgeEquationsExpected,
      higherEdgeEquationsChecked,
      rankTwoFaceOccurrencesChecked,
      faceOccurrenceTranscriptHash,
      higherEvidenceByType,
      everyExpectedRankTwoFacePresent,
      everySupportingRankTwoFaceRetained,
      sharedFacesUseZoneComponentsAndCocycle,
      scanOutcome:
        stopRequested && decisivePositiveObstruction !== null
          ? "positive-obstruction-found"
          : "exhaustive",
    }),
    errors: uniqueSortedStrings(errors),
  };
}

function buildScaleResult(
  mode: "unit" | "positive",
  options: DirectCellwiseAffineOptions,
  source: PreparedSource,
  equations: EquationSystem,
): DirectAffineScaleResult {
  const orderedVariableIds = equations.orderedVariableIds;
  const weightRule: DirectAffineScaleResult["weightRule"] =
    mode === "unit"
      ? "equal-zone-scales"
      : equations.variableScope === "ambient-quotient-walls-before-retention"
        ? "positive-ambient-wall-inverse-zone-scales"
        : "positive-retained-wall-component-inverse-zone-scales";
  const variableScope: DirectAffineScaleResult["variableScope"] =
    mode === "unit" ? "all-zones-equal" : equations.variableScope;
  const kernel = nullspaceBasis(equations.rows, orderedVariableIds.length);
  const equationDigest = canonicalSha256({
    schemaVersion: 1,
    method: "exact-homogeneous-root-objective-equations",
    sourceHash: source.sourceHash,
    sourceCellSetDigest: source.cellSetDigest,
    variableScope: equations.variableScope,
    variableModelDigest: equations.variableModelDigest,
    orderedVariableIds,
    equationCount: equations.equationCount,
    independentEquationCount: kernel.rank,
    rows: equations.rows.map(equalityRowKey),
  });
  const baseChecks = {
    everyRetainedCellEnumerated: equations.everyRetainedCellEnumerated,
    rootRepresentationExact: equations.rootRepresentationExact,
    everyCellOrbitMatrixConsistent: equations.everyCellOrbitMatrixConsistent,
    everyRetainedHigherCellSupportedByRetainedRankTwoFaces:
      equations.everyRetainedHigherCellSupportedByRetainedRankTwoFaces,
  };
  const sourceValid = source.errors.length === 0;
  const sourceAndConstructedRowsSound =
    sourceValid &&
    equations.rootRepresentationExact &&
    equations.everyCellOrbitMatrixConsistent &&
    equations.errors.every(
      (error) =>
        !error.includes("does not replay") &&
        !error.includes("not closed") &&
        !error.includes("inconsistent exact root") &&
        !error.includes("root traversal") &&
        !error.includes("dimension"),
    );
  const canSolve =
    sourceAndConstructedRowsSound && Object.values(baseChecks).every(Boolean);
  const maxWitnesses = Math.max(0, options.maxAffineWitnesses ?? 32);
  const nonClaims = [
    "The variables y_A are inverse zone scales, not new cocycle coefficients; the original edge increments remain integral +/-1.",
    "Infeasibility concerns the stated simply-laced/right-angled weighted Coxeter-zonotope model only. It does not rule out arbitrary compatible affine-polytope charts.",
    ...(equations.variableScope === "ambient-quotient-walls-before-retention"
      ? [
          "This diagnostic identifies scales along ambient quotient walls computed before retention; discarded polygons can split those walls, as tested separately by the retained-component result.",
        ]
      : [
          "Retained zone components use only opposite-edge relations in retained rank-two cells; no discarded polygon contributes a scale identification.",
        ]),
  ];

  if (mode === "unit") {
    const violatingRows = equations.rows.filter(
      (row) => row.reduce((sum, coefficient) => sum + coefficient, 0n) !== 0n,
    );
    const affineEdgeEquationsSatisfied = canSolve && violatingRows.length === 0;
    const inverseZoneScales = affineEdgeEquationsSatisfied
      ? Object.fromEntries(
          orderedVariableIds.map((variableId) => [variableId, "1"]),
        )
      : null;
    const solutionDigest =
      inverseZoneScales === null
        ? null
        : canonicalSha256({
            equationDigest,
            weightRule,
            inverseZoneScales,
          });
    const outcome: DirectAffineFeasibilityOutcome =
      !sourceAndConstructedRowsSound
        ? "not-established"
        : violatingRows.length > 0
          ? "infeasible-for-canonical-model"
          : !canSolve
            ? "not-established"
            : affineEdgeEquationsSatisfied
              ? "feasible"
              : "infeasible-for-canonical-model";
    return {
      outcome,
      weightRule,
      variableScope,
      equationCount: equations.equationCount,
      independentEquationCount: kernel.rank,
      inverseZoneScales,
      violatingEquationCount: violatingRows.length,
      witnesses: violatingRows.slice(0, maxWitnesses).flatMap((row) => {
        const witness = equations.witnessByRow.get(equalityRowKey(row));
        return witness ? [witness] : [];
      }),
      checks: {
        ...baseChecks,
        affineEdgeEquationsSatisfied,
        everyInverseZoneScalePositive: inverseZoneScales !== null,
      },
      equationDigest,
      solutionDigest,
      errors: uniqueSortedStrings([
        ...source.errors,
        ...equations.errors,
        ...(outcome === "infeasible-for-canonical-model"
          ? [
              "Equal zone scales do not make the unit wall cocycle affine in every retained Coxeter cell.",
            ]
          : []),
      ]),
      nonClaims,
    };
  }

  if (
    equations.decisivePositiveObstruction !== null &&
    sourceAndConstructedRowsSound
  ) {
    return {
      outcome: "infeasible-for-canonical-model",
      weightRule,
      variableScope,
      equationCount: equations.equationCount,
      independentEquationCount: kernel.rank,
      inverseZoneScales: null,
      violatingEquationCount: 1,
      witnesses: [equations.decisivePositiveObstruction].slice(0, maxWitnesses),
      checks: {
        ...baseChecks,
        affineEdgeEquationsSatisfied: false,
        everyInverseZoneScalePositive: false,
      },
      equationDigest,
      solutionDigest: null,
      errors: uniqueSortedStrings([
        ...source.errors,
        ...equations.errors,
        "An exact singleton equation forces one inverse zone scale to zero.",
      ]),
      nonClaims,
    };
  }

  if (!canSolve) {
    return {
      outcome: "not-established",
      weightRule,
      variableScope,
      equationCount: equations.equationCount,
      independentEquationCount: kernel.rank,
      inverseZoneScales: null,
      violatingEquationCount: 0,
      witnesses: [],
      checks: {
        ...baseChecks,
        affineEdgeEquationsSatisfied: false,
        everyInverseZoneScalePositive: false,
      },
      equationDigest,
      solutionDigest: null,
      errors: uniqueSortedStrings([...source.errors, ...equations.errors]),
      nonClaims,
    };
  }
  const solution = positiveIntegerNullVector(
    equations.rows,
    orderedVariableIds.length,
  );
  if (
    solution.status === "resource-limit" ||
    solution.status === "internal-error"
  ) {
    return {
      outcome: "not-established",
      weightRule,
      variableScope,
      equationCount: equations.equationCount,
      independentEquationCount: solution.rank,
      inverseZoneScales: null,
      violatingEquationCount: 0,
      witnesses: [],
      checks: {
        ...baseChecks,
        affineEdgeEquationsSatisfied: false,
        everyInverseZoneScalePositive: false,
      },
      equationDigest,
      solutionDigest: null,
      errors: uniqueSortedStrings([
        ...equations.errors,
        solution.status === "resource-limit"
          ? `Exact positivity elimination exceeded ${MAX_FOURIER_MOTZKIN_ROWS} rows.`
          : "Exact positivity solver postvalidation failed; no mathematical infeasibility conclusion is made.",
      ]),
      nonClaims,
    };
  }
  if (solution.status === "infeasible") {
    return {
      outcome: "infeasible-for-canonical-model",
      weightRule,
      variableScope,
      equationCount: equations.equationCount,
      independentEquationCount: solution.rank,
      inverseZoneScales: null,
      violatingEquationCount: 0,
      witnesses: [],
      checks: {
        ...baseChecks,
        affineEdgeEquationsSatisfied: false,
        everyInverseZoneScalePositive: false,
      },
      equationDigest,
      solutionDigest: null,
      errors: uniqueSortedStrings([
        ...equations.errors,
        "The exact affine equation kernel contains no vector with every inverse zone scale positive.",
      ]),
      nonClaims,
    };
  }
  const inverseZoneScales = Object.fromEntries(
    orderedVariableIds.map((variableId, index) => [
      variableId,
      solution.vector[index].toString(),
    ]),
  );
  const affineEdgeEquationsSatisfied = equations.rows.every(
    (row) =>
      row.reduce(
        (sum, coefficient, index) => sum + coefficient * solution.vector[index],
        0n,
      ) === 0n,
  );
  const everyInverseZoneScalePositive = solution.vector.every(
    (value) => value > 0n,
  );
  const solutionDigest = canonicalSha256({
    equationDigest,
    weightRule,
    inverseZoneScales,
  });
  return {
    outcome:
      affineEdgeEquationsSatisfied && everyInverseZoneScalePositive
        ? "feasible"
        : "not-established",
    weightRule,
    variableScope,
    equationCount: equations.equationCount,
    independentEquationCount: solution.rank,
    inverseZoneScales,
    violatingEquationCount: affineEdgeEquationsSatisfied ? 0 : 1,
    witnesses: [],
    checks: {
      ...baseChecks,
      affineEdgeEquationsSatisfied,
      everyInverseZoneScalePositive,
    },
    equationDigest,
    solutionDigest,
    errors: uniqueSortedStrings(equations.errors),
    nonClaims,
  };
}

function buildFeasibilityCertificate(
  options: DirectCellwiseAffineOptions,
  source: PreparedSource,
): DirectCellwiseAffineFeasibilityCertificate {
  let zoneModels: ReturnType<typeof buildZoneVariableModels>;
  let ambientEquations: EquationSystem;
  let retainedEquations: EquationSystem;
  try {
    zoneModels = buildZoneVariableModels(source);
    ambientEquations = enumerateAffineEquations(
      options,
      source,
      zoneModels.ambient,
    );
    retainedEquations = enumerateAffineEquations(
      options,
      source,
      zoneModels.retained,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = (
      weightRule: DirectAffineScaleResult["weightRule"],
      variableScope: DirectAffineScaleResult["variableScope"],
    ): DirectAffineScaleResult => ({
      outcome: "not-established",
      weightRule,
      variableScope,
      equationCount: 0,
      independentEquationCount: 0,
      inverseZoneScales: null,
      violatingEquationCount: 0,
      witnesses: [],
      checks: {
        everyRetainedCellEnumerated: false,
        rootRepresentationExact: false,
        everyCellOrbitMatrixConsistent: false,
        everyRetainedHigherCellSupportedByRetainedRankTwoFaces: false,
        affineEdgeEquationsSatisfied: false,
        everyInverseZoneScalePositive: false,
      },
      equationDigest: canonicalSha256({
        sourceHash: source.sourceHash,
        message,
      }),
      solutionDigest: null,
      errors: [message],
      nonClaims: [
        "No affine feasibility conclusion is made when exact equation construction fails.",
      ],
    });
    const equalZoneScales = failed("equal-zone-scales", "all-zones-equal");
    const ambientWallInverseZoneScales = failed(
      "positive-ambient-wall-inverse-zone-scales",
      "ambient-quotient-walls-before-retention",
    );
    const retainedWallComponentInverseZoneScales = failed(
      "positive-retained-wall-component-inverse-zone-scales",
      "retained-opposite-edge-components",
    );
    const payload = {
      status: "failed" as const,
      method: "canonical-coxeter-cell-objective-function-equations" as const,
      affineModel:
        "zone-scaled-simply-laced-right-angled-coxeter-zonotopes" as const,
      rootCoordinates: "simple-root-basis" as const,
      scanMode: options.affineScan ?? "exhaustive",
      sourceCompressionArchiveHash: options.generalizedCompression.archiveHash,
      sourceCellSetDigest: source.cellSetDigest,
      retainedCellCount: 0,
      retainedCellCountByDimension: {},
      explicitlyCheckedRankTwoCells: 0,
      explicitlyCheckedHigherCells: 0,
      higherEdgeEquationsChecked: 0,
      higherEdgeEquationsExpected: 0,
      higherChartsVerifiedByFullRootTraversal: 0,
      supportedFiniteExponents: [...SUPPORTED_FINITE_EXPONENTS],
      retainedZoneComponents: {
        method: "opposite-edge-dsu-over-retained-rank-two-cells" as const,
        geometricEdgeCount: source.oracle.geometricEdgeCount,
        retainedRankTwoCellCount: 0,
        oppositeEdgeRelationCount: 0,
        componentCount: 0,
        componentDigest: canonicalSha256({
          sourceCellSetDigest: source.cellSetDigest,
          constructionError: message,
        }),
        checks: {
          everyGeometricEdgeAssigned: false,
          everyRetainedRankTwoCellVisited: false,
          onlyRetainedRankTwoOppositionsUsed: false,
        },
      },
      higherCellExtension: {
        theoremId: "simply-laced-weighted-root-zonotope-face-gluing" as const,
        theoremVersion: 1 as const,
        verificationMode: "full-retained-cell-root-traversal" as const,
        transitionConvention: "R(ws_i)=R(w)R(s_i)-on-root-columns" as const,
        retainedHigherCellsExpected: 0,
        retainedHigherCellsChecked: 0,
        higherEdgeEquationsExpected: 0,
        higherEdgeEquationsChecked: 0,
        rankTwoFaceOccurrencesChecked: 0,
        evidenceDigest: canonicalSha256({
          sourceCellSetDigest: source.cellSetDigest,
          constructionError: message,
        }),
        checks: {
          everyRetainedHigherCellVisited: false,
          everyRetainedHigherCellEdgeEquationChecked: false,
          everyExpectedRankTwoFacePresent: false,
          everySupportingRankTwoFaceRetained: false,
          sharedFacesUseZoneComponentsAndCocycle: false,
        },
      },
      equalZoneScales,
      ambientWallInverseZoneScales,
      retainedWallComponentInverseZoneScales,
      errors: [message],
      nonClaims: [
        "Failure to construct the exact equation system is not an affine infeasibility result.",
      ],
    };
    return {
      ...payload,
      feasibilityDigest: canonicalSha256(payload),
    };
  }
  const equalZoneScales = buildScaleResult(
    "unit",
    options,
    source,
    ambientEquations,
  );
  const ambientWallInverseZoneScales = buildScaleResult(
    "positive",
    options,
    source,
    ambientEquations,
  );
  const retainedWallComponentInverseZoneScales = buildScaleResult(
    "positive",
    options,
    source,
    retainedEquations,
  );
  const status: DirectCellwiseAffineFeasibilityCertificate["status"] =
    source.errors.length > 0 ||
    (!retainedEquations.everyRetainedCellEnumerated &&
      retainedEquations.decisivePositiveObstruction === null) ||
    !retainedEquations.everyCellOrbitMatrixConsistent ||
    (!retainedEquations.everyRetainedHigherCellSupportedByRetainedRankTwoFaces &&
      retainedEquations.decisivePositiveObstruction === null)
      ? "failed"
      : retainedWallComponentInverseZoneScales.outcome === "feasible"
        ? "passed"
        : "not-established";
  const errors = uniqueSortedStrings([
    ...source.errors,
    ...ambientEquations.errors,
    ...retainedEquations.errors,
    ...equalZoneScales.errors,
    ...ambientWallInverseZoneScales.errors,
    ...retainedWallComponentInverseZoneScales.errors,
  ]);
  const retainedHigherCellsExpected = Object.entries(
    source.retainedCellCountByDimension,
  ).reduce(
    (sum, [dimension, count]) => (Number(dimension) >= 3 ? sum + count : sum),
    0,
  );
  const everyRetainedHigherCellVisited =
    retainedEquations.retainedHigherCellsChecked ===
    retainedHigherCellsExpected;
  const payload = {
    status,
    method: "canonical-coxeter-cell-objective-function-equations" as const,
    affineModel:
      "zone-scaled-simply-laced-right-angled-coxeter-zonotopes" as const,
    rootCoordinates: "simple-root-basis" as const,
    scanMode: options.affineScan ?? "exhaustive",
    sourceCompressionArchiveHash: options.generalizedCompression.archiveHash,
    sourceCellSetDigest: source.cellSetDigest,
    retainedCellCount: retainedEquations.retainedCellCount,
    retainedCellCountByDimension:
      retainedEquations.retainedCellCountByDimension,
    explicitlyCheckedRankTwoCells:
      retainedEquations.explicitlyCheckedRankTwoCells,
    explicitlyCheckedHigherCells:
      retainedEquations.explicitlyCheckedHigherCells,
    higherEdgeEquationsChecked: retainedEquations.higherEdgeEquationsChecked,
    higherEdgeEquationsExpected: retainedEquations.higherEdgeEquationsExpected,
    higherChartsVerifiedByFullRootTraversal:
      retainedEquations.higherChartsVerifiedByFullRootTraversal,
    supportedFiniteExponents: [...SUPPORTED_FINITE_EXPONENTS],
    retainedZoneComponents: zoneModels.retainedSummary,
    higherCellExtension: {
      theoremId: "simply-laced-weighted-root-zonotope-face-gluing" as const,
      theoremVersion: 1 as const,
      verificationMode: "full-retained-cell-root-traversal" as const,
      transitionConvention: "R(ws_i)=R(w)R(s_i)-on-root-columns" as const,
      retainedHigherCellsExpected,
      retainedHigherCellsChecked: retainedEquations.retainedHigherCellsChecked,
      higherEdgeEquationsExpected:
        retainedEquations.higherEdgeEquationsExpected,
      higherEdgeEquationsChecked: retainedEquations.higherEdgeEquationsChecked,
      rankTwoFaceOccurrencesChecked:
        retainedEquations.rankTwoFaceOccurrencesChecked,
      evidenceDigest: retainedEquations.higherCellEvidenceDigest,
      checks: {
        everyRetainedHigherCellVisited,
        everyRetainedHigherCellEdgeEquationChecked:
          everyRetainedHigherCellVisited &&
          retainedEquations.higherEdgeEquationsChecked ===
            retainedEquations.higherEdgeEquationsExpected,
        everyExpectedRankTwoFacePresent:
          everyRetainedHigherCellVisited &&
          retainedEquations.everyExpectedRankTwoFacePresent,
        everySupportingRankTwoFaceRetained:
          everyRetainedHigherCellVisited &&
          retainedEquations.everySupportingRankTwoFaceRetained,
        sharedFacesUseZoneComponentsAndCocycle:
          everyRetainedHigherCellVisited &&
          retainedEquations.sharedFacesUseZoneComponentsAndCocycle,
      },
    },
    equalZoneScales,
    ambientWallInverseZoneScales,
    retainedWallComponentInverseZoneScales,
    errors,
    nonClaims: [
      "A retained-component positive solution supplies compatible root-zonotope zone scales and keeps the original integral +/-1 wall cocycle unchanged.",
      "The ambient-wall result is a stricter diagnostic: discarded polygons may split an ambient wall, and the retained-component model permits those pieces to scale independently.",
      "A missing retained-component solution obstructs this simply-laced/right-angled weighted root-zonotope construction, not every possible affine cell structure.",
      "This certificate does not establish asphericity or contractibility of the retained complex.",
    ],
  };
  return {
    ...payload,
    feasibilityDigest: canonicalSha256(payload),
  };
}

function isSubset(
  subset: readonly number[],
  superset: ReadonlySet<number>,
): boolean {
  return subset.every((value) => superset.has(value));
}

function maximalGeneratorCells(
  cells: readonly (readonly number[])[],
): number[][] {
  const unique = new Map<string, number[]>();
  for (const cell of cells) {
    const normalized = [...new Set(cell)].sort(compareNumbers);
    if (normalized.length > 0) unique.set(normalized.join(","), normalized);
  }
  const ordered = [...unique.values()].sort(
    (left, right) =>
      right.length - left.length ||
      compareStrings(left.join(","), right.join(",")),
  );
  const maximal: number[][] = [];
  for (const cell of ordered) {
    if (!maximal.some((other) => isSubset(cell, new Set(other)))) {
      maximal.push(cell);
    }
  }
  return maximal.sort((left, right) =>
    compareStrings(left.join(","), right.join(",")),
  );
}

function linkComponents(point: number, cells: readonly number[][]): string[][] {
  const generators = [...new Set(cells.flat())].sort(compareNumbers);
  const parent = new Map<number, number>(
    generators.map((generator) => [generator, generator]),
  );
  const find = (generator: number): number => {
    let root = parent.get(generator)!;
    while (parent.get(root)! !== root) root = parent.get(root)!;
    let current = generator;
    while (parent.get(current)! !== current) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  for (const cell of cells) {
    for (let index = 1; index < cell.length; index += 1) {
      union(cell[0], cell[index]);
    }
  }
  const byRoot = new Map<number, string[]>();
  for (const generator of generators) {
    const component = byRoot.get(find(generator)) ?? [];
    component.push(`dcl:edge-germ:at-q${point}:g${generator}`);
    byRoot.set(find(generator), component);
  }
  return [...byRoot.values()]
    .map((component) => component.sort(compareStrings))
    .sort((left, right) => compareStrings(left[0] ?? "", right[0] ?? ""));
}

function buildLinkAtPoint(
  source: PreparedSource,
  point: number,
): { ascending: LinkData; descending: LinkData; linkDigest: string } {
  const { oracle, evaluation, candidateIndex } = source;
  if (!Number.isSafeInteger(point) || point < 0 || point >= oracle.degree) {
    throw new RangeError(`Point q${point} lies outside this quotient action.`);
  }
  const ascendingCells: number[][] = [];
  const descendingCells: number[][] = [];
  for (const type of [...oracle.sphericalTypes].sort(
    (left, right) => left.typeIndex - right.typeIndex,
  )) {
    if (type.dimension === 0) continue;
    const cell = oracle.cellContaining(type.typeIndex, point);
    if (!evaluation.isRetained(cell, candidateIndex)) continue;
    const generators = [...type.generators].sort(compareNumbers);
    const increments = generators.map((generator) =>
      evaluation.edgeIncrement(point, generator, candidateIndex),
    );
    // In a convex affine cell, an incident vertex is the global minimum
    // exactly when every incident cell edge points out. Positive zone scales
    // preserve this sign test.
    if (increments.every((increment) => increment > 0)) {
      ascendingCells.push(generators);
    }
    if (increments.every((increment) => increment < 0)) {
      descendingCells.push(generators);
    }
  }
  const finish = (cells: number[][]): LinkData => {
    const maximalCells = maximalGeneratorCells(cells);
    const components = linkComponents(point, maximalCells);
    return {
      maximalCells,
      components,
      nonempty: maximalCells.length > 0,
      connected: components.length === 1,
    };
  };
  const ascending = finish(ascendingCells);
  const descending = finish(descendingCells);
  return {
    ascending,
    descending,
    linkDigest: canonicalSha256({
      schemaVersion: 1,
      method: "direct-polyhedral-link-at-point",
      oracleStructureHash: oracle.structureHash,
      candidateId: evaluation.candidates[candidateIndex]?.id ?? null,
      point,
      ascending: ascending.maximalCells,
      descending: descending.maximalCells,
    }),
  };
}

function buildDirectedLinksCertificate(
  options: DirectCellwiseAffineOptions,
  source: PreparedSource,
  feasibility: DirectCellwiseAffineFeasibilityCertificate,
): DirectPolyhedralLinksCertificate {
  const scanMode = options.linkScan ?? "exhaustive";
  const maxWitnesses = Math.max(0, options.maxLinkWitnesses ?? 32);
  const vertexSummaries: DirectPolyhedralLinkSummary[] = [];
  const witnesses: DirectPolyhedralLinkWitness[] = [];
  const errors: string[] = [];
  let constructionFailed = source.errors.length > 0;
  for (let point = 0; point < source.oracle.degree; point += 1) {
    try {
      const links = buildLinkAtPoint(source, point);
      const summary: DirectPolyhedralLinkSummary = {
        point,
        ascendingVertexCount: new Set(links.ascending.maximalCells.flat()).size,
        ascendingMaximalCellCount: links.ascending.maximalCells.length,
        ascendingComponentCount: links.ascending.components.length,
        descendingVertexCount: new Set(links.descending.maximalCells.flat())
          .size,
        descendingMaximalCellCount: links.descending.maximalCells.length,
        descendingComponentCount: links.descending.components.length,
        ascendingNonempty: links.ascending.nonempty,
        ascendingConnected: links.ascending.connected,
        descendingNonempty: links.descending.nonempty,
        descendingConnected: links.descending.connected,
        linkDigest: links.linkDigest,
      };
      vertexSummaries.push(summary);
      for (const [kind, link] of [
        ["ascending", links.ascending],
        ["descending", links.descending],
      ] as const) {
        if (
          (!link.nonempty || !link.connected) &&
          witnesses.length < maxWitnesses
        ) {
          witnesses.push({
            point,
            kind,
            reason: link.nonempty ? "disconnected" : "empty",
            components: link.components,
          });
        }
      }
      if (
        scanMode === "stop-on-first-failure" &&
        (!summary.ascendingNonempty ||
          !summary.ascendingConnected ||
          !summary.descendingNonempty ||
          !summary.descendingConnected)
      ) {
        break;
      }
    } catch (error) {
      constructionFailed = true;
      errors.push(
        `Direct link construction at q${point} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (scanMode === "stop-on-first-failure") break;
    }
  }
  const everyQuotientVertexChecked =
    vertexSummaries.length === source.oracle.degree;
  const everyAscendingLinkNonempty =
    everyQuotientVertexChecked &&
    vertexSummaries.every((summary) => summary.ascendingNonempty);
  const everyDescendingLinkNonempty =
    everyQuotientVertexChecked &&
    vertexSummaries.every((summary) => summary.descendingNonempty);
  const everyAscendingLinkConnected =
    everyQuotientVertexChecked &&
    vertexSummaries.every((summary) => summary.ascendingConnected);
  const everyDescendingLinkConnected =
    everyQuotientVertexChecked &&
    vertexSummaries.every((summary) => summary.descendingConnected);
  const affineMorseFunctionCertified = feasibility.status === "passed";
  const checks = {
    affineMorseFunctionCertified,
    everyQuotientVertexChecked,
    everyAscendingLinkNonempty,
    everyDescendingLinkNonempty,
    everyAscendingLinkConnected,
    everyDescendingLinkConnected,
  };
  const morseCondition = Object.values(checks).every(Boolean)
    ? "passed"
    : "not-established";
  const linksDigest = canonicalSha256({
    schemaVersion: 1,
    method: "direct-ascending-and-descending-coxeter-cell-links",
    sourceCellSetDigest: source.cellSetDigest,
    sourceFeasibilityDigest: feasibility.feasibilityDigest,
    scanMode,
    vertexDigests: vertexSummaries.map((summary) => ({
      point: summary.point,
      linkDigest: summary.linkDigest,
    })),
  });
  return {
    status: constructionFailed
      ? "failed"
      : morseCondition === "passed"
        ? "passed"
        : "not-established",
    method: "direct-ascending-and-descending-coxeter-cell-links",
    representation: "maximal-spherical-link-cells",
    scanMode,
    scanOutcome: constructionFailed
      ? "incomplete"
      : everyQuotientVertexChecked
        ? "exhaustive"
        : "counterexample-found",
    sourceCellSetDigest: source.cellSetDigest,
    sourceFeasibilityDigest: feasibility.feasibilityDigest,
    checkedVertexCount: vertexSummaries.length,
    vertexSummaries,
    witnesses,
    checks,
    morseCondition,
    linksDigest,
    errors: uniqueSortedStrings([...source.errors, ...errors]),
    nonClaims: [
      "These are direct links in the retained Coxeter-cell complex; no pulling subdivision or height perturbation is used.",
      "Every link simplex is supported by an actually retained spherical cell. Unlawful rank-two cells are never borrowed from the full Davis link.",
      "Link connectivity alone does not establish asphericity of the retained complex.",
    ],
  };
}

/** Recompute the canonical hash of a direct cellwise-affine artifact. */
export function computeDirectCellwiseAffineArtifactHash(
  certificate: DirectCellwiseAffineCertificate,
): string {
  return canonicalSha256({ ...certificate, artifactHash: "" });
}

/**
 * Check exact affine objective-function equations and the direct polyhedral
 * ascending/descending links. No triangulation or tie-breaking perturbation
 * occurs in this calculation.
 */
export function buildDirectCellwiseAffineCertificate(
  options: DirectCellwiseAffineOptions,
): DirectCellwiseAffineCertificate {
  const source = prepareSource(options);
  const feasibility = buildFeasibilityCertificate(options, source);
  const directedLinks = buildDirectedLinksCertificate(
    options,
    source,
    feasibility,
  );
  const errors = uniqueSortedStrings([
    ...source.errors,
    ...feasibility.errors,
    ...directedLinks.errors,
  ]);
  const status: DirectCellwiseAffineCertificate["status"] =
    source.errors.length > 0 ||
    feasibility.status === "failed" ||
    directedLinks.status === "failed"
      ? "failed"
      : "completed";
  const conclusion: DirectCellwiseAffineCertificate["conclusion"] =
    directedLinks.morseCondition === "passed"
      ? "morse-links-passed"
      : "not-established";
  const certificate: DirectCellwiseAffineCertificate = {
    schemaVersion: 1,
    kind: "direct-cellwise-affine-generalized-lawful-certificate",
    method: "exact-inverse-zone-scales-and-direct-polyhedral-links",
    status,
    candidateId: source.candidateId,
    candidateIndex: options.candidateIndex,
    sourceHash: source.sourceHash,
    source: source.source,
    subdivision: {
      method: "none-direct-coxeter-cell-links",
      introducedVertexIds: [],
    },
    feasibility,
    directedLinks,
    conclusion,
    artifactHashAlgorithm: "sha256",
    artifactHash: "",
    errors,
    nonClaims: [
      "The positive variables are inverse Coxeter-zonotope zone scales. The certified circle cocycle itself still takes the original integral values +/-1 on generator edges.",
      "The ambient-wall result is diagnostic. The theorem-facing result rebuilds smaller wall components using opposite edges of retained rank-two cells only.",
      "Failure of the retained-component weighted root-zonotope model does not prove that no other compatible affine-polytope structure exists.",
      "This artifact does not claim that the retained generalized lawful complex is aspherical or has contractible universal cover.",
      "A direct-link failure concerns this coorientation; it is not a cover-independent obstruction.",
    ],
  };
  certificate.artifactHash =
    computeDirectCellwiseAffineArtifactHash(certificate);
  return certificate;
}

/** Rebuild from the action, fibers, retained cells, and wall signs. */
export function replayDirectCellwiseAffineCertificate(
  options: DirectCellwiseAffineOptions,
  stored: DirectCellwiseAffineCertificate,
): DirectCellwiseAffineReplay {
  const errors: string[] = [];
  let storedArtifactHashValid = false;
  try {
    storedArtifactHashValid =
      stored.artifactHash === computeDirectCellwiseAffineArtifactHash(stored);
    if (!storedArtifactHashValid)
      errors.push("The stored artifact hash is stale.");
  } catch (error) {
    errors.push(
      `The stored artifact is not canonical certificate data: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  let rebuilt: DirectCellwiseAffineCertificate;
  try {
    rebuilt = buildDirectCellwiseAffineCertificate(options);
  } catch (error) {
    return {
      schemaVersion: 1,
      kind: "direct-cellwise-affine-generalized-lawful-replay",
      status: "failed",
      checks: {
        storedArtifactHashValid,
        sourceHashesMatch: false,
        actionRootedReconstructionMatches: false,
        rebuiltCalculationCompleted: false,
      },
      rebuiltArtifactHash: "",
      errors: uniqueSortedStrings([
        ...errors,
        error instanceof Error ? error.message : String(error),
      ]),
    };
  }
  const sourceHashesMatch =
    stored.sourceHash === rebuilt.sourceHash &&
    canonicalSha256(stored.source) === canonicalSha256(rebuilt.source);
  if (!sourceHashesMatch) errors.push("The stored source envelope is stale.");
  const actionRootedReconstructionMatches =
    canonicalSha256(stored) === canonicalSha256(rebuilt);
  if (!actionRootedReconstructionMatches) {
    errors.push("The stored artifact does not equal action-rooted replay.");
  }
  const rebuiltCalculationCompleted = rebuilt.status === "completed";
  if (!rebuiltCalculationCompleted) {
    errors.push(
      "The action-rooted reconstruction did not complete successfully.",
    );
  }
  const checks = {
    storedArtifactHashValid,
    sourceHashesMatch,
    actionRootedReconstructionMatches,
    rebuiltCalculationCompleted,
  };
  return {
    schemaVersion: 1,
    kind: "direct-cellwise-affine-generalized-lawful-replay",
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    checks,
    rebuiltArtifactHash: rebuilt.artifactHash,
    errors: uniqueSortedStrings(errors),
  };
}

/** Inspect one direct polyhedral link without constructing every vertex link. */
export function computeDirectPolyhedralLinkAtPoint(
  options: DirectCellwiseAffineOptions,
  point: number,
): DirectPolyhedralLinkPointResult {
  const source = prepareSource(options);
  const feasibility = buildFeasibilityCertificate(options, source);
  const links = buildLinkAtPoint(source, point);
  const payload = {
    schemaVersion: 1 as const,
    kind: "direct-polyhedral-link-point-replay" as const,
    status: (source.errors.length === 0 && feasibility.status === "passed"
      ? "passed"
      : "not-established") as "passed" | "not-established",
    candidateId: source.candidateId,
    sourceHash: source.sourceHash,
    sourceFeasibilityDigest: feasibility.feasibilityDigest,
    point,
    ascending: {
      maximalCells: links.ascending.maximalCells,
      components: links.ascending.components,
      nonempty: links.ascending.nonempty,
      connected: links.ascending.connected,
    },
    descending: {
      maximalCells: links.descending.maximalCells,
      components: links.descending.components,
      nonempty: links.descending.nonempty,
      connected: links.descending.connected,
    },
    linkDigest: links.linkDigest,
  };
  return { ...payload, resultHash: canonicalSha256(payload) };
}
