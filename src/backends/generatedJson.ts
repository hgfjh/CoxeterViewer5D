import type {
  CayleyEdge,
  CayleyNode,
  DavisHigherCell,
  DavisTwoCell,
  DeduplicationMethod,
  GeneratedBallCertification,
  GeneratedCayleyBall,
  GenerationMetadata,
} from "../types";

export interface GeneratedBallValidationResult {
  ok: boolean;
  value?: GeneratedCayleyBall;
  errors: string[];
  warnings: string[];
}

export class GeneratedBallValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(
      `Invalid generated Cayley ball JSON:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
    this.name = "GeneratedBallValidationError";
    this.errors = errors;
  }
}

const deduplicationMethods = new Set<DeduplicationMethod>([
  "exact",
  "rounded-matrix",
  "external-sage",
  "external-gap-kbmag",
]);
const completenessValues = new Set(["complete", "truncated", "unknown"]);
const certificationStatuses = new Set([
  "uncertified",
  "certified",
  "failed",
  "passed",
  "skipped",
]);
const higherCellSources = new Set<DavisHigherCell["source"]>([
  "derived-visible-coset",
  "imported-exact-coset",
]);
const higherCellSizeStatuses = new Set(["matches", "mismatch", "unknown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function validatePosition(
  value: unknown,
  path: string,
  errors: string[],
): value is [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    errors.push(`${path} must contain exactly three finite coordinates.`);
    return false;
  }

  value.forEach((coordinate, i) => {
    if (!isFiniteNumber(coordinate)) {
      errors.push(`${path}[${i}] must be a finite number.`);
    }
  });

  return errors.length === 0;
}

function validateNode(
  value: unknown,
  index: number,
  rank: number | undefined,
  errors: string[],
): value is CayleyNode {
  const path = `nodes[${index}]`;

  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    errors.push(`${path}.id must be a non-empty string.`);
  }

  if (!Array.isArray(value.word)) {
    errors.push(`${path}.word must be an array of generator indices.`);
  } else {
    value.word.forEach((generator, i) => {
      if (
        !isInteger(generator) ||
        generator < 0 ||
        (rank !== undefined && generator >= rank)
      ) {
        errors.push(`${path}.word[${i}] must be a valid generator index.`);
      }
    });
  }

  if (!isInteger(value.length) || value.length < 0) {
    errors.push(`${path}.length must be a non-negative integer.`);
  } else if (Array.isArray(value.word) && value.length !== value.word.length) {
    errors.push(`${path}.length must match the preferred word length.`);
  }

  if (value.matrixKey !== undefined && typeof value.matrixKey !== "string") {
    errors.push(`${path}.matrixKey must be a string when provided.`);
  }

  if (value.position !== undefined) {
    validatePosition(value.position, `${path}.position`, errors);
  }

  if (value.hyperbolicPoint !== undefined) {
    if (!Array.isArray(value.hyperbolicPoint)) {
      errors.push(`${path}.hyperbolicPoint must be an array when provided.`);
    } else {
      value.hyperbolicPoint.forEach((coordinate, i) => {
        if (!isFiniteNumber(coordinate)) {
          errors.push(`${path}.hyperbolicPoint[${i}] must be finite.`);
        }
      });
    }
  }

  return errors.length === 0;
}

function validateEdge(
  value: unknown,
  index: number,
  rank: number | undefined,
  nodeIds: Set<string>,
  errors: string[],
): value is CayleyEdge {
  const path = `edges[${index}]`;

  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    errors.push(`${path}.id must be a non-empty string.`);
  }

  for (const endpoint of ["source", "target"] as const) {
    if (typeof value[endpoint] !== "string") {
      errors.push(`${path}.${endpoint} must be a node id string.`);
    } else if (!nodeIds.has(value[endpoint])) {
      errors.push(
        `${path}.${endpoint} refers to unknown node "${value[endpoint]}".`,
      );
    }
  }

  if (
    !isInteger(value.generator) ||
    value.generator < 0 ||
    (rank !== undefined && value.generator >= rank)
  ) {
    errors.push(`${path}.generator must be a valid generator index.`);
  }

  return errors.length === 0;
}

function validateTwoCell(
  value: unknown,
  index: number,
  rank: number | undefined,
  nodeIds: Set<string>,
  errors: string[],
): value is DavisTwoCell {
  const path = `twoCells[${index}]`;

  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    errors.push(`${path}.id must be a non-empty string.`);
  }

  if (!Array.isArray(value.generatorPair) || value.generatorPair.length !== 2) {
    errors.push(`${path}.generatorPair must contain two generator indices.`);
  } else {
    value.generatorPair.forEach((generator, i) => {
      if (
        !isInteger(generator) ||
        generator < 0 ||
        (rank !== undefined && generator >= rank)
      ) {
        errors.push(`${path}.generatorPair[${i}] must be valid.`);
      }
    });
  }

  if (!isInteger(value.m) || value.m < 2) {
    errors.push(`${path}.m must be an integer >= 2.`);
  }

  if (!Array.isArray(value.boundaryNodeIds)) {
    errors.push(`${path}.boundaryNodeIds must be an array of node ids.`);
  } else {
    if (isInteger(value.m) && value.boundaryNodeIds.length !== 2 * value.m) {
      errors.push(`${path}.boundaryNodeIds must have length 2*m.`);
    }

    value.boundaryNodeIds.forEach((nodeId, i) => {
      if (typeof nodeId !== "string" || !nodeIds.has(nodeId)) {
        errors.push(`${path}.boundaryNodeIds[${i}] refers to an unknown node.`);
      }
    });
  }

  return errors.length === 0;
}

function validateHigherCell(
  value: unknown,
  index: number,
  rank: number | undefined,
  nodeIds: Set<string>,
  edgeIds: Set<string>,
  twoCellIds: Set<string>,
  errors: string[],
): value is DavisHigherCell {
  const path = `higherCells[${index}]`;

  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    errors.push(`${path}.id must be a non-empty string.`);
  }

  if (
    typeof value.sphericalSubsetId !== "string" ||
    value.sphericalSubsetId.trim().length === 0
  ) {
    errors.push(`${path}.sphericalSubsetId must be a non-empty string.`);
  }

  if (!Array.isArray(value.generators) || value.generators.length < 3) {
    errors.push(`${path}.generators must contain at least three generators.`);
  } else {
    value.generators.forEach((generator, i) => {
      if (
        !isInteger(generator) ||
        generator < 0 ||
        (rank !== undefined && generator >= rank)
      ) {
        errors.push(
          `${path}.generators[${i}] must be a valid generator index.`,
        );
      }
    });
  }

  if (!isInteger(value.rank) || value.rank < 3) {
    errors.push(`${path}.rank must be an integer >= 3.`);
  }

  if (!Array.isArray(value.nodeIds) || value.nodeIds.length === 0) {
    errors.push(`${path}.nodeIds must be a non-empty array.`);
  } else {
    value.nodeIds.forEach((nodeId, i) => {
      if (typeof nodeId !== "string" || !nodeIds.has(nodeId)) {
        errors.push(`${path}.nodeIds[${i}] refers to an unknown node.`);
      }
    });
  }

  if (value.complete !== true) {
    errors.push(`${path}.complete must be true for exported exact cells.`);
  }

  if (
    typeof value.source !== "string" ||
    !higherCellSources.has(value.source as DavisHigherCell["source"])
  ) {
    errors.push(
      `${path}.source must be "derived-visible-coset" or "imported-exact-coset".`,
    );
  }

  if (value.coset !== undefined) {
    validateHigherCellCoset(
      value.coset,
      `${path}.coset`,
      nodeIds,
      Array.isArray(value.nodeIds) ? value.nodeIds : [],
      errors,
    );
  }

  if (value.incidence !== undefined) {
    validateHigherCellIncidence(
      value.incidence,
      `${path}.incidence`,
      nodeIds,
      edgeIds,
      twoCellIds,
      Array.isArray(value.nodeIds) ? value.nodeIds : [],
      errors,
    );
  }

  if (value.rendering !== undefined) {
    validateHigherCellRendering(value.rendering, `${path}.rendering`, errors);
  }

  return errors.length === 0;
}

function validateHigherCellCoset(
  value: unknown,
  path: string,
  nodeIds: Set<string>,
  cellNodeIds: string[],
  errors: string[],
) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object when provided.`);
    return;
  }

  for (const field of ["key", "representativeNodeId", "minNodeId"] as const) {
    if (typeof value[field] !== "string" || value[field].trim().length === 0) {
      errors.push(`${path}.${field} must be a non-empty string.`);
    }
  }

  for (const field of ["representativeNodeId", "minNodeId"] as const) {
    if (typeof value[field] === "string" && !nodeIds.has(value[field])) {
      errors.push(`${path}.${field} refers to an unknown node.`);
    } else if (
      typeof value[field] === "string" &&
      !cellNodeIds.includes(value[field])
    ) {
      errors.push(`${path}.${field} must belong to the cell nodeIds.`);
    }
  }

  if (!isInteger(value.nodeCount) || value.nodeCount < 1) {
    errors.push(`${path}.nodeCount must be a positive integer.`);
  } else if (cellNodeIds.length > 0 && value.nodeCount !== cellNodeIds.length) {
    errors.push(`${path}.nodeCount must match nodeIds.length.`);
  }

  if (
    value.expectedSubgroupOrder !== undefined &&
    (!isInteger(value.expectedSubgroupOrder) || value.expectedSubgroupOrder < 1)
  ) {
    errors.push(`${path}.expectedSubgroupOrder must be a positive integer.`);
  }

  if (
    typeof value.subgroupSizeStatus !== "string" ||
    !higherCellSizeStatuses.has(value.subgroupSizeStatus)
  ) {
    errors.push(`${path}.subgroupSizeStatus must be a supported status.`);
  }

  if (
    isInteger(value.expectedSubgroupOrder) &&
    isInteger(value.nodeCount) &&
    value.subgroupSizeStatus === "matches" &&
    value.nodeCount !== value.expectedSubgroupOrder
  ) {
    errors.push(
      `${path}.subgroupSizeStatus cannot be "matches" when nodeCount differs from expectedSubgroupOrder.`,
    );
  }

  if (
    isInteger(value.expectedSubgroupOrder) &&
    isInteger(value.nodeCount) &&
    value.subgroupSizeStatus === "mismatch" &&
    value.nodeCount === value.expectedSubgroupOrder
  ) {
    errors.push(
      `${path}.subgroupSizeStatus cannot be "mismatch" when nodeCount equals expectedSubgroupOrder.`,
    );
  }

  if (value.representativeWord !== undefined) {
    if (!Array.isArray(value.representativeWord)) {
      errors.push(`${path}.representativeWord must be an array when provided.`);
    } else {
      value.representativeWord.forEach((generator, i) => {
        if (!isInteger(generator) || generator < 0) {
          errors.push(
            `${path}.representativeWord[${i}] must be a non-negative integer.`,
          );
        }
      });
    }
  }
}

