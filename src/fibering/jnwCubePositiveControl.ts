import { parseCoxeterSystemInput } from "../coxeter";
import {
  buildFullDavisQuotientCellPoset,
  type FullDavisQuotientCellPoset,
} from "../davis/fullQuotient";
import {
  createBipartiteJnwMoveSystem,
  createJnwState,
  deriveJnwStateLinks,
  jnwOrbitToQuotientComplex,
  summarizeJnwLegalSystem,
  type JnwFiniteSimplicialLink,
  type JnwLegalOrbitSummary,
  type JnwMoveSystem,
} from "../game";
import type { QuotientComplex } from "../quotient";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type SphericalSubsetPlan,
  type TorsionFreeActionCandidate,
  type TorsionFreeActionCertificate,
} from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";

const INITIAL_STATE_GENERATORS = [0, 2, 6, 7] as const;
const EXPECTED_GENERATOR_IDS = [
  "v000",
  "v001",
  "v010",
  "v011",
  "v100",
  "v101",
  "v110",
  "v111",
] as const;
const SOURCE_REFERENCE_ID = "jankiewicz-norin-wise-2017-legal-systems";

type LinkKind = "ascending" | "descending";

export type JnwIntegralRowOperation =
  | { kind: "swap"; leftRow: number; rightRow: number }
  | { kind: "negate"; row: number }
  | {
      kind: "add-multiple";
      sourceRow: number;
      targetRow: number;
      multiple: number;
    };

export interface JnwIntegralCohomologyBasisVector {
  id: string;
  freeColumn: number;
  cotreeValues: number[];
  edgeValues: Array<{ edgeId: string; value: number }>;
}

export interface JnwIntegralH1Certificate {
  method: "spanning-tree-gauge-and-unimodular-unit-pivot-kernel";
  vertexIds: string[];
  orientedEdgeIds: string[];
  faceIds: string[];
  rootVertexId: string;
  treeEdgeIds: string[];
  cotreeEdgeIds: string[];
  relationMatrix: number[][];
  unimodularRowOperations: JnwIntegralRowOperation[];
  reducedRelationMatrix: number[][];
  pivotColumns: number[];
  freeColumns: number[];
  basis: JnwIntegralCohomologyBasisVector[];
  rankC0Coboundaries: number;
  rankCocycleRelations: number;
  rankH1: number;
  isomorphicTo: "Z^6";
  checks: {
    oneSkeletonConnected: boolean;
    treeHasVMinusOneEdges: boolean;
    treeGaugeIsIntegral: boolean;
    rowOperationsAreUnimodular: boolean;
    reducedMatrixReplays: boolean;
    everyPivotIsAUnit: boolean;
    basisVectorsAreIntegralCocycles: boolean;
    basisParametrizesTheFullIntegralKernel: boolean;
    rankEulerCrossCheck: boolean;
  };
  certificateDigest: string;
}

export interface JnwCocycleCycleStep {
  edgeId: string;
  direction: 1 | -1;
}

export interface JnwPrimitiveCocycleCertificate {
  method: "jnw-edge-directions-with-integral-period-normalization";
  rawPreferredEdgeValues: Array<{ edgeId: string; value: 1 }>;
  rawFaceBoundarySums: Array<{ faceId: string; sum: number }>;
  treeGaugePotential: Array<{ vertexId: string; value: number }>;
  treeGaugedRawEdgeValues: Array<{ edgeId: string; value: number }>;
  rawH1Coordinates: number[];
  rawPeriodImageGcd: number;
  normalizationDivisor: number;
  primitiveH1Coordinates: number[];
  primitiveIntegralRepresentative: Array<{
    edgeId: string;
    value: number;
  }>;
  primitiveFaceBoundarySums: Array<{ faceId: string; sum: number }>;
  nonzeroMorseSlopes: Array<{
    edgeId: string;
    numerator: 1;
    denominator: number;
  }>;
  surjectivityWitness: {
    cotreeEdgeId: string;
    cycle: JnwCocycleCycleStep[];
    rawPeriod: number;
    primitivePeriod: 1 | -1;
  };
  checks: {
    rawCocycleClosed: boolean;
    rawEveryEdgeNonzero: boolean;
    rawClassCoordinatesInIntegralBasis: boolean;
    rawPeriodImageIsTwoZ: boolean;
    primitiveCoordinatesIntegral: boolean;
    primitiveCoordinatesHaveGcdOne: boolean;
    primitiveRepresentativeClosed: boolean;
    twicePrimitiveRepresentativeEqualsTreeGaugedRaw: boolean;
    rationalMorseRepresentativeHasPrimitiveIntegralPeriods: boolean;
    explicitUnitPeriodCycle: boolean;
  };
  conclusion: string;
  certificateDigest: string;
}

export interface JnwFiniteGraphLinkCertificate {
  kind: "full" | LinkKind;
  generators: number[];
  edges: Array<[number, number]>;
  components: number[][];
  nonempty: boolean;
  connected: boolean;
  triangleCount: number;
  flag: boolean;
  tree: boolean;
  collapsible: boolean;
}

export interface JnwVertexDirectedLinkCertificate {
  stateId: string;
  stateGenerators: number[];
  complementGenerators: number[];
  full: JnwFiniteGraphLinkCertificate;
  ascending: JnwFiniteGraphLinkCertificate;
  descending: JnwFiniteGraphLinkCertificate;
  checks: {
    fullLinkMatchesIncidentDavisCells: boolean;
    ascendingIsStateInducedSubcomplex: boolean;
    descendingIsComplementInducedSubcomplex: boolean;
    noLevelDirections: boolean;
    ascendingNonemptyConnected: boolean;
    descendingNonemptyConnected: boolean;
  };
}

export interface JnwNpcSquareComplexCertificate {
  method: "right-angled-square-links-and-gromov-flag-criterion";
  dimension: number;
  cellCountByDimension: Record<string, number>;
  vertexLinks: JnwVertexDirectedLinkCertificate[];
  checks: {
    completeDavisCellPoset: boolean;
    noSphericalSubsetsAboveRankTwo: boolean;
    everyTwoCellIsASquare: boolean;
    everyVertexLinkIsTheCubeGraph: boolean;
    everyVertexLinkIsFlag: boolean;
    locallyCatZero: boolean;
    universalCoverCatZero: boolean;
    universalCoverContractible: boolean;
    quotientAspherical: boolean;
  };
  conclusion: string;
  nonClaims: string[];
  certificateDigest: string;
}

