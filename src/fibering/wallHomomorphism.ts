import type {
  BarXCompressedComplex,
  BarXRelationCell,
  BoundaryOccurrence,
} from "../compression/types";
import { normalizeBoundary, validateBarXReferences } from "../walls/internal";
import type {
  OrientationSign,
  WallCoorientation,
  WallSystem,
} from "../walls/types";
import type {
  BezoutIdentity,
  CocycleImageCertificate,
  CocycleImageFailureWitness,
  FundamentalCycleEvaluation,
  FundamentalCycleStep,
  RelationBoundaryCocycleCheck,
  WallCocycleFailureWitness,
  WallCocycleEdgeValue,
  WallHomomorphismFiniteCertificate,
  WallIntegerCocycleCertificate,
} from "./types";

const FINITE_COCYCLE_NON_CLAIMS = [
  "No finite-generation claim is made for the kernel.",
  "No PL Morse link hypothesis is checked by this certificate.",
  "No algebraic or geometric fibering theorem is invoked.",
];

const IMAGE_NON_CLAIMS = [
  "The spanning-tree computation determines only the image of this supplied finite cellular cocycle.",
  "A primitive nonzero image does not by itself certify finite generation of the kernel.",
];

export interface DeriveWallIntegerCocycleOptions {
  /** Integer coefficient of each wall; omitted walls have coefficient one. */
  wallWeights?: Readonly<Record<string, number>>;
}

/**
 * Assign an integer to every stored bar-X edge from its wall coorientation and
 * check the signed sum on every exact relation-cell attaching cycle.
 */