function validateHigherCellIncidence(
  value: unknown,
  path: string,
  nodeIds: Set<string>,
  edgeIds: Set<string>,
  twoCellIds: Set<string>,
  cellNodeIds: string[],
  errors: string[],
) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object when provided.`);
    return;
  }

  if (!Array.isArray(value.vertexNodeIds)) {
    errors.push(`${path}.vertexNodeIds must be an array.`);
  } else {
    value.vertexNodeIds.forEach((nodeId, i) => {
      if (typeof nodeId !== "string" || !nodeIds.has(nodeId)) {
        errors.push(`${path}.vertexNodeIds[${i}] refers to an unknown node.`);
      }
    });

    if (!sameStringSet(value.vertexNodeIds, cellNodeIds)) {
      errors.push(`${path}.vertexNodeIds must match nodeIds as a set.`);
    }
  }

  if (!isStringArray(value.edgeIds)) {
    errors.push(`${path}.edgeIds must be an array of edge ids.`);
  } else {
    value.edgeIds.forEach((edgeId, i) => {
      if (!edgeIds.has(edgeId)) {
        errors.push(`${path}.edgeIds[${i}] refers to an unknown edge.`);
      }
    });
  }

  if (!isStringArray(value.rankTwoCellIds)) {
    errors.push(`${path}.rankTwoCellIds must be an array of cell ids.`);
  } else {
    value.rankTwoCellIds.forEach((cellId, i) => {
      if (!twoCellIds.has(cellId)) {
        errors.push(
          `${path}.rankTwoCellIds[${i}] refers to an unknown rank-two cell.`,
        );
      }
    });
  }
}

function validateHigherCellRendering(
  value: unknown,
  path: string,
  errors: string[],
) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object when provided.`);
    return;
  }

  if (value.kind !== "exact-incidence" && value.kind !== "visual-proxy") {
    errors.push(`${path}.kind must be "exact-incidence" or "visual-proxy".`);
  }

  if (typeof value.proxy !== "boolean") {
    errors.push(`${path}.proxy must be boolean.`);
  }

  if (typeof value.note !== "string" || value.note.trim().length === 0) {
    errors.push(`${path}.note must be a non-empty string.`);
  }
}

