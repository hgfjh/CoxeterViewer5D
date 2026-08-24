import { validateCoxeterSystemInput } from "../coxeter";
import type { CoxeterSystemInput } from "../types";
import type {
  BarXCompressedComplex,
  BarXGeometricEdge,
  BoundaryOccurrence,
  CompressionValidationResult,
  HatXCoverComplex,
  HatXDirectedLiftEdge,
} from "./types";

interface FinitePair {
  pair: [number, number];
  m: number;
}

function finitePairs(system: CoxeterSystemInput): FinitePair[] {
  const pairs: FinitePair[] = [];
  for (let i = 0; i < system.rank; i += 1) {
    for (let j = i + 1; j < system.rank; j += 1) {
      const entry = system.coxeterMatrix[i]?.[j];
      if (entry !== "inf" && Number.isInteger(entry) && entry >= 2) {
        pairs.push({ pair: [i, j], m: entry });
      }
    }
  }
  return pairs;
}

function duplicateIds<T extends { id: string }>(
  values: T[],
  path: string,
  errors: string[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) {
      errors.push(`${path} contains duplicate id "${value.id}".`);
    }
    seen.add(value.id);
  }
}

function occurrenceMatchesDirectedEdge(
  occurrence: BoundaryOccurrence,
  edge: HatXDirectedLiftEdge,
): boolean {
  return (
    occurrence.traversal === 1 &&
    occurrence.sourceVertexId === edge.sourceVertexId &&
    occurrence.targetVertexId === edge.targetVertexId &&
    occurrence.generator === edge.generator
  );
}

function occurrenceMatchesGeometricEdge(
  occurrence: BoundaryOccurrence,
  edge: BarXGeometricEdge,
): boolean {
  const source =
    occurrence.traversal === 1 ? edge.sourceVertexId : edge.targetVertexId;
  const target =
    occurrence.traversal === 1 ? edge.targetVertexId : edge.sourceVertexId;
  return (
    occurrence.sourceVertexId === source &&
    occurrence.targetVertexId === target &&
    occurrence.generator === edge.generator
  );
}

function validateBoundaryContinuity(
  boundary: BoundaryOccurrence[],
  path: string,
  errors: string[],
): void {
  if (boundary.length === 0) {
    errors.push(`${path} must not be empty.`);
    return;
  }
  boundary.forEach((occurrence, index) => {
    if (occurrence.boundaryIndex !== index) {
      errors.push(`${path}[${index}].boundaryIndex must equal ${index}.`);
    }
    const next = boundary[(index + 1) % boundary.length];
    if (occurrence.targetVertexId !== next.sourceVertexId) {
      errors.push(
        `${path} is not closed: occurrence ${index} ends at "${occurrence.targetVertexId}", but the next starts at "${next.sourceVertexId}".`,
      );
    }
  });
}

function pairKey(pair: [number, number]): string {
  return `${pair[0]}:${pair[1]}`;
}