export function deriveWallIntegerCocycle(
  barX: BarXCompressedComplex,
  wallSystem: WallSystem,
  coorientation: WallCoorientation,
  options: DeriveWallIntegerCocycleOptions = {},
): WallIntegerCocycleCertificate {
  const failures: WallCocycleFailureWitness[] = [];
  let barXReferencesValid = true;
  try {
    validateBarXReferences(barX);
  } catch (error) {
    barXReferencesValid = false;
    failures.push({
      kind: "invalid-bar-x",
      message: errorMessage(error),
    });
  }

  if (wallSystem.sourceComplexName !== barX.name) {
    failures.push({
      kind: "source-complex-mismatch",
      expectedName: barX.name,
      actualName: wallSystem.sourceComplexName,
      message: `Wall system names ${JSON.stringify(wallSystem.sourceComplexName)} but the supplied complex is ${JSON.stringify(barX.name)}.`,
    });
  }

  if (!coorientation.valid) {
    const messages =
      coorientation.errors.length > 0
        ? [...coorientation.errors].sort(compareIds)
        : ["The supplied wall coorientation is marked invalid."];
    for (const message of messages) {
      failures.push({ kind: "invalid-coorientation", message });
    }
  }

  const wallById = new Map(
    wallSystem.walls.map((wall) => [wall.id, wall] as const),
  );
  const knownEdgeIds = new Set(barX.geometricEdges.map((edge) => edge.id));
  const wallWeights = options.wallWeights ?? {};
  for (const wallId of Object.keys(wallWeights).sort(compareIds)) {
    if (!wallById.has(wallId)) {
      failures.push({
        kind: "unknown-wall-weight",
        wallId,
        message: `A weight was supplied for unknown wall ${wallId}.`,
      });
      continue;
    }
    const value = wallWeights[wallId];
    if (!Number.isSafeInteger(value)) {
      failures.push({
        kind: "invalid-wall-weight",
        wallId,
        value,
        message: `Wall ${wallId} has non-integer or unsafe weight ${value}.`,
      });
    }
  }

  for (const edgeId of Object.keys(coorientation.edgeDirections).sort(
    compareIds,
  )) {
    if (!knownEdgeIds.has(edgeId)) {
      failures.push({
        kind: "unknown-cooriented-edge",
        edgeId,
        message: `The coorientation contains unknown edge ${edgeId}.`,
      });
    }
  }

  const edgeValues: WallCocycleEdgeValue[] = [];
  for (const edge of [...barX.geometricEdges].sort((left, right) =>
    compareIds(left.id, right.id),
  )) {
    const wallId = wallSystem.edgeToWallId[edge.id];
    if (wallId === undefined) {
      failures.push({
        kind: "missing-wall-for-edge",
        edgeId: edge.id,
        message: `Edge ${edge.id} is not assigned to a wall.`,
      });
      continue;
    }
    const wall = wallById.get(wallId);
    if (wall === undefined || !wall.edgeIds.includes(edge.id)) {
      failures.push({
        kind: "missing-wall-for-edge",
        edgeId: edge.id,
        message: `Edge ${edge.id} maps to inconsistent wall ${wallId}.`,
      });
      continue;
    }

    const direction = coorientation.edgeDirections[edge.id];
    if (!isOrientationSign(direction)) {
      failures.push({
        kind: "missing-edge-direction",
        edgeId: edge.id,
        wallId,
        message: `Edge ${edge.id} has no valid coorientation direction.`,
      });
      continue;
    }
    const wallSign = coorientation.wallSigns[wallId];
    const parity = wall.edgeOrientationParity[edge.id];
    if (!isOrientationSign(wallSign) || !isOrientationSign(parity)) {
      failures.push({
        kind: "invalid-coorientation",
        message: `Wall ${wallId} lacks a valid sign or edge parity for ${edge.id}.`,
      });
      continue;
    }
    const expectedDirection = multiplySigns(wallSign, parity);
    if (direction !== expectedDirection) {
      failures.push({
        kind: "edge-direction-mismatch",
        edgeId: edge.id,
        wallId,
        expectedDirection,
        actualDirection: direction,
        message: `Edge ${edge.id} has direction ${direction}; wall ${wallId} requires ${expectedDirection}.`,
      });
    }

    const wallWeight = wallWeights[wallId] ?? 1;
    if (!Number.isSafeInteger(wallWeight)) continue;
    edgeValues.push({
      edgeId: edge.id,
      wallId,
      generator: edge.generator,
      sourceVertexId: edge.sourceVertexId,
      targetVertexId: edge.targetVertexId,
      wallSign,
      wallWeight,
      storedDirection: direction,
      value: direction * wallWeight,
    });
  }

  const edgeValueById = new Map(
    edgeValues.map((entry) => [entry.edgeId, entry.value] as const),
  );
  const relationChecks = [...barX.relationCells]
    .sort((left, right) => compareIds(left.id, right.id))
    .map((cell) => checkRelationBoundary(cell, edgeValueById, failures));

  const wallAssignmentsComplete = !failures.some(
    (failure) =>
      failure.kind === "missing-wall-for-edge" ||
      failure.kind === "unknown-wall-weight",
  );
  const coorientationConsistent = !failures.some(
    (failure) =>
      failure.kind === "invalid-coorientation" ||
      failure.kind === "missing-edge-direction" ||
      failure.kind === "edge-direction-mismatch" ||
      failure.kind === "unknown-cooriented-edge" ||
      failure.kind === "source-complex-mismatch" ||
      failure.kind === "invalid-wall-weight",
  );
  const edgeValuesComplete = edgeValues.length === barX.geometricEdges.length;
  const relationBoundarySumsZero =
    relationChecks.length === barX.relationCells.length &&
    relationChecks.every((check) => check.passed);
  const closed =
    barXReferencesValid &&
    wallAssignmentsComplete &&
    coorientationConsistent &&
    edgeValuesComplete &&
    relationBoundarySumsZero;

  return {
    schemaVersion: 1,
    kind: "wall-integer-cocycle-certificate",
    method: "cooriented-wall-edge-values-and-cellular-boundary-sums",
    sourceComplexName: barX.name,
    edgeValues,
    relationChecks,
    checks: {
      barXReferencesValid,
      wallAssignmentsComplete,
      coorientationConsistent,
      edgeValuesComplete,
      relationBoundarySumsZero,
    },
    closed,
    failures: sortCocycleFailures(failures),
    nonClaims: [...FINITE_COCYCLE_NON_CLAIMS],
  };
}

/**
 * Compute periods on deterministic fundamental loops and their positive gcd.
 * Dividing those periods by the gcd gives the primitive representative on
 * fundamental-group generators; no division of individual edge values is
 * assumed.
 */
