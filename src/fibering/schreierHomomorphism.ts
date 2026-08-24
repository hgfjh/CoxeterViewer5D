import type { CoverCompressionResult } from "../compression";
import type { QuotientComplex } from "../quotient";
import { computeBezoutIdentity } from "./wallHomomorphism";
import type {
  BezoutIdentity,
  WallHomomorphismFiniteCertificate,
} from "./types";
import {
  buildSchreierPresentationFromQuotient,
  type SchreierPresentation,
} from "./schreierPresentation";

export interface SchreierGeneratorHomomorphismValue {
  generatorId: string;
  subgroupWord: number[];
  rawWallValue: number;
  primitiveValue: number;
}

export interface SchreierRelatorHomomorphismCheck {
  relatorId: string;
  generatorWord: string[];
  rawValue: number;
  primitiveValue: number;
  passed: boolean;
}

export interface PrimitiveSchreierHomomorphismCertificate {
  schemaVersion: 1;
  kind: "primitive-schreier-homomorphism-certificate";
  method: "reidemeister-schreier-wall-period-normalization";
  status: "passed" | "failed";
  sourceGroup: string;
  subgroupName: string;
  subgroupIndex: number;
  target: "Z";
  presentation: SchreierPresentation;
  generatorValues: SchreierGeneratorHomomorphismValue[];
  relatorChecks: SchreierRelatorHomomorphismCheck[];
  rawImage: "0" | "Z" | `${number}Z` | "unavailable";
  normalizationDivisor: number | null;
  primitiveImage: boolean;
  bezoutIdentity?: BezoutIdentity;
  normalizedBezoutIdentity?: BezoutIdentity;
  checks: {
    everyGeneratorEvaluated: boolean;
    everySchreierLoopCloses: boolean;
    everyRelatorMapsToZero: boolean;
    periodGcdAgreesWithCellularCertificate: boolean;
    normalizedValuesIntegral: boolean;
    normalizedImageIsZ: boolean;
  };
  errors: string[];
  nonClaims: string[];
}

/**
 * Evaluate the wall cochain on deterministic Reidemeister--Schreier loops.
 * The normalized values define the primitive homomorphism H -> Z; the
 * unnormalized edge cochain remains the map used for the PL Morse directions.
 */