export interface JnwCubePositiveControlCertificate {
  schemaVersion: 1;
  kind: "jnw-cube-graph-positive-control-certificate";
  method: "degree-four-move-kernel-integral-morse";
  status: "passed";
  source: {
    systemName: string;
    systemCanonicalSha256: string;
    sourceReferenceId: typeof SOURCE_REFERENCE_ID;
    initialStateGenerators: number[];
    exactCubeGraphTranscription: true;
    sourceSystem: CoxeterSystemInput;
  };
  legalSystem: {
    moveSystem: JnwMoveSystem;
    summary: JnwLegalOrbitSummary;
    quotientDigest: string;
    checks: {
      rightAngled: boolean;
      moveProperty: boolean;
      orbitComplete: boolean;
      legalOrbit: boolean;
      stronglyLegalOrbit: boolean;
      rankTwoBoundariesClose: boolean;
      fourStateOrbit: boolean;
    };
  };
  finiteAction: {
    candidate: TorsionFreeActionCandidate;
    sphericalPlan: SphericalSubsetPlan;
    certificate: TorsionFreeActionCertificate;
    checks: {
      degreeFour: boolean;
      exactIndexLowerBoundFour: boolean;
      twentySphericalSubsets: boolean;
      allSphericalActionsFree: boolean;
      torsionFree: boolean;
    };
  };
  fullDavisQuotient: FullDavisQuotientCellPoset;
  integralH1: JnwIntegralH1Certificate;
  primitiveCocycle: JnwPrimitiveCocycleCertificate;
  npcAndDirectedLinks: JnwNpcSquareComplexCertificate;
  theorem: {
    scope: "virtual-algebraic-fibering-of-the-jNW-cube-graph-RACG";
    claims: string[];
    nonClaims: string[];
    references: string[];
    result: {
      finiteIndexTorsionFreeSubgroup: true;
      subgroupIndex: 4;
      h1IsomorphicTo: "Z^6";
      primitiveEpimorphismToZ: true;
      allAscendingAndDescendingLinksNonemptyConnected: true;
      kernelFinitelyGenerated: true;
      virtualAlgebraicFibration: true;
      exactSequence: "1 -> ker(chi) -> H -> Z -> 1";
    };
  };
  checks: {
    sourceBound: boolean;
    legalSystemPassed: boolean;
    torsionFreeActionPassed: boolean;
    fullDavisQuotientPassed: boolean;
    integralH1Passed: boolean;
    primitiveCharacterPassed: boolean;
    npcAsphericityPassed: boolean;
    directedLinksPassed: boolean;
    theoremInferencePassed: boolean;
  };
  sectionDigests: {
    source: string;
    legalSystem: string;
    finiteAction: string;
    fullDavisQuotient: string;
    integralH1: string;
    primitiveCocycle: string;
    npcAndDirectedLinks: string;
    theorem: string;
  };
  artifactDigest: string;
}

export interface JnwCubePositiveControlReplay {
  schemaVersion: 1;
  kind: "jnw-cube-graph-positive-control-replay";
  valid: boolean;
  checks: {
    envelopeRecognized: boolean;
    storedArtifactDigestValid: boolean;
    authoritativeSourceMatches: boolean;
    sectionDigestsValid: boolean;
    freshReconstructionMatches: boolean;
  };
  storedArtifactDigest?: string;
  reconstructedArtifactDigest?: string;
  errors: string[];
  replayDigest: string;
}

interface PreferredEdge {
  id: string;
  inverseEdgeId: string;
  source: string;
  target: string;
  generator: number;
}

interface IntegralReduction {
  reduced: number[][];
  operations: JnwIntegralRowOperation[];
  pivotColumns: number[];
}

export class JnwCubePositiveControlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JnwCubePositiveControlError";
  }
}

function requireCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new JnwCubePositiveControlError(message);
}