function sameStringSet(left: unknown[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);
  if (leftSet.size !== right.length) {
    return false;
  }

  return right.every((value) => leftSet.has(value));
}

function validateMetadata(
  value: unknown,
  errors: string[],
): value is GenerationMetadata {
  if (!isRecord(value)) {
    errors.push("metadata must be an object.");
    return false;
  }

  if (!isInteger(value.radius) || value.radius < 0) {
    errors.push("metadata.radius must be a non-negative integer.");
  }

  if (!isInteger(value.requestedRadius) || value.requestedRadius < 0) {
    errors.push("metadata.requestedRadius must be a non-negative integer.");
  }

  if (value.generatorConvention !== "right-multiplication") {
    errors.push('metadata.generatorConvention must be "right-multiplication".');
  }

  if (
    typeof value.deduplication !== "string" ||
    !deduplicationMethods.has(value.deduplication as DeduplicationMethod)
  ) {
    errors.push("metadata.deduplication must name a supported method.");
  }

  if (
    value.matrixKeyPrecision !== undefined &&
    (!isInteger(value.matrixKeyPrecision) || value.matrixKeyPrecision < 0)
  ) {
    errors.push("metadata.matrixKeyPrecision must be a non-negative integer.");
  }

  if (!isRecord(value.caps)) {
    errors.push("metadata.caps must be an object.");
  } else {
    for (const cap of ["maxRadius", "maxNodes", "maxEdges"] as const) {
      if (!isInteger(value.caps[cap]) || value.caps[cap] < 0) {
        errors.push(`metadata.caps.${cap} must be a non-negative integer.`);
      }
    }
  }

  if (typeof value.createdAt !== "string" || value.createdAt.length === 0) {
    errors.push("metadata.createdAt must be a non-empty string.");
  }

  if (!isStringArray(value.warnings)) {
    errors.push("metadata.warnings must be an array of strings.");
  }

  if (value.backend !== undefined) {
    validateBackendMetadata(value.backend, "metadata.backend", errors);
  }

  for (const optional of [
    "backendVersion",
    "command",
    "inputHash",
    "outputHash",
  ] as const) {
    if (value[optional] !== undefined && typeof value[optional] !== "string") {
      errors.push(`metadata.${optional} must be a string when provided.`);
    }
  }

  if (value.completeness !== undefined) {
    validateCompletenessMetadata(
      value.completeness,
      "metadata.completeness",
      errors,
    );
  }

  if (value.capStatus !== undefined) {
    if (!isRecord(value.capStatus)) {
      errors.push("metadata.capStatus must be an object when provided.");
    } else {
      for (const field of [
        "hitNodeCap",
        "hitEdgeCap",
        "hitRadiusCap",
        "radiusCapped",
        "nodeCapHit",
        "edgeCapHit",
        "truncated",
      ] as const) {
        if (
          value.capStatus[field] !== undefined &&
          typeof value.capStatus[field] !== "boolean"
        ) {
          errors.push(`metadata.capStatus.${field} must be boolean.`);
        }
      }
    }
  }

  if (value.certification !== undefined) {
    validateGeneratedBallCertification(
      value.certification,
      "metadata.certification",
      errors,
    );
  }

  return errors.length === 0;
}