export function computeCocycleImage(
  barX: BarXCompressedComplex,
  cocycle: WallIntegerCocycleCertificate,
): CocycleImageCertificate {
  const failures: CocycleImageFailureWitness[] = [];
  const failedCellIds = cocycle.relationChecks
    .filter((check) => !check.passed)
    .map((check) => check.cellId)
    .sort(compareIds);
  if (!cocycle.closed) {
    failures.push({
      kind: "cocycle-not-closed",
      failedCellIds,
      message:
        failedCellIds.length > 0
          ? `The edge assignment is not closed on cells ${failedCellIds.join(", ")}.`
          : "The edge assignment failed a finite cocycle precondition.",
    });
  }

  const edgeValueById = new Map(
    cocycle.edgeValues.map((entry) => [entry.edgeId, entry.value] as const),
  );
  const missingEdgeIds = barX.geometricEdges
    .map((edge) => edge.id)
    .filter((edgeId) => !edgeValueById.has(edgeId))
    .sort(compareIds);
  if (missingEdgeIds.length > 0) {
    failures.push({
      kind: "incomplete-edge-values",
      missingEdgeIds,
      message: `No integer value is available for edges ${missingEdgeIds.join(", ")}.`,
    });
  }

  let forest: SpanningForest;
  try {
    forest = buildSpanningForest(barX);
  } catch (error) {
    return unavailableImage(barX, emptySpanningForest(), [
      ...failures,
      {
        kind: "invalid-one-skeleton",
        message: errorMessage(error),
      },
    ]);
  }
  if (forest.componentRoots.length !== 1) {
    failures.push({
      kind: "disconnected-one-skeleton",
      componentRootVertexIds: forest.componentRoots,
      message: `The one-skeleton has ${forest.componentRoots.length} connected components; a single based fundamental-group image is not defined.`,
    });
  }

  if (failures.length > 0) {
    return unavailableImage(barX, forest, failures);
  }

  let fundamentalCycles: FundamentalCycleEvaluation[];
  try {
    fundamentalCycles = buildFundamentalCycleEvaluations(
      barX,
      forest,
      edgeValueById,
    );
  } catch (error) {
    return unavailableImage(barX, forest, [
      {
        kind: "unsafe-integer-arithmetic",
        message: errorMessage(error),
      },
    ]);
  }

  const rawValues = fundamentalCycles.map((cycle) => ({
    generatorId: cycle.generatorId,
    value: cycle.rawValue,
  }));
  let bezoutIdentity: BezoutIdentity;
  try {
    bezoutIdentity = computeBezoutIdentity(rawValues);
  } catch (error) {
    return unavailableImage(barX, forest, [
      {
        kind: "unsafe-integer-arithmetic",
        message: errorMessage(error),
      },
    ]);
  }
  const rawImageGenerator = bezoutIdentity.gcd;
  if (rawImageGenerator === 0) {
    const zeroFailure: CocycleImageFailureWitness = {
      kind: "zero-image",
      generatorIds: fundamentalCycles.map((cycle) => cycle.generatorId),
      message: "Every deterministic fundamental-loop period is zero.",
    };
    return {
      schemaVersion: 1,
      kind: "cocycle-image-certificate",
      method: "deterministic-spanning-tree-period-gcd",
      status: "zero",
      sourceComplexName: barX.name,
      connected: true,
      componentRootVertexIds: forest.componentRoots,
      spanningTreeEdgeIds: forest.treeEdgeIds,
      fundamentalCycles,
      rawImageGenerator: 0,
      rawImageNotation: "0",
      rawHomomorphismPrimitive: false,
      primitiveRepresentativeAvailable: false,
      normalizationDivisor: null,
      bezoutIdentity,
      failures: [zeroFailure],
      nonClaims: [...IMAGE_NON_CLAIMS],
    };
  }

  fundamentalCycles = fundamentalCycles.map((cycle) => ({
    ...cycle,
    normalizedValue: exactIntegerQuotient(
      cycle.rawValue,
      rawImageGenerator,
      `period of ${cycle.generatorId}`,
    ),
  }));
  const normalizedBezoutIdentity = normalizeBezoutIdentity(
    bezoutIdentity,
    rawImageGenerator,
  );
  const rawPrimitive = rawImageGenerator === 1;

  return {
    schemaVersion: 1,
    kind: "cocycle-image-certificate",
    method: "deterministic-spanning-tree-period-gcd",
    status: rawPrimitive ? "primitive" : "nonprimitive",
    sourceComplexName: barX.name,
    connected: true,
    componentRootVertexIds: forest.componentRoots,
    spanningTreeEdgeIds: forest.treeEdgeIds,
    fundamentalCycles,
    rawImageGenerator,
    rawImageNotation: rawPrimitive ? "Z" : `${rawImageGenerator}Z`,
    rawHomomorphismPrimitive: rawPrimitive,
    primitiveRepresentativeAvailable: true,
    normalizationDivisor: rawImageGenerator,
    bezoutIdentity,
    normalizedBezoutIdentity,
    failures: [],
    nonClaims: [...IMAGE_NON_CLAIMS],
  };
}