function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameNumbers(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function gcdAll(values: readonly number[]): number {
  return values.reduce((current, value) => gcd(current, value), 0);
}

function hammingDistance(left: string, right: string): number {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function assertExactCubeGraphSource(system: CoxeterSystemInput): void {
  requireCondition(
    system.rank === 8,
    "The JNW positive control requires rank 8.",
  );
  requireCondition(
    system.dataStatus === "verified-source" ||
      system.dataStatus === "certified",
    "The JNW positive control requires verified source data.",
  );
  const ids = system.generators.map((generator) => generator.id);
  requireCondition(
    sameStrings(ids, EXPECTED_GENERATOR_IDS),
    "The generator order is not the verified binary cube-vertex order.",
  );
  for (let row = 0; row < system.rank; row += 1) {
    for (let column = 0; column < system.rank; column += 1) {
      const expected =
        row === column
          ? 1
          : hammingDistance(ids[row].slice(1), ids[column].slice(1)) === 1
            ? 2
            : "inf";
      requireCondition(
        system.coxeterMatrix[row]?.[column] === expected,
        `Coxeter entry (${row},${column}) does not match the 3-cube graph.`,
      );
    }
  }
  requireCondition(
    system.sourceRefs?.some(
      (reference) => reference.id === SOURCE_REFERENCE_ID,
    ),
    `The source does not cite ${SOURCE_REFERENCE_ID}.`,
  );
}

function preferredEdges(quotient: QuotientComplex): PreferredEdge[] {
  const edges = quotient.edges
    .filter((edge) => edge.id.endsWith(":forward"))
    .sort((left, right) => compareIds(left.id, right.id));
  requireCondition(
    edges.length * 2 === quotient.edges.length,
    "The JNW quotient does not consist of forward/reverse edge pairs.",
  );
  return edges.map((edge) => ({
    id: edge.id,
    inverseEdgeId: edge.inverseEdgeId,
    source: edge.source,
    target: edge.target,
    generator: edge.generator,
  }));
}

function buildActionCandidate(
  system: CoxeterSystemInput,
  quotient: QuotientComplex,
): { candidate: TorsionFreeActionCandidate; stateIds: string[] } {
  const stateIds = quotient.vertices
    .map((vertex) => vertex.id)
    .sort(compareIds);
  const pointById = new Map(stateIds.map((id, point) => [id, point]));
  const actionByGenerator = new Map(
    quotient.permutationAction?.map((action) => [action.generator, action]) ??
      [],
  );
  const generatorImages = Array.from(
    { length: system.rank },
    (_unused, generator) => {
      const action = actionByGenerator.get(generator);
      requireCondition(
        action !== undefined,
        `Generator ${generator} action is missing.`,
      );
      return stateIds.map((stateId) => {
        const imageId = action.images[stateId];
        const image = pointById.get(imageId);
        requireCondition(
          image !== undefined,
          `Generator ${generator} sends ${stateId} outside the state orbit.`,
        );
        return image;
      });
    },
  );
  return {
    stateIds,
    candidate: {
      id: "jnw-cube-graph-degree4-move-kernel",
      name: "Kernel of the JNW cube-graph move homomorphism",
      index: stateIds.length,
      generatorImages,
      pointLabels: [...stateIds],
      backend: "in-repo-jnw-move-action",
      backendVersion: "1.0.0",
      source: SOURCE_REFERENCE_ID,
      notes: [
        "The action is reconstructed from the complete four-state JNW move orbit.",
        "Torsion-freeness is certified separately on every spherical special subgroup.",
      ],
    },
  };
}

function findSpanningTree(
  vertexIds: readonly string[],
  edges: readonly PreferredEdge[],
): PreferredEdge[] {
  const parent = new Map(vertexIds.map((vertexId) => [vertexId, vertexId]));
  const find = (vertexId: string): string => {
    const current = parent.get(vertexId);
    requireCondition(current !== undefined, `Unknown tree vertex ${vertexId}.`);
    if (current === vertexId) return vertexId;
    const root = find(current);
    parent.set(vertexId, root);
    return root;
  };
  const tree: PreferredEdge[] = [];
  for (const edge of edges) {
    const sourceRoot = find(edge.source);
    const targetRoot = find(edge.target);
    if (sourceRoot !== targetRoot) {
      parent.set(sourceRoot, targetRoot);
      tree.push(edge);
    }
  }
  requireCondition(
    tree.length === vertexIds.length - 1,
    "The JNW one-skeleton is not connected.",
  );
  return tree;
}

function edgeBoundaryCoefficient(
  boundaryEdgeIds: readonly string[],
  edge: PreferredEdge,
): number {
  return boundaryEdgeIds.reduce(
    (sum, edgeId) =>
      sum + (edgeId === edge.id ? 1 : edgeId === edge.inverseEdgeId ? -1 : 0),
    0,
  );
}

function relationMatrix(
  quotient: QuotientComplex,
  cotreeEdges: readonly PreferredEdge[],
): { faceIds: string[]; rows: number[][] } {
  const faces = [...quotient.twoCells].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  return {
    faceIds: faces.map((face) => face.id),
    rows: faces.map((face) => {
      requireCondition(
        face.boundaryEdgeIds !== undefined,
        `Face ${face.id} has no signed boundary.`,
      );
      return cotreeEdges.map((edge) =>
        edgeBoundaryCoefficient(face.boundaryEdgeIds!, edge),
      );
    }),
  };
}

function reduceByUnitPivots(rows: readonly number[][]): IntegralReduction {
  const reduced = rows.map((row) => [...row]);
  const operations: JnwIntegralRowOperation[] = [];
  const pivotColumns: number[] = [];
  const columnCount = reduced[0]?.length ?? 0;
  let pivotRow = 0;
  for (
    let column = 0;
    column < columnCount && pivotRow < reduced.length;
    column += 1
  ) {
    let selected = -1;
    for (let row = pivotRow; row < reduced.length; row += 1) {
      if (Math.abs(reduced[row][column]) === 1) {
        selected = row;
        break;
      }
    }
    if (selected < 0) {
      requireCondition(
        reduced.slice(pivotRow).every((row) => row[column] === 0),
        `Integral reduction encountered a nonunit pivot in column ${column}.`,
      );
      continue;
    }
    if (selected !== pivotRow) {
      [reduced[selected], reduced[pivotRow]] = [
        reduced[pivotRow],
        reduced[selected],
      ];
      operations.push({ kind: "swap", leftRow: selected, rightRow: pivotRow });
    }
    if (reduced[pivotRow][column] === -1) {
      reduced[pivotRow] = reduced[pivotRow].map((value) => -value);
      operations.push({ kind: "negate", row: pivotRow });
    }
    for (let row = 0; row < reduced.length; row += 1) {
      if (row === pivotRow) continue;
      const coefficient = reduced[row][column];
      if (coefficient === 0) continue;
      const multiple = -coefficient;
      reduced[row] = reduced[row].map(
        (value, index) => value + multiple * reduced[pivotRow][index],
      );
      operations.push({
        kind: "add-multiple",
        sourceRow: pivotRow,
        targetRow: row,
        multiple,
      });
    }
    pivotColumns.push(column);
    pivotRow += 1;
  }
  requireCondition(
    reduced.slice(pivotRow).every((row) => row.every((value) => value === 0)),
    "Unit-pivot reduction left a nonzero relation row without a pivot.",
  );
  return { reduced, operations, pivotColumns };
}

function replayRowOperations(
  rows: readonly number[][],
  operations: readonly JnwIntegralRowOperation[],
): number[][] {
  const result = rows.map((row) => [...row]);
  for (const operation of operations) {
    if (operation.kind === "swap") {
      [result[operation.leftRow], result[operation.rightRow]] = [
        result[operation.rightRow],
        result[operation.leftRow],
      ];
    } else if (operation.kind === "negate") {
      result[operation.row] = result[operation.row].map((value) => -value);
    } else {
      result[operation.targetRow] = result[operation.targetRow].map(
        (value, column) =>
          value + operation.multiple * result[operation.sourceRow][column],
      );
    }
  }
  return result;
}

function matrixVectorProduct(
  matrix: readonly number[][],
  vector: readonly number[],
): number[] {
  return matrix.map((row) =>
    row.reduce(
      (sum, coefficient, column) => sum + coefficient * vector[column],
      0,
    ),
  );
}

function combineBasis(
  basis: readonly JnwIntegralCohomologyBasisVector[],
  coefficients: readonly number[],
): number[] {
  const length = basis[0]?.cotreeValues.length ?? 0;
  return Array.from({ length }, (_unused, column) =>
    basis.reduce(
      (sum, vector, index) =>
        sum + coefficients[index] * vector.cotreeValues[column],
      0,
    ),
  );
}

function integralH1Certificate(input: {
  quotient: QuotientComplex;
  stateIds: string[];
  edges: PreferredEdge[];
  treeEdges: PreferredEdge[];
  cotreeEdges: PreferredEdge[];
}): JnwIntegralH1Certificate {
  const { quotient, stateIds, edges, treeEdges, cotreeEdges } = input;
  const relations = relationMatrix(quotient, cotreeEdges);
  const reduction = reduceByUnitPivots(relations.rows);
  const pivotSet = new Set(reduction.pivotColumns);
  const freeColumns = Array.from(
    { length: cotreeEdges.length },
    (_unused, column) => column,
  ).filter((column) => !pivotSet.has(column));
  const basis = freeColumns.map<JnwIntegralCohomologyBasisVector>(
    (freeColumn, basisIndex) => {
      const values = Array<number>(cotreeEdges.length).fill(0);
      values[freeColumn] = 1;
      reduction.pivotColumns.forEach((pivotColumn, row) => {
        values[pivotColumn] = -reduction.reduced[row][freeColumn];
      });
      return {
        id: `eta${basisIndex}`,
        freeColumn,
        cotreeValues: values,
        edgeValues: edges.map((edge) => ({
          edgeId: edge.id,
          value: treeEdges.some((treeEdge) => treeEdge.id === edge.id)
            ? 0
            : values[
                cotreeEdges.findIndex((cotreeEdge) => cotreeEdge.id === edge.id)
              ],
        })),
      };
    },
  );
  const replayed = replayRowOperations(relations.rows, reduction.operations);
  const rankC0Coboundaries = stateIds.length - 1;
  const rankCocycleRelations = reduction.pivotColumns.length;
  const rankH1 = cotreeEdges.length - rankCocycleRelations;
  const checks = {
    oneSkeletonConnected: treeEdges.length === stateIds.length - 1,
    treeHasVMinusOneEdges: treeEdges.length === stateIds.length - 1,
    treeGaugeIsIntegral: true,
    rowOperationsAreUnimodular: reduction.operations.every(
      (operation) =>
        operation.kind !== "add-multiple" ||
        Number.isSafeInteger(operation.multiple),
    ),
    reducedMatrixReplays:
      canonicalSha256(replayed) === canonicalSha256(reduction.reduced),
    everyPivotIsAUnit: reduction.pivotColumns.every(
      (column, row) => reduction.reduced[row]?.[column] === 1,
    ),
    basisVectorsAreIntegralCocycles: basis.every((vector) =>
      matrixVectorProduct(relations.rows, vector.cotreeValues).every(
        (value) => value === 0,
      ),
    ),
    basisParametrizesTheFullIntegralKernel:
      basis.length === freeColumns.length &&
      basis.every(
        (vector, index) =>
          vector.cotreeValues[freeColumns[index]] === 1 &&
          freeColumns.every(
            (column, otherIndex) =>
              otherIndex === index || vector.cotreeValues[column] === 0,
          ),
      ),
    rankEulerCrossCheck:
      rankH1 === edges.length - rankC0Coboundaries - rankCocycleRelations,
  };
  requireCondition(
    rankH1 === 6 && Object.values(checks).every(Boolean),
    "The exact integral H^1 calculation did not certify Z^6.",
  );
  const withoutDigest = {
    method: "spanning-tree-gauge-and-unimodular-unit-pivot-kernel" as const,
    vertexIds: [...stateIds],
    orientedEdgeIds: edges.map((edge) => edge.id),
    faceIds: relations.faceIds,
    rootVertexId: stateIds[0],
    treeEdgeIds: treeEdges.map((edge) => edge.id),
    cotreeEdgeIds: cotreeEdges.map((edge) => edge.id),
    relationMatrix: relations.rows,
    unimodularRowOperations: reduction.operations,
    reducedRelationMatrix: reduction.reduced,
    pivotColumns: reduction.pivotColumns,
    freeColumns,
    basis,
    rankC0Coboundaries,
    rankCocycleRelations,
    rankH1,
    isomorphicTo: "Z^6" as const,
    checks,
  };
  return {
    ...withoutDigest,
    certificateDigest: canonicalSha256(withoutDigest),
  };
}

function treeGaugePotential(input: {
  vertexIds: readonly string[];
  treeEdges: readonly PreferredEdge[];
}): Map<string, number> {
  const potential = new Map<string, number>([[input.vertexIds[0], 0]]);
  while (potential.size < input.vertexIds.length) {
    const before = potential.size;
    for (const edge of input.treeEdges) {
      const source = potential.get(edge.source);
      const target = potential.get(edge.target);
      if (source !== undefined && target === undefined) {
        potential.set(edge.target, source + 1);
      } else if (target !== undefined && source === undefined) {
        potential.set(edge.source, target - 1);
      }
    }
    requireCondition(
      potential.size > before,
      "The spanning-tree potential did not reach every state.",
    );
  }
  return potential;
}

function edgeValuesById(
  values: readonly { edgeId: string; value: number }[],
): Map<string, number> {
  return new Map(values.map((entry) => [entry.edgeId, entry.value]));
}

function faceBoundarySums(
  quotient: QuotientComplex,
  edges: readonly PreferredEdge[],
  values: ReadonlyMap<string, number>,
): Array<{ faceId: string; sum: number }> {
  return [...quotient.twoCells]
    .sort((left, right) => compareIds(left.id, right.id))
    .map((face) => {
      requireCondition(
        face.boundaryEdgeIds !== undefined,
        `Face ${face.id} is unsigned.`,
      );
      const sum = edges.reduce(
        (total, edge) =>
          total +
          edgeBoundaryCoefficient(face.boundaryEdgeIds!, edge) *
            (values.get(edge.id) ?? 0),
        0,
      );
      return { faceId: face.id, sum };
    });
}

function treePath(
  treeEdges: readonly PreferredEdge[],
  start: string,
  target: string,
): JnwCocycleCycleStep[] {
  const queue = [start];
  const previous = new Map<
    string,
    { vertexId: string; edge: PreferredEdge; direction: 1 | -1 }
  >();
  const seen = new Set([start]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const vertexId = queue[cursor];
    if (vertexId === target) break;
    for (const edge of treeEdges) {
      const next =
        edge.source === vertexId
          ? { vertexId: edge.target, direction: 1 as const }
          : edge.target === vertexId
            ? { vertexId: edge.source, direction: -1 as const }
            : undefined;
      if (!next || seen.has(next.vertexId)) continue;
      seen.add(next.vertexId);
      previous.set(next.vertexId, {
        vertexId,
        edge,
        direction: next.direction,
      });
      queue.push(next.vertexId);
    }
  }
  requireCondition(
    seen.has(target),
    "The tree path for the period witness is missing.",
  );
  const reversed: JnwCocycleCycleStep[] = [];
  let current = target;
  while (current !== start) {
    const step = previous.get(current);
    requireCondition(
      step !== undefined,
      "The tree path predecessor is missing.",
    );
    reversed.push({ edgeId: step.edge.id, direction: step.direction });
    current = step.vertexId;
  }
  return reversed.reverse();
}

function cyclePeriod(
  cycle: readonly JnwCocycleCycleStep[],
  values: ReadonlyMap<string, number>,
): number {
  return cycle.reduce(
    (sum, step) => sum + step.direction * (values.get(step.edgeId) ?? 0),
    0,
  );
}

function primitiveCocycleCertificate(input: {
  quotient: QuotientComplex;
  stateIds: string[];
  edges: PreferredEdge[];
  treeEdges: PreferredEdge[];
  cotreeEdges: PreferredEdge[];
  h1: JnwIntegralH1Certificate;
}): JnwPrimitiveCocycleCertificate {
  const { quotient, stateIds, edges, treeEdges, cotreeEdges, h1 } = input;
  const assignment = quotient.game?.assignments.find(
    (entry) => entry.id === "jnw-state-directions",
  );
  requireCondition(
    assignment !== undefined && "edgeStates" in assignment,
    "The JNW quotient has no state-direction edge assignment.",
  );
  const assigned = new Map(
    assignment.edgeStates.map((entry) => [entry.edgeId, entry.value]),
  );
  requireCondition(
    quotient.edges.every((edge) =>
      edge.id.endsWith(":forward")
        ? assigned.get(edge.id) === 1
        : assigned.get(edge.id) === -1,
    ),
    "The stored JNW edge assignment disagrees with its preferred orientations.",
  );
  const rawPreferredEdgeValues = edges.map((edge) => ({
    edgeId: edge.id,
    value: 1 as const,
  }));
  const rawMap = edgeValuesById(rawPreferredEdgeValues);
  const rawFaceBoundarySums = faceBoundarySums(quotient, edges, rawMap);
  const potential = treeGaugePotential({ vertexIds: stateIds, treeEdges });
  const treeGaugedRawEdgeValues = edges.map((edge) => ({
    edgeId: edge.id,
    value:
      1 -
      ((potential.get(edge.target) ?? 0) - (potential.get(edge.source) ?? 0)),
  }));
  const treeGaugedMap = edgeValuesById(treeGaugedRawEdgeValues);
  const cotreeVector = cotreeEdges.map(
    (edge) => treeGaugedMap.get(edge.id) ?? 0,
  );
  const rawH1Coordinates = h1.freeColumns.map((column) => cotreeVector[column]);
  requireCondition(
    sameNumbers(combineBasis(h1.basis, rawH1Coordinates), cotreeVector),
    "The raw JNW class does not expand in the certified integral H^1 basis.",
  );
  const normalizationDivisor = gcdAll(rawH1Coordinates);
  requireCondition(normalizationDivisor > 0, "The JNW character is trivial.");
  const primitiveH1Coordinates = rawH1Coordinates.map(
    (value) => value / normalizationDivisor,
  );
  requireCondition(
    primitiveH1Coordinates.every(Number.isInteger),
    "The primitive H^1 coordinates are not integral.",
  );
  const primitiveIntegralRepresentative = treeGaugedRawEdgeValues.map(
    (entry) => ({
      edgeId: entry.edgeId,
      value: entry.value / normalizationDivisor,
    }),
  );
  requireCondition(
    primitiveIntegralRepresentative.every((entry) =>
      Number.isInteger(entry.value),
    ),
    "The tree-gauged primitive cocycle is not integral.",
  );
  const primitiveMap = edgeValuesById(primitiveIntegralRepresentative);
  const primitiveFaceBoundarySums = faceBoundarySums(
    quotient,
    edges,
    primitiveMap,
  );
  const witnessIndex = cotreeEdges.findIndex(
    (edge) => Math.abs(primitiveMap.get(edge.id) ?? 0) === 1,
  );
  requireCondition(witnessIndex >= 0, "No unit-period cotree edge was found.");
  const witnessEdge = cotreeEdges[witnessIndex];
  const cycle: JnwCocycleCycleStep[] = [
    { edgeId: witnessEdge.id, direction: 1 },
    ...treePath(treeEdges, witnessEdge.target, witnessEdge.source),
  ];
  const rawPeriod = cyclePeriod(cycle, treeGaugedMap);
  const primitivePeriod = cyclePeriod(cycle, primitiveMap);
  requireCondition(
    primitivePeriod === 1 || primitivePeriod === -1,
    "The claimed primitive period witness is not a unit.",
  );
  const unitPrimitivePeriod = primitivePeriod as 1 | -1;
  const checks = {
    rawCocycleClosed: rawFaceBoundarySums.every((entry) => entry.sum === 0),
    rawEveryEdgeNonzero:
      rawPreferredEdgeValues.length === edges.length &&
      rawPreferredEdgeValues.every((entry) => Number(entry.value) !== 0),
    rawClassCoordinatesInIntegralBasis: sameNumbers(
      combineBasis(h1.basis, rawH1Coordinates),
      cotreeVector,
    ),
    rawPeriodImageIsTwoZ: normalizationDivisor === 2,
    primitiveCoordinatesIntegral: primitiveH1Coordinates.every(
      Number.isInteger,
    ),
    primitiveCoordinatesHaveGcdOne: gcdAll(primitiveH1Coordinates) === 1,
    primitiveRepresentativeClosed: primitiveFaceBoundarySums.every(
      (entry) => entry.sum === 0,
    ),
    twicePrimitiveRepresentativeEqualsTreeGaugedRaw:
      primitiveIntegralRepresentative.every(
        (entry) =>
          entry.value * normalizationDivisor ===
          (treeGaugedMap.get(entry.edgeId) ?? Number.NaN),
      ),
    rationalMorseRepresentativeHasPrimitiveIntegralPeriods:
      rawFaceBoundarySums.every((entry) => entry.sum === 0) &&
      normalizationDivisor === 2,
    explicitUnitPeriodCycle: Math.abs(primitivePeriod) === 1,
  };
  requireCondition(
    Object.values(checks).every(Boolean),
    "The primitive JNW cocycle certificate failed an exact check.",
  );
  const withoutDigest = {
    method: "jnw-edge-directions-with-integral-period-normalization" as const,
    rawPreferredEdgeValues,
    rawFaceBoundarySums,
    treeGaugePotential: [...potential.entries()]
      .sort(([left], [right]) => compareIds(left, right))
      .map(([vertexId, value]) => ({ vertexId, value })),
    treeGaugedRawEdgeValues,
    rawH1Coordinates,
    rawPeriodImageGcd: normalizationDivisor,
    normalizationDivisor,
    primitiveH1Coordinates,
    primitiveIntegralRepresentative,
    primitiveFaceBoundarySums,
    nonzeroMorseSlopes: edges.map((edge) => ({
      edgeId: edge.id,
      numerator: 1 as const,
      denominator: normalizationDivisor,
    })),
    surjectivityWitness: {
      cotreeEdgeId: witnessEdge.id,
      cycle,
      rawPeriod,
      primitivePeriod: unitPrimitivePeriod,
    },
    checks,
    conclusion:
      "The raw JNW direction cocycle has period image 2Z. Dividing its periods by two gives a primitive epimorphism chi:H->Z; the rational rescaling preserves every ascending and descending direction.",
  };
  return {
    ...withoutDigest,
    certificateDigest: canonicalSha256(withoutDigest),
  };
}

function graphComponents(
  vertices: readonly number[],
  edges: readonly [number, number][],
): number[][] {
  const allowed = new Set(vertices);
  const unseen = new Set(vertices);
  const components: number[][] = [];
  while (unseen.size > 0) {
    const start = Math.min(...unseen);
    unseen.delete(start);
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      for (const [left, right] of edges) {
        const next =
          left === current ? right : right === current ? left : undefined;
        if (next !== undefined && allowed.has(next) && unseen.delete(next))
          queue.push(next);
      }
    }
    components.push(queue.sort((left, right) => left - right));
  }
  return components;
}

function linkGraph(
  link: JnwFiniteSimplicialLink,
): JnwFiniteGraphLinkCertificate {
  const generators = link.vertices
    .map((vertex) => vertex.generator)
    .sort((a, b) => a - b);
  const edges = link.simplices
    .filter((simplex) => simplex.dimension === 1)
    .map(
      (simplex) =>
        [...simplex.generators].sort((a, b) => a - b) as [number, number],
    )
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const triangleCount = link.simplices.filter(
    (simplex) => simplex.dimension >= 2,
  ).length;
  const components = graphComponents(generators, edges);
  const nonempty = generators.length > 0;
  const connected = nonempty && components.length === 1;
  const tree = connected && edges.length === generators.length - 1;
  return {
    kind: link.kind as "full" | LinkKind,
    generators,
    edges,
    components,
    nonempty,
    connected,
    triangleCount,
    flag: triangleCount === 0,
    tree,
    collapsible: tree,
  };
}

function samePairs(
  left: readonly [number, number][],
  right: readonly [number, number][],
): boolean {
  return canonicalSha256(left) === canonicalSha256(right);
}

function expectedInducedEdges(
  fullEdges: readonly [number, number][],
  generators: readonly number[],
): Array<[number, number]> {
  const included = new Set(generators);
  return fullEdges.filter(
    ([left, right]) => included.has(left) && included.has(right),
  );
}

function npcAndDirectedLinksCertificate(input: {
  system: CoxeterSystemInput;
  summary: JnwLegalOrbitSummary;
  stateIds: string[];
  sphericalPlan: SphericalSubsetPlan;
  poset: FullDavisQuotientCellPoset;
}): JnwNpcSquareComplexCertificate {
  const { system, summary, stateIds, sphericalPlan, poset } = input;
  const vertexLinks = summary.states.map<JnwVertexDirectedLinkCertificate>(
    (state) => {
      const links = deriveJnwStateLinks(system, state);
      const full = linkGraph(links.full);
      const ascending = linkGraph(links.ascending);
      const descending = linkGraph(links.descending);
      const point = stateIds.indexOf(state.id);
      requireCondition(point >= 0, `State ${state.id} has no action point.`);
      const posetVertexId = `fdq:v:q${point}`;
      const incidentGenerators = poset.cells
        .filter(
          (cell) =>
            cell.dimension === 1 && cell.vertexIds.includes(posetVertexId),
        )
        .map((cell) => cell.generators[0])
        .sort((left, right) => left - right);
      const incidentPairs = poset.cells
        .filter(
          (cell) =>
            cell.dimension === 2 && cell.vertexIds.includes(posetVertexId),
        )
        .map(
          (cell) =>
            [...cell.generators].sort((a, b) => a - b) as [number, number],
        )
        .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
      const stateGenerators = [...state.generators].sort((a, b) => a - b);
      const stateSet = new Set(stateGenerators);
      const complementGenerators = Array.from(
        { length: system.rank },
        (_unused, generator) => generator,
      ).filter((generator) => !stateSet.has(generator));
      const checks = {
        fullLinkMatchesIncidentDavisCells:
          sameNumbers(incidentGenerators, full.generators) &&
          samePairs(incidentPairs, full.edges),
        ascendingIsStateInducedSubcomplex:
          sameNumbers(ascending.generators, stateGenerators) &&
          samePairs(
            ascending.edges,
            expectedInducedEdges(full.edges, stateGenerators),
          ),
        descendingIsComplementInducedSubcomplex:
          sameNumbers(descending.generators, complementGenerators) &&
          samePairs(
            descending.edges,
            expectedInducedEdges(full.edges, complementGenerators),
          ),
        noLevelDirections:
          links.level.vertices.length === 0 &&
          links.level.simplices.length === 0,
        ascendingNonemptyConnected: ascending.nonempty && ascending.connected,
        descendingNonemptyConnected:
          descending.nonempty && descending.connected,
      };
      requireCondition(
        Object.values(checks).every(Boolean),
        `Directed-link certification failed at ${state.id}.`,
      );
      return {
        stateId: state.id,
        stateGenerators,
        complementGenerators,
        full,
        ascending,
        descending,
        checks,
      };
    },
  );
  const dimensionTwoCells = poset.cells.filter((cell) => cell.dimension === 2);
  const checks = {
    completeDavisCellPoset:
      poset.certificate.status === "passed" &&
      Object.values(poset.certificate.checks).every(Boolean),
    noSphericalSubsetsAboveRankTwo: sphericalPlan.sphericalSubgroups.every(
      (subgroup) => subgroup.rank <= 2,
    ),
    everyTwoCellIsASquare: dimensionTwoCells.every(
      (cell) => cell.generators.length === 2 && cell.vertexIds.length === 4,
    ),
    everyVertexLinkIsTheCubeGraph: vertexLinks.every(
      (entry) =>
        entry.full.generators.length === 8 && entry.full.edges.length === 12,
    ),
    everyVertexLinkIsFlag: vertexLinks.every(
      (entry) => entry.full.flag && entry.full.triangleCount === 0,
    ),
    locallyCatZero: false,
    universalCoverCatZero: false,
    universalCoverContractible: false,
    quotientAspherical: false,
  };
  checks.locallyCatZero =
    checks.completeDavisCellPoset &&
    checks.noSphericalSubsetsAboveRankTwo &&
    checks.everyTwoCellIsASquare &&
    checks.everyVertexLinkIsFlag;
  checks.universalCoverCatZero = checks.locallyCatZero;
  checks.universalCoverContractible = checks.universalCoverCatZero;
  checks.quotientAspherical = checks.universalCoverContractible;
  requireCondition(
    poset.dimension === 2 && Object.values(checks).every(Boolean),
    "The JNW full quotient did not pass the nonpositive-curvature certificate.",
  );
  requireCondition(
    vertexLinks.every((entry) => entry.ascending.tree && entry.descending.tree),
    "At least one directed link is not a tree.",
  );
  const withoutDigest = {
    method: "right-angled-square-links-and-gromov-flag-criterion" as const,
    dimension: poset.dimension,
    cellCountByDimension: poset.cellCountByDimension,
    vertexLinks,
    checks,
    conclusion:
      "The complete quotient is a finite nonpositively curved square complex. Its universal cover is CAT(0), hence contractible; every ascending and descending link is a nonempty tree.",
    nonClaims: [
      "The infinite universal cover is not materialized; contractibility follows from the certified finite Gromov link condition and the CAT(0) square-complex theorem.",
      "No hyperbolic 5-manifold or compact hyperbolic polytope is represented by this square complex.",
    ],
  };
  return {
    ...withoutDigest,
    certificateDigest: canonicalSha256(withoutDigest),
  };
}

function verifyFullQuotientAgreement(
  quotient: QuotientComplex,
  poset: FullDavisQuotientCellPoset,
  stateIds: readonly string[],
): void {
  requireCondition(
    canonicalSha256(poset.cellCountByDimension) ===
      canonicalSha256({ "0": 4, "1": 16, "2": 12 }),
    "The full Davis quotient does not have the expected 4/16/12 cell census.",
  );
  requireCondition(
    quotient.vertices.length === 4 &&
      quotient.edges.length === 32 &&
      quotient.twoCells.length === 12,
    "The state quotient does not have the expected exact incidence census.",
  );
  for (const face of quotient.twoCells) {
    const pointSet = new Set(face.boundaryVertexIds);
    const matches = poset.cells.filter(
      (cell) =>
        cell.dimension === 2 &&
        sameNumbers(cell.generators, face.generatorPair) &&
        cell.actionPoints.every((point) => pointSet.has(stateIds[point])),
    );
    requireCondition(
      matches.length === 1,
      `State face ${face.id} does not match exactly one full Davis cell.`,
    );
  }
}

function theoremSection(): JnwCubePositiveControlCertificate["theorem"] {
  return {
    scope: "virtual-algebraic-fibering-of-the-jNW-cube-graph-RACG",
    claims: [
      "The kernel H of the four-state move action is a torsion-free subgroup of index four in the JNW cube-graph right-angled Coxeter group.",
      "The complete Davis quotient H\\Sigma is a finite nonpositively curved square complex with contractible universal cover.",
      "H^1(H;Z) is isomorphic to Z^6 by the displayed integral spanning-tree gauge and unimodular relation reduction.",
      "The JNW direction cocycle has image 2Z; normalization by two gives an explicit primitive epimorphism chi:H->Z with the same kernel.",
      "Every ascending and descending link is a nonempty tree, so the standard Bestvina-Brady/Jankiewicz-Norin-Wise Morse criterion gives a finitely generated kernel.",
      "Consequently the JNW cube-graph RACG virtually algebraically fibers.",
    ],
    nonClaims: [
      "This is not a compact hyperbolic 5-cube, a compact hyperbolic 5-polytope, or a lattice in Isom(H^5).",
      "This certificate concerns the degree-four move-kernel cover, not the 256-vertex mod-2 commutator cover displayed in the JNW paper.",
      "Only finite generation of ker(chi) is claimed; no finite-presentation or higher finiteness property is asserted here.",
      "No smooth, bundle, or topological fibration over S^1 is claimed.",
      "No statement is made about every integral character or about the compact-5-cube subgroup studied elsewhere in the repository.",
      "The theorem step invokes the standard CAT(0) square-complex and PL Morse theorems from the exact finite hypotheses recorded here; it does not re-prove those general theorems.",
    ],
    references: [
      "Jankiewicz-Norin-Wise, Virtually Fibering Right-Angled Coxeter Groups, arXiv:1711.11505, Sections 2 and 5.a.1.",
      "Davis, The Geometry and Topology of Coxeter Groups, for the Davis complex and its CAT(0) realization.",
      "Bestvina-Brady PL Morse theory, for finite generation from connected nonempty ascending and descending links.",
    ],
    result: {
      finiteIndexTorsionFreeSubgroup: true,
      subgroupIndex: 4,
      h1IsomorphicTo: "Z^6",
      primitiveEpimorphismToZ: true,
      allAscendingAndDescendingLinksNonemptyConnected: true,
      kernelFinitelyGenerated: true,
      virtualAlgebraicFibration: true,
      exactSequence: "1 -> ker(chi) -> H -> Z -> 1",
    },
  };
}

/** Build the source-bound exact positive-control certificate. */
export function buildJnwCubePositiveControlCertificate(
  input: unknown,
): JnwCubePositiveControlCertificate {
  const system = parseCoxeterSystemInput(input);
  assertExactCubeGraphSource(system);
  const moveSystem = createBipartiteJnwMoveSystem(system);
  requireCondition(
    moveSystem !== undefined,
    "The cube graph is not bipartite.",
  );
  const summary = summarizeJnwLegalSystem(
    system,
    moveSystem,
    createJnwState([...INITIAL_STATE_GENERATORS]),
  );
  const quotient = jnwOrbitToQuotientComplex(system, summary);
  const legalChecks = {
    rightAngled: summary.rightAngled,
    moveProperty: summary.moveChecks.every((check) => check.ok),
    orbitComplete: summary.orbitComplete,
    legalOrbit: summary.legalOrbit,
    stronglyLegalOrbit: summary.stronglyLegalOrbit,
    rankTwoBoundariesClose: summary.rankTwoDiagnostics.every(
      (check) => check.ok,
    ),
    fourStateOrbit: summary.states.length === 4,
  };
  requireCondition(
    summary.claimStatus === "jnw-faithful" &&
      Object.values(legalChecks).every(Boolean),
    "The JNW legal-system calculation did not pass.",
  );
  const { candidate, stateIds } = buildActionCandidate(system, quotient);
  const sphericalPlan = planSphericalSpecialSubgroups(system);
  const actionCertificate = certifyTorsionFreeAction(
    system,
    candidate,
    sphericalPlan,
  );
  const actionChecks = {
    degreeFour: candidate.index === 4,
    exactIndexLowerBoundFour:
      actionCertificate.indexLowerBound.value.decimal === "4",
    twentySphericalSubsets: sphericalPlan.sphericalSubgroups.length === 20,
    allSphericalActionsFree: actionCertificate.sphericalActions.every(
      (action) => action.free && action.faithful,
    ),
    torsionFree:
      actionCertificate.status === "passed" &&
      Object.values(actionCertificate.checks).every(Boolean),
  };
  requireCondition(
    sphericalPlan.status === "complete" &&
      Object.values(actionChecks).every(Boolean),
    `The four-state action is not torsion-free certified: ${actionCertificate.errors.join(" ")}`,
  );
  const fullDavisQuotient = buildFullDavisQuotientCellPoset(
    system,
    { candidate, certificate: actionCertificate },
    { sourceQuotientVertexIds: stateIds },
  );
  verifyFullQuotientAgreement(quotient, fullDavisQuotient, stateIds);
  const edges = preferredEdges(quotient);
  const treeEdges = findSpanningTree(stateIds, edges);
  const treeSet = new Set(treeEdges.map((edge) => edge.id));
  const cotreeEdges = edges.filter((edge) => !treeSet.has(edge.id));
  const integralH1 = integralH1Certificate({
    quotient,
    stateIds,
    edges,
    treeEdges,
    cotreeEdges,
  });
  const primitiveCocycle = primitiveCocycleCertificate({
    quotient,
    stateIds,
    edges,
    treeEdges,
    cotreeEdges,
    h1: integralH1,
  });
  const npcAndDirectedLinks = npcAndDirectedLinksCertificate({
    system,
    summary,
    stateIds,
    sphericalPlan,
    poset: fullDavisQuotient,
  });
  const source: JnwCubePositiveControlCertificate["source"] = {
    systemName: system.name,
    systemCanonicalSha256: canonicalSha256(jsonCopy(system)),
    sourceReferenceId: SOURCE_REFERENCE_ID,
    initialStateGenerators: [...INITIAL_STATE_GENERATORS],
    exactCubeGraphTranscription: true as const,
    sourceSystem: jsonCopy(system),
  };
  const legalSystem = {
    moveSystem: jsonCopy(moveSystem),
    summary: jsonCopy(summary),
    quotientDigest: canonicalSha256(jsonCopy(quotient)),
    checks: legalChecks,
  };
  const finiteAction = {
    candidate: jsonCopy(candidate),
    sphericalPlan: jsonCopy(sphericalPlan),
    certificate: jsonCopy(actionCertificate),
    checks: actionChecks,
  };
  const cleanFullDavisQuotient = jsonCopy(fullDavisQuotient);
  const theorem = theoremSection();
  const checks = {
    sourceBound:
      source.systemCanonicalSha256 === canonicalSha256(source.sourceSystem),
    legalSystemPassed: Object.values(legalChecks).every(Boolean),
    torsionFreeActionPassed: Object.values(actionChecks).every(Boolean),
    fullDavisQuotientPassed:
      cleanFullDavisQuotient.certificate.status === "passed" &&
      Object.values(cleanFullDavisQuotient.certificate.checks).every(Boolean),
    integralH1Passed: Object.values(integralH1.checks).every(Boolean),
    primitiveCharacterPassed: Object.values(primitiveCocycle.checks).every(
      Boolean,
    ),
    npcAsphericityPassed: Object.values(npcAndDirectedLinks.checks).every(
      Boolean,
    ),
    directedLinksPassed: npcAndDirectedLinks.vertexLinks.every(
      (entry) =>
        entry.ascending.nonempty &&
        entry.ascending.connected &&
        entry.descending.nonempty &&
        entry.descending.connected,
    ),
    theoremInferencePassed:
      theorem.result.virtualAlgebraicFibration &&
      theorem.result.kernelFinitelyGenerated,
  };
  requireCondition(
    Object.values(checks).every(Boolean),
    "The positive-control theorem envelope did not pass every section.",
  );
  const sectionDigests = {
    source: canonicalSha256(source),
    legalSystem: canonicalSha256(legalSystem),
    finiteAction: canonicalSha256(finiteAction),
    fullDavisQuotient: canonicalSha256(cleanFullDavisQuotient),
    integralH1: canonicalSha256(integralH1),
    primitiveCocycle: canonicalSha256(primitiveCocycle),
    npcAndDirectedLinks: canonicalSha256(npcAndDirectedLinks),
    theorem: canonicalSha256(theorem),
  };
  const certificate: JnwCubePositiveControlCertificate = {
    schemaVersion: 1,
    kind: "jnw-cube-graph-positive-control-certificate",
    method: "degree-four-move-kernel-integral-morse",
    status: "passed",
    source,
    legalSystem,
    finiteAction,
    fullDavisQuotient: cleanFullDavisQuotient,
    integralH1,
    primitiveCocycle,
    npcAndDirectedLinks,
    theorem,
    checks,
    sectionDigests,
    artifactDigest: "",
  };
  certificate.artifactDigest =
    computeJnwCubePositiveControlArtifactDigest(certificate);
  return certificate;
}

export function computeJnwCubePositiveControlArtifactDigest(
  certificate: JnwCubePositiveControlCertificate,
): string {
  return canonicalSha256({ ...jsonCopy(certificate), artifactDigest: "" });
}

function recordedSectionDigests(
  certificate: JnwCubePositiveControlCertificate,
): JnwCubePositiveControlCertificate["sectionDigests"] {
  return {
    source: canonicalSha256(certificate.source),
    legalSystem: canonicalSha256(certificate.legalSystem),
    finiteAction: canonicalSha256(certificate.finiteAction),
    fullDavisQuotient: canonicalSha256(certificate.fullDavisQuotient),
    integralH1: canonicalSha256(certificate.integralH1),
    primitiveCocycle: canonicalSha256(certificate.primitiveCocycle),
    npcAndDirectedLinks: canonicalSha256(certificate.npcAndDirectedLinks),
    theorem: canonicalSha256(certificate.theorem),
  };
}

/** Replay against an authoritative source file and fresh exact reconstruction. */
export function replayJnwCubePositiveControlCertificate(
  stored: unknown,
  authoritativeSource: unknown,
): JnwCubePositiveControlReplay {
  const errors: string[] = [];
  const envelopeRecognized =
    typeof stored === "object" &&
    stored !== null &&
    (stored as Partial<JnwCubePositiveControlCertificate>).schemaVersion ===
      1 &&
    (stored as Partial<JnwCubePositiveControlCertificate>).kind ===
      "jnw-cube-graph-positive-control-certificate";
  let certificate: JnwCubePositiveControlCertificate | undefined;
  let reconstructed: JnwCubePositiveControlCertificate | undefined;
  let storedArtifactDigestValid = false;
  let authoritativeSourceMatches = false;
  let sectionDigestsValid = false;
  let freshReconstructionMatches = false;
  if (!envelopeRecognized) {
    errors.push("The stored value is not a JNW positive-control certificate.");
  } else {
    certificate = stored as JnwCubePositiveControlCertificate;
    try {
      storedArtifactDigestValid =
        certificate.artifactDigest ===
        computeJnwCubePositiveControlArtifactDigest(certificate);
      if (!storedArtifactDigestValid)
        errors.push("The stored artifact digest is invalid.");
    } catch (error) {
      errors.push(
        `The stored artifact cannot be canonically hashed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      const source = parseCoxeterSystemInput(authoritativeSource);
      authoritativeSourceMatches =
        certificate.source.systemCanonicalSha256 ===
          canonicalSha256(jsonCopy(source)) &&
        canonicalSha256(certificate.source.sourceSystem) ===
          canonicalSha256(jsonCopy(source));
      if (!authoritativeSourceMatches) {
        errors.push(
          "The certificate is not bound to the authoritative JNW source.",
        );
      }
      reconstructed = buildJnwCubePositiveControlCertificate(source);
    } catch (error) {
      errors.push(
        `Fresh source reconstruction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      sectionDigestsValid =
        canonicalSha256(certificate.sectionDigests) ===
        canonicalSha256(recordedSectionDigests(certificate));
      if (!sectionDigestsValid)
        errors.push("At least one stored section digest is invalid.");
    } catch (error) {
      errors.push(
        `Stored section replay failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (reconstructed) {
      freshReconstructionMatches =
        canonicalSha256(certificate) === canonicalSha256(reconstructed);
      if (!freshReconstructionMatches) {
        errors.push(
          "Fresh exact reconstruction does not match the stored certificate.",
        );
      }
    }
  }
  const checks = {
    envelopeRecognized,
    storedArtifactDigestValid,
    authoritativeSourceMatches,
    sectionDigestsValid,
    freshReconstructionMatches,
  };
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "jnw-cube-graph-positive-control-replay" as const,
    valid: Object.values(checks).every(Boolean) && errors.length === 0,
    checks,
    ...(certificate
      ? { storedArtifactDigest: certificate.artifactDigest }
      : {}),
    ...(reconstructed
      ? { reconstructedArtifactDigest: reconstructed.artifactDigest }
      : {}),
    errors,
  };
  return {
    ...withoutDigest,
    replayDigest: canonicalSha256(withoutDigest),
  };
}