function validateBackendMetadata(
  value: unknown,
  path: string,
  errors: string[],
) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    errors.push(`${path}.id must be a non-empty string.`);
  }

  for (const field of ["version", "requiredRuntime"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      errors.push(`${path}.${field} must be a string when provided.`);
    }
  }

  if (value.command !== undefined) {
    if (!isRecord(value.command)) {
      errors.push(`${path}.command must be an object when provided.`);
    } else if (
      !Array.isArray(value.command.argv) ||
      !value.command.argv.every((entry) => typeof entry === "string")
    ) {
      errors.push(`${path}.command.argv must be an array of strings.`);
    }
  }

  if (value.input !== undefined) {
    if (!isRecord(value.input)) {
      errors.push(`${path}.input must be an object when provided.`);
    } else {
      if (typeof value.input.path !== "string") {
        errors.push(`${path}.input.path must be a string.`);
      }
      if (typeof value.input.sha256 !== "string") {
        errors.push(`${path}.input.sha256 must be a string.`);
      }
    }
  }
}

function validateCompletenessMetadata(
  value: unknown,
  path: string,
  errors: string[],
) {
  if (typeof value === "string") {
    if (!completenessValues.has(value)) {
      errors.push(`${path} must be "complete", "truncated", or "unknown".`);
    }
    return;
  }

  if (!isRecord(value)) {
    errors.push(`${path} must be a string or object.`);
    return;
  }

  for (const field of [
    "requestedBallComplete",
    "effectiveRadiusBallComplete",
  ] as const) {
    if (typeof value[field] !== "boolean") {
      errors.push(`${path}.${field} must be boolean.`);
    }
  }

  if (!isStringArray(value.blockingReasons)) {
    errors.push(`${path}.blockingReasons must be an array of strings.`);
  }
}