/** Build the complete finite-data cocycle and image package. */
export function certifyWallHomomorphismFiniteData(
  barX: BarXCompressedComplex,
  wallSystem: WallSystem,
  coorientation: WallCoorientation,
  options: DeriveWallIntegerCocycleOptions = {},
): WallHomomorphismFiniteCertificate {
  const cocycle = deriveWallIntegerCocycle(
    barX,
    wallSystem,
    coorientation,
    options,
  );
  const image = computeCocycleImage(barX, cocycle);
  const nonzeroImage =
    image.rawImageGenerator !== null && image.rawImageGenerator > 0;
  const finiteChecksPassed =
    cocycle.closed &&
    image.connected &&
    nonzeroImage &&
    image.primitiveRepresentativeAvailable;

  return {
    schemaVersion: 1,
    kind: "wall-homomorphism-finite-certificate",
    method: "wall-cocycle-plus-fundamental-cycle-image",
    sourceComplexName: barX.name,
    cocycle,
    image,
    checks: {
      cocycleDefinedOnEveryEdge: cocycle.checks.edgeValuesComplete,
      cocycleConsistentAroundEveryRelationCell:
        cocycle.checks.relationBoundarySumsZero,
      oneSkeletonConnected: image.connected,
      nonzeroImage,
      primitiveRepresentativeAvailable: image.primitiveRepresentativeAvailable,
    },
    finiteChecksPassed,
    nonClaims: [
      ...FINITE_COCYCLE_NON_CLAIMS,
      ...IMAGE_NON_CLAIMS,
      "Passing these finite checks is not a virtual-fibering certificate without the separately stated PL Morse hypotheses.",
    ],
  };
}

interface SpanningForest {
  componentRoots: string[];
  treeEdgeIds: string[];
  nonTreeEdgeIds: string[];
  rootByVertex: Map<string, string>;
  parentByVertex: Map<
    string,
    { parentVertexId: string; edgeId: string; traversal: OrientationSign }
  >;
}