/** Validate the exact cell counts and attaching maps of a constructed hat X. */
export function validateHatX(
  hatX: HatXCoverComplex,
): CompressionValidationResult {
  const errors: string[] = [];
  const warnings = [...hatX.warnings];
  const systemValidation = validateCoxeterSystemInput(hatX.sourceSystem);
  if (!systemValidation.ok) {
    errors.push(
      ...systemValidation.errors.map((error) => `sourceSystem: ${error}`),
    );
  }

  duplicateIds(hatX.vertices, "vertices", errors);
  duplicateIds(hatX.directedLiftEdges, "directedLiftEdges", errors);
  duplicateIds(hatX.generatorBigonCells, "generatorBigonCells", errors);
  duplicateIds(hatX.liftedRelationCells, "liftedRelationCells", errors);

  const vertexIds = new Set(hatX.vertices.map((vertex) => vertex.id));
  const sourceVertexIds = new Set(
    hatX.vertices.map((vertex) => vertex.sourceQuotientVertexId),
  );
  if (sourceVertexIds.size !== hatX.vertices.length) {
    errors.push("vertices must map one-to-one to source quotient vertices.");
  }

  const d = hatX.vertices.length;
  const r = hatX.sourceSystem.rank;
  if (hatX.directedLiftEdges.length !== d * r) {
    errors.push(
      `directedLiftEdges has ${hatX.directedLiftEdges.length} entries; expected d*r=${d * r}.`,
    );
  }
  if (hatX.generatorBigonCells.length !== d * r) {
    errors.push(
      `generatorBigonCells has ${hatX.generatorBigonCells.length} entries; expected d*r=${d * r}.`,
    );
  }

  const edgeById = new Map(
    hatX.directedLiftEdges.map((edge) => [edge.id, edge]),
  );
  const outgoing = new Map<string, HatXDirectedLiftEdge[]>();
  for (const edge of hatX.directedLiftEdges) {
    if (!vertexIds.has(edge.sourceVertexId)) {
      errors.push(
        `directedLiftEdges["${edge.id}"] has unknown source vertex "${edge.sourceVertexId}".`,
      );
    }
    if (!vertexIds.has(edge.targetVertexId)) {
      errors.push(
        `directedLiftEdges["${edge.id}"] has unknown target vertex "${edge.targetVertexId}".`,
      );
    }
    if (edge.sourceVertexId === edge.targetVertexId) {
      errors.push(
        `directedLiftEdges["${edge.id}"] is fixed by generator ${edge.generator}.`,
      );
    }
    if (
      !Number.isInteger(edge.generator) ||
      edge.generator < 0 ||
      edge.generator >= r
    ) {
      errors.push(
        `directedLiftEdges["${edge.id}"] has invalid generator ${edge.generator}.`,
      );
      continue;
    }
    const key = `${edge.sourceVertexId}\u0000${edge.generator}`;
    const bucket = outgoing.get(key) ?? [];
    bucket.push(edge);
    outgoing.set(key, bucket);
  }

  for (const vertex of hatX.vertices) {
    for (let generator = 0; generator < r; generator += 1) {
      const key = `${vertex.id}\u0000${generator}`;
      const edges = outgoing.get(key) ?? [];
      if (edges.length !== 1) {
        errors.push(
          `vertex "${vertex.id}" must have exactly one directed lift for generator ${generator}; found ${edges.length}.`,
        );
        continue;
      }
      const edge = edges[0];
      const reverse = outgoing.get(`${edge.targetVertexId}\u0000${generator}`);
      if (reverse?.length !== 1 || reverse[0].targetVertexId !== vertex.id) {
        errors.push(
          `generator ${generator} is not involutive across directed lift "${edge.id}".`,
        );
      }
    }
  }

  const bigonUseCount = new Map<string, number>();
  const bigonFirstUseCount = new Map<string, number>();
  const bigonSecondUseCount = new Map<string, number>();
  const bigonBaseKeys = new Set<string>();
  for (const bigon of hatX.generatorBigonCells) {
    const boundary = bigon.boundaryOccurrences;
    validateBoundaryContinuity(
      boundary,
      `generatorBigonCells["${bigon.id}"].boundaryOccurrences`,
      errors,
    );
    if (boundary.length !== 2) {
      errors.push(
        `generatorBigonCells["${bigon.id}"] must have boundary length 2.`,
      );
    }
    if (!vertexIds.has(bigon.baseVertexId)) {
      errors.push(
        `generatorBigonCells["${bigon.id}"] has unknown base vertex "${bigon.baseVertexId}".`,
      );
    }
    if (boundary[0]?.sourceVertexId !== bigon.baseVertexId) {
      errors.push(
        `generatorBigonCells["${bigon.id}"] does not start at its base vertex.`,
      );
    }
    const baseKey = `${bigon.generator}\u0000${bigon.baseVertexId}`;
    if (bigonBaseKeys.has(baseKey)) {
      errors.push(
        `generator ${bigon.generator} has duplicate bigon lift at base vertex "${bigon.baseVertexId}".`,
      );
    }
    bigonBaseKeys.add(baseKey);
    for (const occurrence of boundary) {
      const edge = edgeById.get(occurrence.edgeId);
      if (edge === undefined) {
        errors.push(
          `generatorBigonCells["${bigon.id}"] uses unknown edge "${occurrence.edgeId}".`,
        );
        continue;
      }
      if (!occurrenceMatchesDirectedEdge(occurrence, edge)) {
        errors.push(
          `generatorBigonCells["${bigon.id}"] occurrence ${occurrence.boundaryIndex} does not follow directed lift "${edge.id}".`,
        );
      }
      if (edge.generator !== bigon.generator) {
        errors.push(
          `generatorBigonCells["${bigon.id}"] mixes generator labels.`,
        );
      }
      bigonUseCount.set(edge.id, (bigonUseCount.get(edge.id) ?? 0) + 1);
      const positionUses =
        occurrence.boundaryIndex === 0
          ? bigonFirstUseCount
          : bigonSecondUseCount;
      positionUses.set(edge.id, (positionUses.get(edge.id) ?? 0) + 1);
    }
  }
  for (const edge of hatX.directedLiftEdges) {
    if ((bigonUseCount.get(edge.id) ?? 0) !== 2) {
      errors.push(
        `directed lift "${edge.id}" must occur in exactly two generator bigons.`,
      );
    }
    if (
      (bigonFirstUseCount.get(edge.id) ?? 0) !== 1 ||
      (bigonSecondUseCount.get(edge.id) ?? 0) !== 1
    ) {
      errors.push(
        `directed lift "${edge.id}" must occur once in each boundary position among its two generator bigons.`,
      );
    }
  }

  const expectedPairs = new Map(
    finitePairs(hatX.sourceSystem).map((entry) => [pairKey(entry.pair), entry]),
  );
  const relationCountByPair = new Map<string, number>();
  const relationBaseKeys = new Set<string>();
  for (const cell of hatX.liftedRelationCells) {
    const key = pairKey(cell.generatorPair);
    const expected = expectedPairs.get(key);
    relationCountByPair.set(key, (relationCountByPair.get(key) ?? 0) + 1);
    if (expected === undefined || expected.m !== cell.m) {
      errors.push(
        `liftedRelationCells["${cell.id}"] does not match a finite source-system relation.`,
      );
      continue;
    }
    const baseKey = `${key}\u0000${cell.baseVertexId}`;
    if (relationBaseKeys.has(baseKey)) {
      errors.push(
        `finite pair (${cell.generatorPair.join(", ")}) has duplicate lift at base vertex "${cell.baseVertexId}".`,
      );
    }
    relationBaseKeys.add(baseKey);
    if (cell.boundaryOccurrences.length !== 2 * cell.m) {
      errors.push(
        `liftedRelationCells["${cell.id}"] has boundary length ${cell.boundaryOccurrences.length}; expected ${2 * cell.m}.`,
      );
    }
    validateBoundaryContinuity(
      cell.boundaryOccurrences,
      `liftedRelationCells["${cell.id}"].boundaryOccurrences`,
      errors,
    );
    if (cell.boundaryOccurrences[0]?.sourceVertexId !== cell.baseVertexId) {
      errors.push(
        `liftedRelationCells["${cell.id}"] does not start at its base vertex.`,
      );
    }
    const boundarySources = new Set<string>();
    cell.boundaryOccurrences.forEach((occurrence, index) => {
      const edge = edgeById.get(occurrence.edgeId);
      if (edge === undefined) {
        errors.push(
          `liftedRelationCells["${cell.id}"] uses unknown edge "${occurrence.edgeId}".`,
        );
      } else if (!occurrenceMatchesDirectedEdge(occurrence, edge)) {
        errors.push(
          `liftedRelationCells["${cell.id}"] occurrence ${index} does not follow directed lift "${edge.id}".`,
        );
      }
      const expectedGenerator = cell.generatorPair[index % 2];
      if (occurrence.generator !== expectedGenerator) {
        errors.push(
          `liftedRelationCells["${cell.id}"] boundary does not alternate generators ${cell.generatorPair.join(", ")}.`,
        );
      }
      boundarySources.add(occurrence.sourceVertexId);
    });
    if (boundarySources.size !== 2 * cell.m) {
      errors.push(
        `liftedRelationCells["${cell.id}"] revisits a vertex before completing its 2m boundary; the finite-pair action is not free.`,
      );
    }
  }

  for (const { pair } of expectedPairs.values()) {
    const count = relationCountByPair.get(pairKey(pair)) ?? 0;
    if (count !== d) {
      errors.push(
        `finite pair (${pair.join(", ")}) has ${count} lifted relation cells; expected d=${d}.`,
      );
    }
  }
  if (hatX.liftedRelationCells.length !== d * expectedPairs.size) {
    errors.push(
      `liftedRelationCells has ${hatX.liftedRelationCells.length} entries; expected d times the number of finite pairs (${d * expectedPairs.size}).`,
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Validate the compressed counts and signed attaching cycles of bar X. */
export function validateBarX(
  barX: BarXCompressedComplex,
): CompressionValidationResult {
  const errors: string[] = [];
  const warnings = [...barX.warnings];
  const systemValidation = validateCoxeterSystemInput(barX.sourceSystem);
  if (!systemValidation.ok) {
    errors.push(
      ...systemValidation.errors.map((error) => `sourceSystem: ${error}`),
    );
  }

  duplicateIds(barX.vertices, "vertices", errors);
  duplicateIds(barX.geometricEdges, "geometricEdges", errors);
  duplicateIds(barX.relationCells, "relationCells", errors);

  const vertexIds = new Set(barX.vertices.map((vertex) => vertex.id));
  const d = barX.vertices.length;
  const r = barX.sourceSystem.rank;
  const expectedEdgeCount = (d * r) / 2;
  if (!Number.isInteger(expectedEdgeCount)) {
    errors.push(
      `d*r=${d * r} is odd, so generator bigons cannot pair all lifts.`,
    );
  }
  if (barX.geometricEdges.length !== expectedEdgeCount) {
    errors.push(
      `geometricEdges has ${barX.geometricEdges.length} entries; expected d*r/2=${expectedEdgeCount}.`,
    );
  }

  const edgeById = new Map(barX.geometricEdges.map((edge) => [edge.id, edge]));
  const incidences = new Map<string, number>();
  for (const edge of barX.geometricEdges) {
    if (
      !vertexIds.has(edge.sourceVertexId) ||
      !vertexIds.has(edge.targetVertexId)
    ) {
      errors.push(
        `geometricEdges["${edge.id}"] refers to an unknown endpoint.`,
      );
    }
    if (edge.sourceVertexId === edge.targetVertexId) {
      errors.push(`geometricEdges["${edge.id}"] must not be a loop.`);
    }
    if (
      !Number.isInteger(edge.generator) ||
      edge.generator < 0 ||
      edge.generator >= r
    ) {
      errors.push(
        `geometricEdges["${edge.id}"] has invalid generator ${edge.generator}.`,
      );
    }
    if (edge.sourceHatDirectedEdgeIds.length !== 2) {
      errors.push(
        `geometricEdges["${edge.id}"] must have two directed lift sources.`,
      );
    }
    if (edge.sourceHatBigonCellIds.length !== 2) {
      errors.push(
        `geometricEdges["${edge.id}"] must have two generator-bigon sources.`,
      );
    }
    if (new Set(edge.sourceHatBigonCellIds).size !== 2) {
      errors.push(
        `geometricEdges["${edge.id}"] must name two distinct generator-bigon sources.`,
      );
    }
    for (const vertexId of [edge.sourceVertexId, edge.targetVertexId]) {
      const key = `${vertexId}\u0000${edge.generator}`;
      incidences.set(key, (incidences.get(key) ?? 0) + 1);
    }
  }
  for (const vertex of barX.vertices) {
    for (let generator = 0; generator < r; generator += 1) {
      const count = incidences.get(`${vertex.id}\u0000${generator}`) ?? 0;
      if (count !== 1) {
        errors.push(
          `vertex "${vertex.id}" must meet exactly one geometric edge for generator ${generator}; found ${count}.`,
        );
      }
    }
  }

  const pairCounts = new Map<string, number>();
  const orbitKeys = new Set<string>();
  const expectedPairs = new Map(
    finitePairs(barX.sourceSystem).map((entry) => [pairKey(entry.pair), entry]),
  );
  for (const cell of barX.relationCells) {
    const key = pairKey(cell.generatorPair);
    const expected = expectedPairs.get(key);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    if (expected === undefined || expected.m !== cell.m) {
      errors.push(
        `relationCells["${cell.id}"] does not match a finite source-system relation.`,
      );
      continue;
    }
    if (cell.boundaryOccurrences.length !== 2 * cell.m) {
      errors.push(
        `relationCells["${cell.id}"] has boundary length ${cell.boundaryOccurrences.length}; expected ${2 * cell.m}.`,
      );
    }
    if (cell.sourceHatRelationCellIds.length !== 2 * cell.m) {
      errors.push(
        `relationCells["${cell.id}"] has ${cell.sourceHatRelationCellIds.length} source relation lifts; expected ${2 * cell.m}.`,
      );
    }
    validateBoundaryContinuity(
      cell.boundaryOccurrences,
      `relationCells["${cell.id}"].boundaryOccurrences`,
      errors,
    );
    const boundaryVertices = new Set<string>();
    cell.boundaryOccurrences.forEach((occurrence, index) => {
      const edge = edgeById.get(occurrence.edgeId);
      if (edge === undefined) {
        errors.push(
          `relationCells["${cell.id}"] uses unknown edge "${occurrence.edgeId}".`,
        );
      } else if (!occurrenceMatchesGeometricEdge(occurrence, edge)) {
        errors.push(
          `relationCells["${cell.id}"] occurrence ${index} has an incorrect signed traversal of "${edge.id}".`,
        );
      }
      const expectedGenerator = cell.generatorPair[index % 2];
      if (occurrence.generator !== expectedGenerator) {
        errors.push(
          `relationCells["${cell.id}"] boundary does not alternate generators ${cell.generatorPair.join(", ")}.`,
        );
      }
      boundaryVertices.add(occurrence.sourceVertexId);
    });
    if (boundaryVertices.size !== 2 * cell.m) {
      errors.push(
        `relationCells["${cell.id}"] does not have 2m distinct boundary vertices.`,
      );
    }
    const orbitKey = `${key}\u0000${[...boundaryVertices].sort().join("\u0001")}`;
    if (orbitKeys.has(orbitKey)) {
      errors.push(
        `relationCells contains duplicate finite-pair orbit for (${cell.generatorPair.join(", ")}).`,
      );
    }
    orbitKeys.add(orbitKey);
  }

  for (const { pair, m } of expectedPairs.values()) {
    const expectedCount = d / (2 * m);
    if (!Number.isInteger(expectedCount)) {
      errors.push(
        `finite pair (${pair.join(", ")}) cannot act freely: d=${d} is not divisible by 2m=${2 * m}.`,
      );
      continue;
    }
    const actual = pairCounts.get(pairKey(pair)) ?? 0;
    if (actual !== expectedCount) {
      errors.push(
        `finite pair (${pair.join(", ")}) has ${actual} compressed relation cells; expected d/(2m)=${expectedCount}.`,
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