function validateGeneratedBallCertification(
  value: unknown,
  path: string,
  errors: string[],
): value is GeneratedBallCertification {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }

  if (
    typeof value.status !== "string" ||
    !certificationStatuses.has(value.status)
  ) {
    errors.push(
      `${path}.status must be "uncertified", "certified", or "failed".`,
    );
  }

  if (
    value.verifier !== undefined &&
    (typeof value.verifier !== "string" || value.verifier.trim().length === 0)
  ) {
    errors.push(`${path}.verifier must be a non-empty string.`);
  }

  if (value.checks !== undefined) {
    if (!isRecord(value.checks)) {
      errors.push(`${path}.checks must be an object.`);
    } else {
      for (const check of [
        "reducedWords",
        "generatorEdgeCompleteness",
        "rankTwoBoundaries",
        "capAwareCompleteness",
      ] as const) {
        if (typeof value.checks[check] !== "boolean") {
          errors.push(`${path}.checks.${check} must be boolean.`);
        }
      }
    }
  }

  if (!isStringArray(value.errors)) {
    errors.push(`${path}.errors must be an array of strings.`);
  }

  if (value.warnings !== undefined && !isStringArray(value.warnings)) {
    errors.push(`${path}.warnings must be an array of strings.`);
  }

  if (
    value.certifiedAt !== undefined &&
    typeof value.certifiedAt !== "string"
  ) {
    errors.push(`${path}.certifiedAt must be a string when provided.`);
  }

  return errors.length === 0;
}

function addDuplicateErrors(
  values: Array<{ id: string }>,
  path: string,
  errors: string[],
) {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value.id)) {
      errors.push(`${path} contains duplicate id "${value.id}".`);
    }
    seen.add(value.id);
  }
}

/**
 * Validates generated graph JSON at the backend boundary. This is deliberately
 * separate from Coxeter input validation: exported balls contain graph
 * references and approximation metadata that raw Coxeter examples do not.
 */