function checkRelationBoundary(
  cell: BarXRelationCell,
  edgeValueById: ReadonlyMap<string, number>,
  failures: WallCocycleFailureWitness[],
): RelationBoundaryCocycleCheck {
  let boundary: BoundaryOccurrence[];
  try {
    boundary = normalizeBoundary(cell);
  } catch (error) {
    const message = errorMessage(error);
    failures.push({
      kind: "invalid-relation-boundary",
      cellId: cell.id,
      message,
    });
    return {
      cellId: cell.id,
      generatorPair: [...cell.generatorPair],
      m: cell.m,
      expectedBoundaryLength: 2 * cell.m,
      boundaryEdgeIds: [],
      boundaryVertexIds: [],
      steps: [],
      boundarySum: 0,
      passed: false,
      errors: [message],
    };
  }

  const errors: string[] = [];
  let runningSum = 0;
  const steps: RelationBoundaryCocycleCheck["steps"] = [];
  for (const occurrence of boundary) {
    const value = edgeValueById.get(occurrence.edgeId);
    if (value === undefined) {
      errors.push(
        `Boundary index ${occurrence.boundaryIndex} has no value for edge ${occurrence.edgeId}.`,
      );
      continue;
    }
    const signedContribution = occurrence.traversal * value;
    try {
      runningSum = safeAdd(runningSum, signedContribution);
    } catch (error) {
      const message = `${cell.id}: ${errorMessage(error)}`;
      errors.push(message);
      failures.push({
        kind: "invalid-relation-boundary",
        cellId: cell.id,
        message,
      });
      break;
    }
    steps.push({
      boundaryIndex: occurrence.boundaryIndex,
      edgeId: occurrence.edgeId,
      generator: occurrence.generator,
      fromVertexId: occurrence.sourceVertexId,
      toVertexId: occurrence.targetVertexId,
      traversal: occurrence.traversal,
      storedEdgeValue: value,
      signedContribution,
      runningSum,
    });
  }
  const passed =
    errors.length === 0 && steps.length === boundary.length && runningSum === 0;
  if (!passed && errors.length === 0) {
    const edgeIds = boundary.map((occurrence) => occurrence.edgeId);
    const contributions = steps.map((step) => step.signedContribution);
    failures.push({
      kind: "relation-boundary-sum",
      cellId: cell.id,
      boundarySum: runningSum,
      edgeIds,
      contributions,
      message: `Cell ${cell.id} has signed boundary sum ${runningSum}, not 0.`,
    });
  }

  return {
    cellId: cell.id,
    generatorPair: [...cell.generatorPair],
    m: cell.m,
    expectedBoundaryLength: 2 * cell.m,
    boundaryEdgeIds: boundary.map((occurrence) => occurrence.edgeId),
    boundaryVertexIds: boundary.map((occurrence) => occurrence.sourceVertexId),
    steps,
    boundarySum: runningSum,
    passed,
    errors,
  };
}

function buildSpanningForest(barX: BarXCompressedComplex): SpanningForest {
  const vertexIds = barX.vertices.map((vertex) => vertex.id).sort(compareIds);
  const parent = new Map(vertexIds.map((id) => [id, id] as const));
  const find = (id: string): string => {
    const current = parent.get(id);
    if (current === undefined) throw new Error(`Unknown vertex ${id}.`);
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string): boolean => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return false;
    const [small, large] =
      compareIds(leftRoot, rightRoot) <= 0
        ? [leftRoot, rightRoot]
        : [rightRoot, leftRoot];
    parent.set(large, small);
    return true;
  };

  const treeEdgeIds: string[] = [];
  const nonTreeEdgeIds: string[] = [];
  for (const edge of [...barX.geometricEdges].sort((left, right) =>
    compareIds(left.id, right.id),
  )) {
    if (union(edge.sourceVertexId, edge.targetVertexId)) {
      treeEdgeIds.push(edge.id);
    } else {
      nonTreeEdgeIds.push(edge.id);
    }
  }

  const treeEdgeSet = new Set(treeEdgeIds);
  const edgeById = new Map(
    barX.geometricEdges.map((edge) => [edge.id, edge] as const),
  );
  const adjacency = new Map<
    string,
    Array<{ vertexId: string; edgeId: string; traversal: OrientationSign }>
  >(vertexIds.map((id) => [id, []]));
  for (const edgeId of treeEdgeIds) {
    const edge = edgeById.get(edgeId);
    if (!edge) throw new Error(`Missing tree edge ${edgeId}.`);
    adjacency.get(edge.sourceVertexId)?.push({
      vertexId: edge.targetVertexId,
      edgeId,
      traversal: 1,
    });
    adjacency.get(edge.targetVertexId)?.push({
      vertexId: edge.sourceVertexId,
      edgeId,
      traversal: -1,
    });
  }
  for (const entries of adjacency.values()) {
    entries.sort(
      (left, right) =>
        compareIds(left.edgeId, right.edgeId) ||
        compareIds(left.vertexId, right.vertexId),
    );
  }

  const componentRoots = [...new Set(vertexIds.map((id) => find(id)))].sort(
    compareIds,
  );
  const rootByVertex = new Map<string, string>();
  const parentByVertex: SpanningForest["parentByVertex"] = new Map();
  for (const root of componentRoots) {
    rootByVertex.set(root, root);
    const queue = [root];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertexId = queue[cursor];
      for (const entry of adjacency.get(vertexId) ?? []) {
        if (rootByVertex.has(entry.vertexId)) continue;
        rootByVertex.set(entry.vertexId, root);
        parentByVertex.set(entry.vertexId, {
          parentVertexId: vertexId,
          edgeId: entry.edgeId,
          traversal: entry.traversal,
        });
        queue.push(entry.vertexId);
      }
    }
  }

  // This assertion also catches malformed edges before path construction.
  for (const edge of barX.geometricEdges) {
    if (!treeEdgeSet.has(edge.id) && !nonTreeEdgeIds.includes(edge.id)) {
      throw new Error(`Edge ${edge.id} was not classified by the forest.`);
    }
  }
  return {
    componentRoots,
    treeEdgeIds,
    nonTreeEdgeIds,
    rootByVertex,
    parentByVertex,
  };
}