export function certifyPrimitiveSchreierHomomorphism(input: {
  quotient: QuotientComplex;
  cover: CoverCompressionResult;
  finiteWallCertificate: WallHomomorphismFiniteCertificate;
  presentation?: SchreierPresentation;
}): PrimitiveSchreierHomomorphismCertificate {
  const { quotient, cover, finiteWallCertificate } = input;
  const errors: string[] = [];
  let presentation: SchreierPresentation;
  try {
    presentation =
      input.presentation ?? buildSchreierPresentationFromQuotient(quotient);
  } catch (error) {
    presentation = emptyPresentation(quotient);
    errors.push(errorMessage(error));
  }

  const edgeValueById = new Map(
    finiteWallCertificate.cocycle.edgeValues.map((entry) => [
      entry.edgeId,
      entry.value,
    ]),
  );
  const evaluator = buildLiftedWordEvaluator(cover, edgeValueById);
  const rawGeneratorValues = new Map<string, number>();
  let everySchreierLoopCloses = true;
  for (const generator of presentation.generators) {
    const evaluation = evaluator(
      presentation.rootPointId,
      generator.provenance.rawSubgroupWord,
    );
    if (!evaluation.closed) {
      everySchreierLoopCloses = false;
      errors.push(
        `Schreier loop ${generator.id} ends at ${evaluation.endPointId}, not ${presentation.rootPointId}.`,
      );
    }
    if (evaluation.error) errors.push(evaluation.error);
    rawGeneratorValues.set(generator.id, evaluation.value);
  }

  const rawBezout = computeBezoutIdentity(
    presentation.generators.map((generator) => ({
      generatorId: generator.id,
      value: rawGeneratorValues.get(generator.id) ?? 0,
    })),
  );
  const divisor = rawBezout.gcd > 0 ? rawBezout.gcd : null;
  const normalizedValuesIntegral =
    divisor !== null &&
    [...rawGeneratorValues.values()].every(
      (value) => Number.isSafeInteger(value) && value % divisor === 0,
    );
  const normalizedById = new Map<string, number>();
  if (divisor !== null && normalizedValuesIntegral) {
    for (const [generatorId, value] of rawGeneratorValues) {
      normalizedById.set(generatorId, value / divisor);
    }
  }
  const normalizedBezout =
    divisor !== null && normalizedValuesIntegral
      ? computeBezoutIdentity(
          presentation.generators.map((generator) => ({
            generatorId: generator.id,
            value: normalizedById.get(generator.id) ?? 0,
          })),
        )
      : undefined;

  const generatorValues = presentation.generators.map((generator) => ({
    generatorId: generator.id,
    subgroupWord: [...generator.provenance.subgroupWord],
    rawWallValue: rawGeneratorValues.get(generator.id) ?? 0,
    primitiveValue: normalizedById.get(generator.id) ?? 0,
  }));
  const relatorChecks = presentation.relators.map((relator) => {
    const rawValue = evaluateSchreierWord(relator.word, rawGeneratorValues);
    const primitiveValue = evaluateSchreierWord(relator.word, normalizedById);
    return {
      relatorId: relator.id,
      generatorWord: relator.word.map(
        (letter) =>
          `${letter.generatorId}${letter.exponent === -1 ? "^-1" : ""}`,
      ),
      rawValue,
      primitiveValue,
      passed: rawValue === 0 && primitiveValue === 0,
    };
  });

  const everyGeneratorEvaluated =
    presentation.generators.length === rawGeneratorValues.size &&
    !errors.some((error) => error.includes("No lifted edge"));
  const everyRelatorMapsToZero = relatorChecks.every((check) => check.passed);
  const cellularDivisor =
    finiteWallCertificate.image.normalizationDivisor ??
    finiteWallCertificate.image.rawImageGenerator;
  const periodGcdAgreesWithCellularCertificate =
    divisor !== null && divisor === cellularDivisor;
  const normalizedImageIsZ =
    normalizedBezout?.gcd === 1 &&
    normalizedBezout.verified &&
    normalizedBezout.evaluatedSum === 1;

  if (!finiteWallCertificate.cocycle.closed) {
    errors.push("The wall edge assignment is not a closed cellular cocycle.");
  }
  if (!everyRelatorMapsToZero) {
    errors.push("At least one rewritten Schreier relator has nonzero image.");
  }
  if (!periodGcdAgreesWithCellularCertificate) {
    errors.push(
      `Schreier period gcd ${divisor ?? "unavailable"} disagrees with the cellular period gcd ${cellularDivisor ?? "unavailable"}.`,
    );
  }
  if (!normalizedImageIsZ) {
    errors.push(
      "No verified Bezout identity proves that the normalized image is Z.",
    );
  }

  const checks = {
    everyGeneratorEvaluated,
    everySchreierLoopCloses,
    everyRelatorMapsToZero,
    periodGcdAgreesWithCellularCertificate,
    normalizedValuesIntegral,
    normalizedImageIsZ,
  };
  const passed =
    finiteWallCertificate.cocycle.closed &&
    Object.values(checks).every(Boolean) &&
    errors.length === 0;

  return {
    schemaVersion: 1,
    kind: "primitive-schreier-homomorphism-certificate",
    method: "reidemeister-schreier-wall-period-normalization",
    status: passed ? "passed" : "failed",
    sourceGroup: cover.barX.sourceSystem.name,
    subgroupName: quotient.subgroup?.name ?? quotient.name,
    subgroupIndex: quotient.subgroup?.index ?? quotient.vertices.length,
    target: "Z",
    presentation,
    generatorValues,
    relatorChecks,
    rawImage: finiteWallCertificate.image.rawImageNotation,
    normalizationDivisor: divisor,
    primitiveImage: normalizedImageIsZ,
    ...(rawBezout.gcd > 0 ? { bezoutIdentity: rawBezout } : {}),
    ...(normalizedBezout === undefined
      ? {}
      : { normalizedBezoutIdentity: normalizedBezout }),
    checks,
    errors: [...new Set(errors)].sort(),
    nonClaims: [
      "Dividing loop periods does not divide the +/-1 edge directions used by the Morse map.",
      "Primitivity alone does not prove that the kernel is finitely generated.",
      "No geometric or manifold fibration is asserted.",
    ],
  };
}