export function validateGeneratedCayleyBall(
  input: unknown,
): GeneratedBallValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Generated Cayley ball JSON must be an object."],
      warnings,
    };
  }

  if (typeof input.systemName !== "string" || input.systemName.length === 0) {
    errors.push("systemName must be a non-empty string.");
  }

  if (!isInteger(input.rank) || input.rank < 1) {
    errors.push("rank must be a positive integer.");
  }

  const rank = isInteger(input.rank) && input.rank > 0 ? input.rank : undefined;
  const nodes: CayleyNode[] = [];

  if (!Array.isArray(input.nodes)) {
    errors.push("nodes must be an array.");
  } else {
    input.nodes.forEach((node, i) => {
      if (validateNode(node, i, rank, errors)) {
        nodes.push(node);
      }
    });
    addDuplicateErrors(nodes, "nodes", errors);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: CayleyEdge[] = [];

  if (!Array.isArray(input.edges)) {
    errors.push("edges must be an array.");
  } else {
    input.edges.forEach((edge, i) => {
      if (validateEdge(edge, i, rank, nodeIds, errors)) {
        edges.push(edge);
      }
    });
    addDuplicateErrors(edges, "edges", errors);
  }
  const edgeIds = new Set(edges.map((edge) => edge.id));

  const twoCells: DavisTwoCell[] = [];

  if (!Array.isArray(input.twoCells)) {
    errors.push("twoCells must be an array.");
  } else {
    input.twoCells.forEach((cell, i) => {
      if (validateTwoCell(cell, i, rank, nodeIds, errors)) {
        twoCells.push(cell);
      }
    });
    addDuplicateErrors(twoCells, "twoCells", errors);
  }
  const twoCellIds = new Set(twoCells.map((cell) => cell.id));

  const higherCells: DavisHigherCell[] = [];
  if (input.higherCells !== undefined) {
    if (!Array.isArray(input.higherCells)) {
      errors.push("higherCells must be an array when provided.");
    } else {
      input.higherCells.forEach((cell, i) => {
        if (
          validateHigherCell(
            cell,
            i,
            rank,
            nodeIds,
            edgeIds,
            twoCellIds,
            errors,
          )
        ) {
          higherCells.push(cell);
        }
      });
      addDuplicateErrors(higherCells, "higherCells", errors);
    }
  }

  validateMetadata(input.metadata, errors);

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const value = input as unknown as GeneratedCayleyBall;
  const certification = certifyGeneratedCayleyBall(value);
  if (value.metadata.deduplication === "rounded-matrix") {
    warnings.push(
      "Generated JSON uses rounded-matrix deduplication and is a visualization artifact.",
    );
  }
  warnings.push(...(certification.warnings ?? []));

  if (
    (value.metadata.certification?.status === "certified" ||
      value.metadata.certification?.status === "passed") &&
    certification.status !== "certified"
  ) {
    return {
      ok: false,
      errors: certification.errors,
      warnings,
    };
  }

  return {
    ok: true,
    value: {
      ...value,
      metadata: {
        ...value.metadata,
        certification: value.metadata.certification ?? certification,
      },
    },
    errors: [],
    warnings,
  };
}

export function parseGeneratedCayleyBall(input: unknown): GeneratedCayleyBall {
  const result = validateGeneratedCayleyBall(input);

  if (!result.ok || result.value === undefined) {
    throw new GeneratedBallValidationError(result.errors);
  }

  return result.value;
}