function buildFundamentalCycleEvaluations(
  barX: BarXCompressedComplex,
  forest: SpanningForest,
  edgeValueById: ReadonlyMap<string, number>,
): FundamentalCycleEvaluation[] {
  const edgeById = new Map(
    barX.geometricEdges.map((edge) => [edge.id, edge] as const),
  );
  return forest.nonTreeEdgeIds.map((edgeId) => {
    const edge = edgeById.get(edgeId);
    if (!edge) throw new Error(`Missing non-tree edge ${edgeId}.`);
    const root = forest.rootByVertex.get(edge.sourceVertexId);
    if (
      root === undefined ||
      root !== forest.rootByVertex.get(edge.targetVertexId)
    ) {
      throw new Error(`Non-tree edge ${edgeId} crosses forest components.`);
    }
    const sourcePath = pathFromRoot(edge.sourceVertexId, forest);
    const targetPath = pathFromRoot(edge.targetVertexId, forest);
    const steps: FundamentalCycleStep[] = [
      ...sourcePath,
      { edgeId, traversal: 1 },
      ...[...targetPath].reverse().map((step) => ({
        edgeId: step.edgeId,
        traversal: negateSign(step.traversal),
      })),
    ];
    const rawValue = steps.reduce((sum, step) => {
      const value = edgeValueById.get(step.edgeId);
      if (value === undefined) {
        throw new Error(`Fundamental cycle uses unvalued edge ${step.edgeId}.`);
      }
      return safeAdd(sum, step.traversal * value);
    }, 0);
    return {
      generatorId: `fundamental:${edgeId}`,
      componentRootVertexId: root,
      nonTreeEdgeId: edgeId,
      steps,
      rawValue,
    };
  });
}

function pathFromRoot(
  vertexId: string,
  forest: SpanningForest,
): FundamentalCycleStep[] {
  const reversed: FundamentalCycleStep[] = [];
  let current = vertexId;
  while (forest.parentByVertex.has(current)) {
    const entry = forest.parentByVertex.get(current);
    if (!entry) break;
    reversed.push({ edgeId: entry.edgeId, traversal: entry.traversal });
    current = entry.parentVertexId;
  }
  return reversed.reverse();
}

/** Compute a deterministic positive-gcd Bézout identity. */
export function computeBezoutIdentity(
  values: ReadonlyArray<{ generatorId: string; value: number }>,
): BezoutIdentity {
  const sorted = [...values].sort((left, right) =>
    compareIds(left.generatorId, right.generatorId),
  );
  if (sorted.some((entry) => !Number.isSafeInteger(entry.value))) {
    throw new Error("Bézout input values must be safe integers.");
  }
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].generatorId === sorted[index].generatorId) {
      throw new Error(
        `Bézout input repeats generator ${sorted[index].generatorId}.`,
      );
    }
  }

  const coefficients = new Map<string, bigint>();
  let gcd = 0n;
  for (const entry of sorted) {
    const value = BigInt(entry.value);
    if (value === 0n) continue;
    if (gcd === 0n) {
      gcd = absoluteBigInt(value);
      coefficients.set(entry.generatorId, value > 0n ? 1n : -1n);
      continue;
    }
    const result = extendedGcd(gcd, absoluteBigInt(value));
    for (const [generatorId, coefficient] of coefficients) {
      coefficients.set(generatorId, coefficient * result.leftCoefficient);
    }
    coefficients.set(
      entry.generatorId,
      result.rightCoefficient * (value > 0n ? 1n : -1n),
    );
    gcd = result.gcd;
  }

  const terms = sorted
    .map((entry) => ({
      generatorId: entry.generatorId,
      value: entry.value,
      coefficient: bigintToSafeNumber(
        coefficients.get(entry.generatorId) ?? 0n,
      ),
    }))
    .filter((entry) => entry.coefficient !== 0);
  const evaluatedSum = terms.reduce(
    (sum, term) => safeAdd(sum, term.coefficient * term.value),
    0,
  );
  const numericGcd = bigintToSafeNumber(gcd);
  return {
    gcd: numericGcd,
    terms,
    evaluatedSum,
    verified: evaluatedSum === numericGcd,
  };
}