function buildLiftedWordEvaluator(
  cover: CoverCompressionResult,
  edgeValueById: ReadonlyMap<string, number>,
): (
  startPointId: string,
  word: readonly number[],
) => { value: number; endPointId: string; closed: boolean; error?: string } {
  const hatVertexByQuotientId = new Map(
    cover.hatX.vertices.map((vertex) => [
      vertex.sourceQuotientVertexId,
      vertex,
    ]),
  );
  const hatVertexById = new Map(
    cover.hatX.vertices.map((vertex) => [vertex.id, vertex]),
  );
  const directedEdgeByStep = new Map(
    cover.hatX.directedLiftEdges.map((edge) => {
      const source = hatVertexById.get(edge.sourceVertexId);
      return [
        `${source?.sourceQuotientVertexId}\u0000${edge.generator}`,
        edge,
      ] as const;
    }),
  );
  const barEdgeById = new Map(
    cover.barX.geometricEdges.map((edge) => [edge.id, edge]),
  );

  return (startPointId, word) => {
    let currentPointId = startPointId;
    let value = 0;
    for (const generator of word) {
      const directed = directedEdgeByStep.get(
        `${currentPointId}\u0000${generator}`,
      );
      if (!directed) {
        return {
          value,
          endPointId: currentPointId,
          closed: false,
          error: `No lifted edge starts at ${currentPointId} with generator ${generator}.`,
        };
      }
      const barEdgeId = cover.compressionMap.directedEdgeImages[directed.id];
      const barEdge = barEdgeById.get(barEdgeId);
      const edgeValue = edgeValueById.get(barEdgeId);
      const currentHatVertex = hatVertexByQuotientId.get(currentPointId);
      const nextHatVertex = hatVertexById.get(directed.targetVertexId);
      if (
        !barEdge ||
        edgeValue === undefined ||
        !currentHatVertex ||
        !nextHatVertex
      ) {
        return {
          value,
          endPointId: currentPointId,
          closed: false,
          error: `Lift/compression provenance is incomplete for ${currentPointId} and generator ${generator}.`,
        };
      }
      const currentBarVertexId =
        cover.compressionMap.vertexImages[currentHatVertex.id];
      const nextBarVertexId =
        cover.compressionMap.vertexImages[nextHatVertex.id];
      const traversal =
        barEdge.sourceVertexId === currentBarVertexId &&
        barEdge.targetVertexId === nextBarVertexId
          ? 1
          : -1;
      value += traversal * edgeValue;
      currentPointId = nextHatVertex.sourceQuotientVertexId;
    }
    return {
      value,
      endPointId: currentPointId,
      closed: currentPointId === startPointId,
    };
  };
}

function evaluateSchreierWord(
  word: SchreierPresentation["relators"][number]["word"],
  values: ReadonlyMap<string, number>,
): number {
  return word.reduce(
    (sum, letter) =>
      sum + letter.exponent * (values.get(letter.generatorId) ?? 0),
    0,
  );
}

function emptyPresentation(quotient: QuotientComplex): SchreierPresentation {
  return {
    convention: "left-cosets-right-action",
    sourceSystemName: quotient.sourceSystem?.name ?? "unknown",
    actionName: quotient.name,
    rootPointId: quotient.vertices[0]?.id ?? "",
    pointCount: quotient.vertices.length,
    edgeOrbitCount: 0,
    graphRank: 0,
    transversal: [],
    spanningTreeEdges: [],
    generators: [],
    edgeAssignments: [],
    definingRelators: [],
    relatorRewrites: [],
    relators: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