export function certifyGeneratedCayleyBall(
  ball: GeneratedCayleyBall,
): GeneratedBallCertification {
  const errors: string[] = [];
  const warnings: string[] = [];
  const exactLike =
    ball.metadata.deduplication === "exact" ||
    ball.metadata.deduplication === "external-sage" ||
    ball.metadata.deduplication === "external-gap-kbmag";
  const completeness = ball.metadata.completeness;
  const capped =
    completeness === "truncated" ||
    (typeof completeness === "object" &&
      completeness.requestedBallComplete === false) ||
    ball.metadata.capStatus?.hitEdgeCap === true ||
    ball.metadata.capStatus?.hitNodeCap === true ||
    ball.metadata.capStatus?.hitRadiusCap === true ||
    ball.metadata.capStatus?.edgeCapHit === true ||
    ball.metadata.capStatus?.nodeCapHit === true ||
    ball.metadata.capStatus?.radiusCapped === true ||
    ball.metadata.capStatus?.truncated === true;

  if (!exactLike) {
    warnings.push(
      "Generated ball certification is skipped for approximate deduplication.",
    );
  }

  const reducedWords = ball.nodes.every(
    (node) => node.length === node.word.length,
  );
  if (!reducedWords) {
    errors.push("Some nodes have preferred words whose length does not match.");
  }

  const generatorCompleteness = checkGeneratorCompleteness(
    ball,
    capped,
    errors,
  );
  const rankTwoBoundaries = checkRankTwoBoundaries(ball, errors);
  const capAwareCompleteness = !capped;
  if (capped) {
    warnings.push(
      "Ball hit a cap or reports truncated completeness; full radius certification is disabled.",
    );
  }

  const checks = {
    reducedWords,
    generatorEdgeCompleteness: generatorCompleteness,
    rankTwoBoundaries,
    capAwareCompleteness,
  };
  const certified =
    exactLike &&
    errors.length === 0 &&
    Object.values(checks).every((value) => value);

  return {
    status: certified
      ? "certified"
      : errors.length > 0
        ? "failed"
        : "uncertified",
    certifiedAt: certified ? ball.metadata.createdAt : undefined,
    verifier: "coxeter-viewer-generated-ball-v1",
    checks,
    errors,
    warnings,
  };
}

function checkGeneratorCompleteness(
  ball: GeneratedCayleyBall,
  capped: boolean,
  errors: string[],
): boolean {
  if (capped) {
    return false;
  }

  const incidentGenerators = new Map<string, Set<number>>();
  for (const node of ball.nodes) {
    incidentGenerators.set(node.id, new Set());
  }

  for (const edge of ball.edges) {
    incidentGenerators.get(edge.source)?.add(edge.generator);
    incidentGenerators.get(edge.target)?.add(edge.generator);
  }

  let ok = true;
  for (const node of ball.nodes) {
    if (node.length >= ball.metadata.radius) {
      continue;
    }
    const seen = incidentGenerators.get(node.id)?.size ?? 0;
    if (seen !== ball.rank) {
      ok = false;
      errors.push(
        `node "${node.id}" has ${seen}/${ball.rank} generator adjacencies inside the claimed complete ball.`,
      );
    }
  }

  return ok;
}

function checkRankTwoBoundaries(
  ball: GeneratedCayleyBall,
  errors: string[],
): boolean {
  const edgeGenerators = new Map<string, Set<number>>();
  for (const edge of ball.edges) {
    const key = undirectedEdgeKey(edge.source, edge.target);
    const generators = edgeGenerators.get(key) ?? new Set<number>();
    generators.add(edge.generator);
    edgeGenerators.set(key, generators);
  }

  let ok = true;
  for (const cell of ball.twoCells) {
    const boundary = cell.boundaryNodeIds;
    const starts: Array<0 | 1> = [0, 1];
    const hasAlternatingBoundary = starts.some((start) =>
      boundary.every((nodeId, index) => {
        const next = boundary[(index + 1) % boundary.length];
        const expected = cell.generatorPair[(index + start) % 2];
        return edgeGenerators
          .get(undirectedEdgeKey(nodeId, next))
          ?.has(expected);
      }),
    );

    if (!hasAlternatingBoundary) {
      ok = false;
      errors.push(
        `twoCell "${cell.id}" boundary does not alternate its claimed generators through existing edges.`,
      );
    }
  }

  return ok;
}

function undirectedEdgeKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function sortGeneratedBall(ball: GeneratedCayleyBall): GeneratedCayleyBall {
  return {
    ...ball,
    nodes: [...ball.nodes].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    edges: [...ball.edges].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    twoCells: [...ball.twoCells].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    higherCells: ball.higherCells
      ? [...ball.higherCells].sort((left, right) =>
          left.id.localeCompare(right.id),
        )
      : undefined,
    metadata: {
      ...ball.metadata,
      warnings: [...ball.metadata.warnings],
    },
  };
}

export function serializeGeneratedCayleyBall(
  ball: GeneratedCayleyBall,
): string {
  const parsed = parseGeneratedCayleyBall(ball);
  return `${JSON.stringify(sortGeneratedBall(parsed), null, 2)}\n`;
}