function normalizeBezoutIdentity(
  identity: BezoutIdentity,
  divisor: number,
): BezoutIdentity {
  const terms = identity.terms.map((term) => ({
    ...term,
    value: exactIntegerQuotient(
      term.value,
      divisor,
      `Bézout value for ${term.generatorId}`,
    ),
  }));
  const evaluatedSum = terms.reduce(
    (sum, term) => safeAdd(sum, term.coefficient * term.value),
    0,
  );
  return {
    gcd: 1,
    terms,
    evaluatedSum,
    verified: evaluatedSum === 1,
  };
}

function unavailableImage(
  barX: BarXCompressedComplex,
  forest: SpanningForest,
  failures: CocycleImageFailureWitness[],
): CocycleImageCertificate {
  return {
    schemaVersion: 1,
    kind: "cocycle-image-certificate",
    method: "deterministic-spanning-tree-period-gcd",
    status: "unavailable",
    sourceComplexName: barX.name,
    connected: forest.componentRoots.length === 1,
    componentRootVertexIds: forest.componentRoots,
    spanningTreeEdgeIds: forest.treeEdgeIds,
    fundamentalCycles: [],
    rawImageGenerator: null,
    rawImageNotation: "unavailable",
    rawHomomorphismPrimitive: false,
    primitiveRepresentativeAvailable: false,
    normalizationDivisor: null,
    failures,
    nonClaims: [...IMAGE_NON_CLAIMS],
  };
}

function emptySpanningForest(): SpanningForest {
  return {
    componentRoots: [],
    treeEdgeIds: [],
    nonTreeEdgeIds: [],
    rootByVertex: new Map(),
    parentByVertex: new Map(),
  };
}

function extendedGcd(
  left: bigint,
  right: bigint,
): { gcd: bigint; leftCoefficient: bigint; rightCoefficient: bigint } {
  let oldR = left;
  let r = right;
  let oldS = 1n;
  let s = 0n;
  let oldT = 0n;
  let t = 1n;
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
    [oldT, t] = [t, oldT - quotient * t];
  }
  return {
    gcd: oldR,
    leftCoefficient: oldS,
    rightCoefficient: oldT,
  };
}

function exactIntegerQuotient(
  dividend: number,
  divisor: number,
  label: string,
): number {
  if (divisor <= 0 || dividend % divisor !== 0) {
    throw new Error(`${label} is not divisible by ${divisor}.`);
  }
  const quotient = dividend / divisor;
  if (!Number.isSafeInteger(quotient)) {
    throw new Error(`${label} has an unsafe normalized value.`);
  }
  return quotient;
}

function safeAdd(left: number, right: number): number {
  const sum = left + right;
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(sum)
  ) {
    throw new Error(
      "Integer cocycle arithmetic exceeded the safe integer range.",
    );
  }
  return sum;
}

function bigintToSafeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || BigInt(number) !== value) {
    throw new Error("Bézout arithmetic exceeded the safe integer range.");
  }
  return number;
}

function absoluteBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function isOrientationSign(value: unknown): value is OrientationSign {
  return value === 1 || value === -1;
}

function multiplySigns(
  left: OrientationSign,
  right: OrientationSign,
): OrientationSign {
  return (left * right) as OrientationSign;
}

function negateSign(value: OrientationSign): OrientationSign {
  return value === 1 ? -1 : 1;
}

function compareIds(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sortCocycleFailures(
  failures: WallCocycleFailureWitness[],
): WallCocycleFailureWitness[] {
  return [...failures].sort((left, right) => {
    const kindOrder = compareIds(left.kind, right.kind);
    if (kindOrder !== 0) return kindOrder;
    return compareIds(left.message, right.message);
  });
}
