import { validateCoxeterSystemInput } from "../coxeter";
import type { QuotientComplex, QuotientEdge } from "../quotient";
import { validateQuotientComplex } from "../quotient";
import type { CoxeterSystemInput } from "../types";
import type {
  BarXCompressedComplex,
  BarXGeometricEdge,
  BoundaryOccurrence,
  CompressionCertificate,
  CompressionMap,
  CoverCompressionResult,
  CoverConstructionProvenance,
  CoverEvidenceStatus,
  HatXCoverComplex,
  HatXDirectedLiftEdge,
  HatXLiftedRelationCell,
} from "./types";
import { validateBarX, validateHatX } from "./validation";

interface FinitePair {
  pair: [number, number];
  m: number;
}

interface PreparedQuotient {
  quotient: QuotientComplex;
  sourceSystem: CoxeterSystemInput;
  vertexIds: string[];
  actions: Map<number, Record<string, string>>;
  quotientEdgeBySourceGenerator: Map<string, QuotientEdge>;
  finitePairs: FinitePair[];
  provenance: CoverConstructionProvenance;
  warnings: string[];
}

export class CoverCompressionError extends Error {
  readonly errors: string[];

  constructor(message: string, errors: string[]) {
    super(`${message}:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "CoverCompressionError";
    this.errors = errors;
  }
}

function encodeId(value: string): string {
  return encodeURIComponent(value);
}

function pairKey(pair: [number, number]): string {
  return `${pair[0]}:${pair[1]}`;
}

function sourceGeneratorKey(vertexId: string, generator: number): string {
  return `${vertexId}\u0000${generator}`;
}

function finitePairs(system: CoxeterSystemInput): FinitePair[] {
  const pairs: FinitePair[] = [];
  for (let i = 0; i < system.rank; i += 1) {
    for (let j = i + 1; j < system.rank; j += 1) {
      const entry = system.coxeterMatrix[i][j];
      if (entry !== "inf") {
        pairs.push({ pair: [i, j], m: entry });
      }
    }
  }
  return pairs;
}

function actionEvidence(quotient: QuotientComplex): CoverEvidenceStatus {
  const certificates = [quotient.verifier, quotient.subgroup?.certificate];
  if (
    certificates.some(
      (certificate) =>
        certificate?.status === "passed" &&
        certificate.scopes?.includes("quotient-action"),
    )
  ) {
    return "supplied-passed";
  }
  return "in-repo-checked";
}

function torsionFreeEvidence(quotient: QuotientComplex): CoverEvidenceStatus {
  if (quotient.subgroup?.torsionFreeVerification?.verified === true) {
    return "supplied-passed";
  }
  if (quotient.torsionFreeCertificate?.status === "passed") {
    return quotient.torsionFreeCertificate.method ===
      "visible-spherical-stabilizer"
      ? "in-repo-checked"
      : "supplied-passed";
  }
  const system = quotient.sourceSystem;
  const rankTwoEntry = system?.rank === 2 ? system.coxeterMatrix[0][1] : "inf";
  if (rankTwoEntry !== "inf" && quotient.vertices.length === 2 * rankTwoEntry) {
    // After the action preconditions pass, this is a regular action of the
    // finite group I2(m). Its point stabilizer is therefore the identity.
    return "in-repo-checked";
  }
  return "not-supplied";
}

function buildProvenance(
  quotient: QuotientComplex,
): CoverConstructionProvenance {
  const torsionEvidence = torsionFreeEvidence(quotient);
  const sourceActionCertificate = [
    quotient.verifier,
    quotient.subgroup?.certificate,
  ].find(
    (certificate) =>
      certificate?.status === "passed" &&
      certificate.scopes?.includes("quotient-action"),
  );
  return {
    sourceQuotientName: quotient.name,
    construction: "permutation-action-lift",
    actionEvidence: actionEvidence(quotient),
    torsionFreeEvidence: torsionEvidence,
    sourceVerifierBackend: sourceActionCertificate?.backend,
    sourceVerifierInputHash: sourceActionCertificate?.inputHash,
    checksPerformed: [
      "complete bijective generator action",
      "fixed-point-free generator involutions",
      "one directed edge for each vertex and generator",
      "finite Coxeter relation closure",
      "free finite-dihedral vertex orbits",
    ],
    claims: [
      "The cellular cover and compression are determined exactly by the supplied finite permutation action.",
      "All counts, fibers, and attaching cycles are checked in-repo.",
    ],
    limitations: [
      ...(torsionEvidence === "not-supplied"
        ? [
            "No global torsion-free certificate was supplied. Fixed-point and finite-pair freeness checks do not replace one.",
          ]
        : torsionEvidence === "in-repo-checked"
          ? [
              "Torsion-freeness is supported by an in-repo combinatorial check, not an external certificate.",
            ]
          : []),
      "No geometric realization or embedding is certified by this construction.",
    ],
  };
}

function alternatingEndpoint(
  start: string,
  pair: [number, number],
  m: number,
  actions: Map<number, Record<string, string>>,
): { endpoint?: string; visited: string[] } {
  let current: string | undefined = start;
  const visited: string[] = [];
  for (let index = 0; index < 2 * m && current !== undefined; index += 1) {
    visited.push(current);
    current = actions.get(pair[index % 2])?.[current];
  }
  return { endpoint: current, visited };
}

function finitePairOrbit(
  start: string,
  pair: [number, number],
  actions: Map<number, Record<string, string>>,
): string[] {
  const seen = new Set([start]);
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const vertexId = queue[cursor];
    for (const generator of pair) {
      const target = actions.get(generator)?.[vertexId];
      if (target !== undefined && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return [...seen].sort((left, right) => left.localeCompare(right));
}

function prepareQuotient(quotient: QuotientComplex): PreparedQuotient {
  const errors: string[] = [];
  const quotientValidation = validateQuotientComplex(quotient);
  if (!quotientValidation.ok) {
    errors.push(
      ...quotientValidation.errors.map(
        (error) => `source quotient validation: ${error}`,
      ),
    );
  }
  if (quotient.sourceSystem === undefined) {
    errors.push(
      "sourceSystem is required to construct hat X and bar X from a quotient action.",
    );
  }
  const sourceSystem = quotient.sourceSystem;
  if (sourceSystem === undefined) {
    throw new CoverCompressionError("Cannot construct hat X", errors);
  }
  const systemValidation = validateCoxeterSystemInput(sourceSystem);
  if (!systemValidation.ok) {
    errors.push(
      ...systemValidation.errors.map((error) => `sourceSystem: ${error}`),
    );
  }

  const vertexIds = quotient.vertices
    .map((vertex) => vertex.id)
    .sort((left, right) => left.localeCompare(right));
  const vertexIdSet = new Set(vertexIds);
  if (vertexIds.length === 0) {
    errors.push("The quotient action must contain at least one vertex.");
  }

  if (quotient.permutationAction === undefined) {
    errors.push(
      "permutationAction is required; the hybrid QuotientComplex cells are not relabeled as a cover.",
    );
  }
  const actions = new Map<number, Record<string, string>>();
  for (const action of quotient.permutationAction ?? []) {
    if (actions.has(action.generator)) {
      errors.push(
        `permutationAction contains duplicate generator ${action.generator}.`,
      );
    }
    actions.set(action.generator, action.images);
  }

  for (let generator = 0; generator < sourceSystem.rank; generator += 1) {
    const images = actions.get(generator);
    if (images === undefined) {
      errors.push(`permutationAction is missing generator ${generator}.`);
      continue;
    }
    const imageCounts = new Map<string, number>();
    for (const vertexId of vertexIds) {
      const target = images[vertexId];
      if (typeof target !== "string" || !vertexIdSet.has(target)) {
        errors.push(
          `permutationAction generator ${generator} has no valid image for vertex "${vertexId}".`,
        );
        continue;
      }
      imageCounts.set(target, (imageCounts.get(target) ?? 0) + 1);
      if (target === vertexId) {
        errors.push(
          `permutationAction generator ${generator} fixes vertex "${vertexId}"; a torsion-free cover action must have no generator fixed points.`,
        );
      }
      if (images[target] !== vertexId) {
        errors.push(
          `permutationAction generator ${generator} is not involutive at vertex "${vertexId}".`,
        );
      }
    }
    for (const vertexId of vertexIds) {
      if ((imageCounts.get(vertexId) ?? 0) !== 1) {
        errors.push(
          `permutationAction generator ${generator} is not a permutation of the quotient vertices.`,
        );
        break;
      }
    }
  }

  const quotientEdgesBySourceGenerator = new Map<string, QuotientEdge[]>();
  for (const edge of quotient.edges) {
    const key = sourceGeneratorKey(edge.source, edge.generator);
    const bucket = quotientEdgesBySourceGenerator.get(key) ?? [];
    bucket.push(edge);
    quotientEdgesBySourceGenerator.set(key, bucket);
  }
  const quotientEdgeBySourceGenerator = new Map<string, QuotientEdge>();
  for (const vertexId of vertexIds) {
    for (let generator = 0; generator < sourceSystem.rank; generator += 1) {
      const key = sourceGeneratorKey(vertexId, generator);
      const matching = quotientEdgesBySourceGenerator.get(key) ?? [];
      if (matching.length === 0) {
        errors.push(
          `Missing directed quotient edge from vertex "${vertexId}" for generator ${generator}.`,
        );
        continue;
      }
      if (matching.length > 1) {
        errors.push(
          `Expected one directed quotient edge from vertex "${vertexId}" for generator ${generator}; found ${matching.length}.`,
        );
        continue;
      }
      const edge = matching[0];
      const expectedTarget = actions.get(generator)?.[vertexId];
      if (expectedTarget !== undefined && edge.target !== expectedTarget) {
        errors.push(
          `Directed quotient edge "${edge.id}" ends at "${edge.target}", but generator ${generator} sends "${vertexId}" to "${expectedTarget}".`,
        );
      }
      quotientEdgeBySourceGenerator.set(key, edge);
    }
  }

  const pairs = finitePairs(sourceSystem);
  for (const { pair, m } of pairs) {
    for (const vertexId of vertexIds) {
      const walk = alternatingEndpoint(vertexId, pair, m, actions);
      if (walk.endpoint !== vertexId) {
        errors.push(
          `Finite relation (s${pair[0]} s${pair[1]})^${m} does not close at vertex "${vertexId}" after ${2 * m} directed edges.`,
        );
      }
      const orbit = finitePairOrbit(vertexId, pair, actions);
      if (orbit.length !== 2 * m) {
        errors.push(
          `Finite-pair orbit for generators (${pair.join(", ")}) through "${vertexId}" has size ${orbit.length}; expected 2m=${2 * m}. The finite-pair action is not free.`,
        );
      }
      if (new Set(walk.visited).size !== 2 * m) {
        errors.push(
          `Alternating relation boundary for generators (${pair.join(", ")}) through "${vertexId}" repeats before length 2m; the finite-pair action is not free.`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new CoverCompressionError("Cannot construct hat X", [
      ...new Set(errors),
    ]);
  }

  const provenance = buildProvenance(quotient);
  const warnings = [
    ...(quotient.warnings ?? []),
    ...quotientValidation.warnings,
    ...provenance.limitations,
  ];
  return {
    quotient,
    sourceSystem,
    vertexIds,
    actions,
    quotientEdgeBySourceGenerator,
    finitePairs: pairs,
    provenance,
    warnings: [...new Set(warnings)],
  };
}

function hatVertexId(sourceQuotientVertexId: string): string {
  return `hat:v:${encodeId(sourceQuotientVertexId)}`;
}

function hatEdgeId(sourceQuotientVertexId: string, generator: number): string {
  return `hat:e:${encodeId(sourceQuotientVertexId)}:g${generator}`;
}

function hatRelationId(
  sourceQuotientVertexId: string,
  pair: [number, number],
): string {
  return `hat:r:g${pair[0]}-g${pair[1]}:${encodeId(sourceQuotientVertexId)}`;
}

/**
 * Rebuild the actual lifted presentation complex from a complete permutation
 * action. Existing quotient cells are treated only as source provenance.
 */
export function buildHatXFromQuotient(
  quotient: QuotientComplex,
): HatXCoverComplex {
  const prepared = prepareQuotient(quotient);
  const vertices = prepared.vertexIds.map((sourceVertexId) => {
    const source = quotient.vertices.find(
      (vertex) => vertex.id === sourceVertexId,
    );
    return {
      id: hatVertexId(sourceVertexId),
      sourceQuotientVertexId: sourceVertexId,
      label: source?.label,
      representativeWord: source?.representativeWord,
    };
  });

  const directedLiftEdges: HatXDirectedLiftEdge[] = [];
  for (const sourceVertexId of prepared.vertexIds) {
    for (
      let generator = 0;
      generator < prepared.sourceSystem.rank;
      generator += 1
    ) {
      const targetVertexId = prepared.actions.get(generator)![sourceVertexId];
      const sourceEdge = prepared.quotientEdgeBySourceGenerator.get(
        sourceGeneratorKey(sourceVertexId, generator),
      )!;
      directedLiftEdges.push({
        id: hatEdgeId(sourceVertexId, generator),
        sourceVertexId: hatVertexId(sourceVertexId),
        targetVertexId: hatVertexId(targetVertexId),
        generator,
        sourceQuotientEdgeId: sourceEdge.id,
      });
    }
  }
  const edgeBySourceGenerator = new Map(
    directedLiftEdges.map((edge) => [
      sourceGeneratorKey(edge.sourceVertexId, edge.generator),
      edge,
    ]),
  );

  const generatorBigonCells: HatXCoverComplex["generatorBigonCells"] = [];
  for (
    let generator = 0;
    generator < prepared.sourceSystem.rank;
    generator += 1
  ) {
    for (const sourceVertexId of prepared.vertexIds) {
      const targetVertexId = prepared.actions.get(generator)![sourceVertexId];
      const first = edgeBySourceGenerator.get(
        sourceGeneratorKey(hatVertexId(sourceVertexId), generator),
      )!;
      const second = edgeBySourceGenerator.get(
        sourceGeneratorKey(hatVertexId(targetVertexId), generator),
      )!;
      generatorBigonCells.push({
        id: `hat:b:g${generator}:${encodeId(sourceVertexId)}`,
        baseVertexId: hatVertexId(sourceVertexId),
        generator,
        boundaryOccurrences: [
          {
            edgeId: first.id,
            traversal: 1,
            boundaryIndex: 0,
            sourceVertexId: first.sourceVertexId,
            targetVertexId: first.targetVertexId,
            generator,
          },
          {
            edgeId: second.id,
            traversal: 1,
            boundaryIndex: 1,
            sourceVertexId: second.sourceVertexId,
            targetVertexId: second.targetVertexId,
            generator,
          },
        ],
      });
    }
  }

  const liftedRelationCells: HatXLiftedRelationCell[] = [];
  for (const { pair, m } of prepared.finitePairs) {
    for (const sourceVertexId of prepared.vertexIds) {
      let current = sourceVertexId;
      const boundaryOccurrences: BoundaryOccurrence[] = [];
      for (let boundaryIndex = 0; boundaryIndex < 2 * m; boundaryIndex += 1) {
        const generator = pair[boundaryIndex % 2];
        const target = prepared.actions.get(generator)![current];
        const edge = edgeBySourceGenerator.get(
          sourceGeneratorKey(hatVertexId(current), generator),
        )!;
        boundaryOccurrences.push({
          edgeId: edge.id,
          traversal: 1,
          boundaryIndex,
          sourceVertexId: hatVertexId(current),
          targetVertexId: hatVertexId(target),
          generator,
        });
        current = target;
      }
      liftedRelationCells.push({
        id: hatRelationId(sourceVertexId, pair),
        baseVertexId: hatVertexId(sourceVertexId),
        generatorPair: pair,
        m,
        boundaryOccurrences,
      });
    }
  }

  const hatX: HatXCoverComplex = {
    schemaVersion: 1,
    kind: "hat-x-cover",
    name: `hat X cover of ${prepared.sourceSystem.name}`,
    sourceSystem: prepared.sourceSystem,
    vertices,
    directedLiftEdges,
    generatorBigonCells: generatorBigonCells.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    liftedRelationCells,
    provenance: prepared.provenance,
    warnings: prepared.warnings,
  };
  const validation = validateHatX(hatX);
  if (!validation.ok) {
    throw new CoverCompressionError(
      "Constructed hat X failed validation",
      validation.errors,
    );
  }
  return hatX;
}

function barVertexId(sourceQuotientVertexId: string): string {
  return `bar:v:${encodeId(sourceQuotientVertexId)}`;
}

function canonicalSignedCycle(boundary: BoundaryOccurrence[]): string {
  const tokens = boundary.map(
    (occurrence) => `${occurrence.edgeId}:${occurrence.traversal}`,
  );
  const reversed = [...boundary]
    .reverse()
    .map(
      (occurrence) =>
        `${occurrence.edgeId}:${occurrence.traversal === 1 ? -1 : 1}`,
    );
  const candidates: string[] = [];
  for (const cycle of [tokens, reversed]) {
    for (let offset = 0; offset < cycle.length; offset += 1) {
      candidates.push(
        [...cycle.slice(offset), ...cycle.slice(0, offset)].join("|"),
      );
    }
  }
  return candidates.sort((left, right) => left.localeCompare(right))[0] ?? "";
}

function makeCertificate(
  hatX: HatXCoverComplex,
  barX: BarXCompressedComplex,
  compressionMap: CompressionMap,
): CompressionCertificate {
  const hatValidation = validateHatX(hatX);
  const barValidation = validateBarX(barX);
  const d = hatX.vertices.length;
  const r = hatX.sourceSystem.rank;
  const relationFibersHaveCardinalityTwoM = compressionMap.relationFibers.every(
    (fiber) => fiber.hatRelationCellIds.length === fiber.expectedCardinality,
  );
  const edgeFibersHaveCardinalityTwo = compressionMap.edgeFibers.every(
    (fiber) => fiber.hatDirectedEdgeIds.length === 2,
  );
  const bigonFibersHaveCardinalityTwo = compressionMap.bigonFibers.every(
    (fiber) => fiber.hatBigonCellIds.length === 2,
  );
  const everyHatCellHasOneImage =
    Object.keys(compressionMap.vertexImages).length === hatX.vertices.length &&
    Object.keys(compressionMap.directedEdgeImages).length ===
      hatX.directedLiftEdges.length &&
    Object.keys(compressionMap.generatorBigonImages).length ===
      hatX.generatorBigonCells.length &&
    Object.keys(compressionMap.liftedRelationCellImages).length ===
      hatX.liftedRelationCells.length;

  const barEdgeById = new Map(
    barX.geometricEdges.map((edge) => [edge.id, edge]),
  );
  const barRelationById = new Map(
    barX.relationCells.map((cell) => [cell.id, cell]),
  );
  let signedRelationBoundariesAgree = true;
  for (const cell of hatX.liftedRelationCells) {
    const imageId = compressionMap.liftedRelationCellImages[cell.id];
    const image = barRelationById.get(imageId);
    if (image === undefined) {
      signedRelationBoundariesAgree = false;
      continue;
    }
    const mapped = cell.boundaryOccurrences.flatMap((occurrence, index) => {
      const edgeId = compressionMap.directedEdgeImages[occurrence.edgeId];
      const edge = barEdgeById.get(edgeId);
      const sourceVertexId =
        compressionMap.vertexImages[occurrence.sourceVertexId];
      const targetVertexId =
        compressionMap.vertexImages[occurrence.targetVertexId];
      if (
        edge === undefined ||
        sourceVertexId === undefined ||
        targetVertexId === undefined
      ) {
        return [];
      }
      const traversal: 1 | -1 =
        edge.sourceVertexId === sourceVertexId &&
        edge.targetVertexId === targetVertexId
          ? 1
          : -1;
      return [
        {
          edgeId,
          traversal,
          boundaryIndex: index,
          sourceVertexId,
          targetVertexId,
          generator: occurrence.generator,
        } satisfies BoundaryOccurrence,
      ];
    });
    if (
      mapped.length !== cell.boundaryOccurrences.length ||
      canonicalSignedCycle(mapped) !==
        canonicalSignedCycle(image.boundaryOccurrences)
    ) {
      signedRelationBoundariesAgree = false;
    }
  }

  const pairCounts = finitePairs(hatX.sourceSystem).map(({ pair, m }) => {
    const actualHatRelationCells = hatX.liftedRelationCells.filter(
      (cell) => pairKey(cell.generatorPair) === pairKey(pair),
    ).length;
    const actualBarRelationCells = barX.relationCells.filter(
      (cell) => pairKey(cell.generatorPair) === pairKey(pair),
    ).length;
    const expectedBarRelationCells = d / (2 * m);
    return {
      generatorPair: pair,
      m,
      expectedHatRelationCells: d,
      actualHatRelationCells,
      expectedBarRelationCells,
      actualBarRelationCells,
      passed:
        actualHatRelationCells === d &&
        Number.isInteger(expectedBarRelationCells) &&
        actualBarRelationCells === expectedBarRelationCells,
    };
  });
  const counts = {
    vertices: {
      expected: d,
      actual: barX.vertices.length,
      passed: barX.vertices.length === d,
    },
    directedLiftEdges: {
      expected: d * r,
      actual: hatX.directedLiftEdges.length,
      passed: hatX.directedLiftEdges.length === d * r,
    },
    generatorBigonCells: {
      expected: d * r,
      actual: hatX.generatorBigonCells.length,
      passed: hatX.generatorBigonCells.length === d * r,
    },
    geometricEdges: {
      expected: (d * r) / 2,
      actual: barX.geometricEdges.length,
      passed: barX.geometricEdges.length === (d * r) / 2,
    },
  };
  const checks = {
    hatBoundaryClosure: hatValidation.ok,
    barBoundaryClosure: barValidation.ok,
    edgeFibersHaveCardinalityTwo,
    bigonFibersHaveCardinalityTwo,
    relationFibersHaveCardinalityTwoM,
    everyHatCellHasOneImage,
    signedRelationBoundariesAgree,
  };
  const errors = [...hatValidation.errors, ...barValidation.errors];
  if (!edgeFibersHaveCardinalityTwo) {
    errors.push("A compressed edge fiber does not contain two directed lifts.");
  }
  if (!bigonFibersHaveCardinalityTwo) {
    errors.push("A compressed bigon fiber does not contain two bigon cells.");
  }
  if (!relationFibersHaveCardinalityTwoM) {
    errors.push(
      "A compressed relation fiber does not contain 2m lifted cells.",
    );
  }
  if (!everyHatCellHasOneImage) {
    errors.push("Not every cell of hat X has exactly one compression image.");
  }
  if (!signedRelationBoundariesAgree) {
    errors.push(
      "A lifted relation boundary does not agree with its signed compressed boundary.",
    );
  }
  const passed =
    Object.values(counts).every((check) => check.passed) &&
    pairCounts.every((check) => check.passed) &&
    Object.values(checks).every(Boolean) &&
    errors.length === 0;
  return {
    status: passed ? "passed" : "failed",
    method: "in-repo-exact-cellular-compression",
    counts,
    pairCounts,
    checks,
    errors: [...new Set(errors)],
    warnings: [
      ...new Set([...hatValidation.warnings, ...barValidation.warnings]),
    ],
  };
}

/** Compress generator bigons and each 2m-family of parallel relation lifts. */
export function compressHatX(hatX: HatXCoverComplex): {
  barX: BarXCompressedComplex;
  compressionMap: CompressionMap;
  certificate: CompressionCertificate;
} {
  const hatValidation = validateHatX(hatX);
  if (!hatValidation.ok) {
    throw new CoverCompressionError(
      "Cannot compress invalid hat X",
      hatValidation.errors,
    );
  }

  const sortedHatVertices = [...hatX.vertices].sort((left, right) =>
    left.sourceQuotientVertexId.localeCompare(right.sourceQuotientVertexId),
  );
  const vertexImages: Record<string, string> = {};
  const vertices = sortedHatVertices.map((vertex) => {
    const id = barVertexId(vertex.sourceQuotientVertexId);
    vertexImages[vertex.id] = id;
    return {
      id,
      sourceHatVertexId: vertex.id,
      sourceQuotientVertexId: vertex.sourceQuotientVertexId,
      label: vertex.label,
    };
  });

  const directedEdgeImages: Record<string, string> = {};
  const generatorBigonImages: Record<string, string> = {};
  const geometricEdges: BarXGeometricEdge[] = [];
  const edgeFibers: CompressionMap["edgeFibers"] = [];
  const bigonFibers: CompressionMap["bigonFibers"] = [];
  const bigonsByGeneratorOrbit = new Map<
    string,
    HatXCoverComplex["generatorBigonCells"]
  >();
  for (const bigon of hatX.generatorBigonCells) {
    const first = bigon.boundaryOccurrences[0];
    const orbitVertices = [first.sourceVertexId, first.targetVertexId].sort(
      (left, right) => left.localeCompare(right),
    );
    const key = `${bigon.generator}\u0000${orbitVertices.join("\u0001")}`;
    const bucket = bigonsByGeneratorOrbit.get(key) ?? [];
    bucket.push(bigon);
    bigonsByGeneratorOrbit.set(key, bucket);
  }
  const sortedBigonOrbits = [...bigonsByGeneratorOrbit.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  );
  for (const [, orbitBigonsUnsorted] of sortedBigonOrbits) {
    const orbitBigons = [...orbitBigonsUnsorted].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    if (orbitBigons.length !== 2) {
      throw new CoverCompressionError("Cannot compress generator bigons", [
        `Generator ${orbitBigons[0]?.generator ?? "?"} orbit has ${orbitBigons.length} bigon lifts; expected 2.`,
      ]);
    }
    const bigon = orbitBigons[0];
    const boundary = bigon.boundaryOccurrences;
    const endpointIds = [
      vertexImages[boundary[0].sourceVertexId],
      vertexImages[boundary[0].targetVertexId],
    ].sort((left, right) => left.localeCompare(right)) as [string, string];
    const sourceNames = endpointIds.map(
      (id) =>
        vertices.find((vertex) => vertex.id === id)!.sourceQuotientVertexId,
    );
    const id = `bar:e:g${bigon.generator}:${encodeId(sourceNames[0])}:${encodeId(sourceNames[1])}`;
    const hatDirectedEdgeIds = [
      ...new Set(
        orbitBigons.flatMap((cell) =>
          cell.boundaryOccurrences.map((occurrence) => occurrence.edgeId),
        ),
      ),
    ].sort((left, right) => left.localeCompare(right)) as [string, string];
    if (hatDirectedEdgeIds.length !== 2) {
      throw new CoverCompressionError("Cannot compress generator bigons", [
        `Bigon orbit for generator ${bigon.generator} uses ${hatDirectedEdgeIds.length} directed lifts; expected 2.`,
      ]);
    }
    const hatBigonCellIds = orbitBigons.map((cell) => cell.id) as [
      string,
      string,
    ];
    geometricEdges.push({
      id,
      sourceVertexId: endpointIds[0],
      targetVertexId: endpointIds[1],
      generator: bigon.generator,
      sourceHatDirectedEdgeIds: hatDirectedEdgeIds,
      sourceHatBigonCellIds: hatBigonCellIds,
    });
    for (const edgeId of hatDirectedEdgeIds) {
      directedEdgeImages[edgeId] = id;
    }
    for (const bigonId of hatBigonCellIds) {
      generatorBigonImages[bigonId] = id;
    }
    edgeFibers.push({ barEdgeId: id, hatDirectedEdgeIds });
    bigonFibers.push({ barEdgeId: id, hatBigonCellIds });
  }
  geometricEdges.sort((left, right) => left.id.localeCompare(right.id));

  const hatEdgeBySourceGenerator = new Map(
    hatX.directedLiftEdges.map((edge) => [
      sourceGeneratorKey(edge.sourceVertexId, edge.generator),
      edge,
    ]),
  );
  const barEdgeById = new Map(geometricEdges.map((edge) => [edge.id, edge]));
  const relationByPairBase = new Map(
    hatX.liftedRelationCells.map((cell) => [
      `${pairKey(cell.generatorPair)}\u0000${cell.baseVertexId}`,
      cell,
    ]),
  );
  const actions = new Map<number, Map<string, string>>();
  for (const edge of hatX.directedLiftEdges) {
    const action = actions.get(edge.generator) ?? new Map<string, string>();
    action.set(edge.sourceVertexId, edge.targetVertexId);
    actions.set(edge.generator, action);
  }

  const liftedRelationCellImages: Record<string, string> = {};
  const relationCells: BarXCompressedComplex["relationCells"] = [];
  const relationFibers: CompressionMap["relationFibers"] = [];
  for (const { pair, m } of finitePairs(hatX.sourceSystem)) {
    const unvisited = new Set(sortedHatVertices.map((vertex) => vertex.id));
    while (unvisited.size > 0) {
      const start = [...unvisited].sort((left, right) =>
        left.localeCompare(right),
      )[0];
      const orbit = new Set([start]);
      const queue = [start];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const vertexId = queue[cursor];
        for (const generator of pair) {
          const target = actions.get(generator)!.get(vertexId)!;
          if (!orbit.has(target)) {
            orbit.add(target);
            queue.push(target);
          }
        }
      }
      for (const vertexId of orbit) {
        unvisited.delete(vertexId);
      }
      const canonicalBase = [...orbit].sort((left, right) =>
        left.localeCompare(right),
      )[0];
      const sourceQuotientVertexId = sortedHatVertices.find(
        (vertex) => vertex.id === canonicalBase,
      )!.sourceQuotientVertexId;
      const id = `bar:r:g${pair[0]}-g${pair[1]}:${encodeId(sourceQuotientVertexId)}`;
      let current = canonicalBase;
      const boundaryOccurrences: BoundaryOccurrence[] = [];
      for (let boundaryIndex = 0; boundaryIndex < 2 * m; boundaryIndex += 1) {
        const generator = pair[boundaryIndex % 2];
        const edge = hatEdgeBySourceGenerator.get(
          sourceGeneratorKey(current, generator),
        )!;
        const edgeId = directedEdgeImages[edge.id];
        const barEdge = barEdgeById.get(edgeId)!;
        const sourceVertexId = vertexImages[edge.sourceVertexId];
        const targetVertexId = vertexImages[edge.targetVertexId];
        const traversal: 1 | -1 =
          barEdge.sourceVertexId === sourceVertexId &&
          barEdge.targetVertexId === targetVertexId
            ? 1
            : -1;
        boundaryOccurrences.push({
          edgeId,
          traversal,
          boundaryIndex,
          sourceVertexId,
          targetVertexId,
          generator,
        });
        current = edge.targetVertexId;
      }
      const sourceHatRelationCellIds = [...orbit]
        .map(
          (vertexId) =>
            relationByPairBase.get(`${pairKey(pair)}\u0000${vertexId}`)!.id,
        )
        .sort((left, right) => left.localeCompare(right));
      relationCells.push({
        id,
        generatorPair: pair,
        m,
        boundaryOccurrences,
        sourceHatRelationCellIds,
      });
      for (const relationId of sourceHatRelationCellIds) {
        liftedRelationCellImages[relationId] = id;
      }
      relationFibers.push({
        barRelationCellId: id,
        generatorPair: pair,
        expectedCardinality: 2 * m,
        hatRelationCellIds: sourceHatRelationCellIds,
      });
    }
  }
  relationCells.sort((left, right) => left.id.localeCompare(right.id));
  relationFibers.sort((left, right) =>
    left.barRelationCellId.localeCompare(right.barRelationCellId),
  );

  const compressionMap: CompressionMap = {
    kind: "hat-x-to-bar-x",
    vertexImages,
    directedEdgeImages,
    generatorBigonImages,
    liftedRelationCellImages,
    edgeFibers,
    bigonFibers,
    relationFibers,
  };
  const barX: BarXCompressedComplex = {
    schemaVersion: 1,
    kind: "bar-x-compression",
    name: `bar X compression of ${hatX.sourceSystem.name}`,
    sourceSystem: hatX.sourceSystem,
    vertices,
    geometricEdges,
    relationCells,
    provenance: {
      ...hatX.provenance,
      compression: "generator-bigons-and-parallel-relation-lifts",
    },
    warnings: [...hatX.warnings],
  };
  const certificate = makeCertificate(hatX, barX, compressionMap);
  if (certificate.status !== "passed") {
    throw new CoverCompressionError(
      "Constructed bar X failed compression certification",
      certificate.errors,
    );
  }
  return { barX, compressionMap, certificate };
}

/** Build and certify both exact cell complexes in one deterministic pass. */
export function buildCoverCompression(
  quotient: QuotientComplex,
): CoverCompressionResult {
  const hatX = buildHatXFromQuotient(quotient);
  return { hatX, ...compressHatX(hatX) };
}
