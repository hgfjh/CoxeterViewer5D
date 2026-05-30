import type {
  CayleyNode,
  CoxeterSystemInput,
  HyperbolicProjection,
} from "../types";
import { validateOrSolveChamberBasepoint } from "./basepoint";
import { factorLorentzianNormalGram } from "./gramFactorization";
import {
  type Matrix,
  type Vector,
  identityMatrix,
  matMul,
  matVec,
} from "./linearAlgebra";
import {
  DEFAULT_GEOMETRY_TOLERANCE,
  lorentzDot,
  preservesLorentzForm,
  reflectionMatrixFromNormal,
} from "./lorentz";
import { pcaProject } from "./pca";
import { kleinProject, poincareProject } from "./projections";

export interface HyperbolicGeometryOptions {
  tolerance?: number;
  projection?: HyperbolicProjection;
  axes?: [number, number, number];
  displayScale?: number;
  pcaFitNodeIds?: Iterable<string>;
  pcaCenterNodeId?: string;
}

export interface HyperbolicReflectionData {
  normals: Vector[];
  basepoint: Vector;
  reflectionMatrices: Matrix[];
  warnings: string[];
}

export interface HyperbolicReflectionDataResult {
  ok: boolean;
  data?: HyperbolicReflectionData;
  warnings: string[];
}

export interface HyperbolicNodePlacement {
  nodeId: string;
  word: number[];
  hyperbolicPoint: Vector;
  modelPoint: Vector;
  position: [number, number, number];
}

export interface HyperbolicPlacementResult {
  ok: boolean;
  nodes: CayleyNode[];
  placements: HyperbolicNodePlacement[];
  reflectionMatrices: Matrix[];
  basepoint?: Vector;
  projection: HyperbolicProjection;
  warnings: string[];
}

const DEFAULT_PROJECTION: HyperbolicProjection = "poincare-axes";
const DEFAULT_AXES: [number, number, number] = [0, 1, 2];

/**
 * Builds Lorentz reflection data for a hyperboloid Coxeter input.
 *
 * Explicit normalCoordinates plus a basepoint are the strongest browser path.
 * If only normalGram is present, normals are factored numerically and the
 * resulting warnings must stay visible. Either way, this helper validates the
 * Lorentz form and chamber inequalities before geometric mode is enabled.
 */
export function buildHyperbolicReflectionData(
  system: CoxeterSystemInput,
  options: HyperbolicGeometryOptions = {},
): HyperbolicReflectionDataResult {
  const tolerance = options.tolerance ?? DEFAULT_GEOMETRY_TOLERANCE;
  const warnings: string[] = [];
  const geometry = system.geometry;

  if (geometry === undefined) {
    return {
      ok: false,
      warnings: ["Geometric mode requires a geometry block."],
    };
  }

  if (geometry.model !== "hyperboloid") {
    return {
      ok: false,
      warnings: ['Geometric mode currently supports only model "hyperboloid".'],
    };
  }

  const coordinateCount = geometry.dimension + 1;
  let rawNormals: Vector[] | undefined;

  if (geometry.normalCoordinates !== undefined) {
    rawNormals = geometry.normalCoordinates.map((normal) => [...normal]);
  } else if (geometry.normalGram !== undefined) {
    const factorization = factorLorentzianNormalGram(
      geometry.normalGram,
      geometry.dimension,
      Math.max(tolerance * 10, 1e-8),
    );
    warnings.push(...factorization.warnings);
    if (!factorization.ok) {
      return { ok: false, warnings };
    }
    rawNormals = factorization.normals;
  } else {
    return {
      ok: false,
      warnings: [
        "Geometric mode requires geometry.normalCoordinates or geometry.normalGram.",
      ],
    };
  }

  const shapeWarning = validateNormalShape(
    rawNormals,
    system.rank,
    coordinateCount,
  );
  if (shapeWarning !== undefined) {
    return { ok: false, warnings: [shapeWarning] };
  }

  const normals: Vector[] = [];
  for (let index = 0; index < rawNormals.length; index += 1) {
    const normal = [...rawNormals[index]];
    const norm = lorentzDot(normal, normal);

    if (norm <= tolerance) {
      return {
        ok: false,
        warnings: [
          `geometry.normalCoordinates[${index}] must be spacelike; Lorentz norm is ${formatNumber(norm)}.`,
        ],
      };
    }

    if (Math.abs(norm - 1) > tolerance) {
      warnings.push(
        `geometry.normalCoordinates[${index}] was normalized from Lorentz norm ${formatNumber(norm)}.`,
      );
      normals.push(normal.map((coordinate) => coordinate / Math.sqrt(norm)));
    } else {
      normals.push(normal);
    }
  }

  if (
    geometry.basepoint !== undefined &&
    geometry.basepoint.length !== coordinateCount
  ) {
    return {
      ok: false,
      warnings: [
        `geometry.basepoint must have ${coordinateCount} coordinates; got ${geometry.basepoint.length}.`,
      ],
    };
  }

  const basepointResult = validateOrSolveChamberBasepoint(
    normals,
    geometry.basepoint,
    Math.max(tolerance * 10, 1e-8),
  );
  warnings.push(...basepointResult.warnings);
  if (!basepointResult.ok || basepointResult.basepoint === undefined) {
    return { ok: false, warnings };
  }
  const orientedNormals = basepointResult.normals;
  const basepoint = basepointResult.basepoint;

  const reflectionMatrices: Matrix[] = [];
  for (let index = 0; index < orientedNormals.length; index += 1) {
    const reflection = reflectionMatrixFromNormal(orientedNormals[index]);
    if (!preservesLorentzForm(reflection, tolerance)) {
      return {
        ok: false,
        warnings: [
          `Reflection matrix for generator ${index} does not preserve the Lorentz form within tolerance ${tolerance}.`,
        ],
      };
    }
    reflectionMatrices.push(reflection);
  }

  return {
    ok: true,
    data: {
      normals: orientedNormals,
      basepoint,
      reflectionMatrices,
      warnings,
    },
    warnings,
  };
}

/**
 * Computes point(w) = rho(w) x0 using the same right-multiplication convention
 * as the Cayley-ball backend: rho(ws_i) = rho(w) R_i. Since matrices act on
 * column vectors, this builds the product first and applies it once at the end.
 */
export function hyperbolicPointForWord(
  word: number[],
  basepoint: Vector,
  reflectionMatrices: Matrix[],
): Vector {
  let wordMatrix = identityMatrix(basepoint.length);

  for (const generator of word) {
    if (
      !Number.isInteger(generator) ||
      generator < 0 ||
      generator >= reflectionMatrices.length
    ) {
      throw new Error(`Word contains invalid generator index ${generator}.`);
    }
    wordMatrix = matMul(wordMatrix, reflectionMatrices[generator]);
  }

  return matVec(wordMatrix, basepoint);
}

/**
 * Places Cayley nodes by applying the reflection representation to a basepoint.
 *
 * The hyperbolicPoint field is the full Lorentz-model point. The rendered
 * position is a 3D projection chosen for inspection, so callers should continue
 * to label it as projected geometry rather than an exact embedded model.
 */
export function placeCayleyNodesInHyperbolicGeometry(
  system: CoxeterSystemInput,
  nodes: CayleyNode[],
  options: HyperbolicGeometryOptions = {},
): HyperbolicPlacementResult {
  const projection = resolveProjection(system, options);
  const tolerance = options.tolerance ?? DEFAULT_GEOMETRY_TOLERANCE;
  const reflectionResult = buildHyperbolicReflectionData(system, options);

  if (!reflectionResult.ok || reflectionResult.data === undefined) {
    return {
      ok: false,
      nodes: nodes.map((node) => ({ ...node })),
      placements: [],
      reflectionMatrices: [],
      projection,
      warnings: reflectionResult.warnings,
    };
  }

  const { basepoint, reflectionMatrices } = reflectionResult.data;
  const warnings = [...reflectionResult.warnings];
  const hyperbolicPointsByNodeId = new Map<string, Vector>();
  const pointRows: Array<{ node: CayleyNode; hyperbolicPoint: Vector }> = [];

  for (const node of nodes) {
    try {
      const hyperbolicPoint = hyperbolicPointForWord(
        node.word,
        basepoint,
        reflectionMatrices,
      );
      validateHyperbolicPoint(node.id, hyperbolicPoint, tolerance, warnings);
      hyperbolicPointsByNodeId.set(node.id, hyperbolicPoint);
      pointRows.push({ node, hyperbolicPoint });
    } catch (error) {
      warnings.push(
        `Could not compute a hyperbolic point for node ${node.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const projected = projectPointRows(
    pointRows,
    projection,
    tolerance,
    warnings,
  );
  const positions = positionProjectedPoints(
    projected.modelPoints,
    projected.rows.map((row) => row.node.id),
    projection,
    options.axes ?? DEFAULT_AXES,
    options.displayScale ?? 1,
    options.pcaFitNodeIds ? new Set(options.pcaFitNodeIds) : undefined,
    options.pcaCenterNodeId,
    warnings,
  );
  const positionByNodeId = new Map<string, [number, number, number]>();
  const placements: HyperbolicNodePlacement[] = [];

  projected.rows.forEach((row, index) => {
    const position = positions[index];
    positionByNodeId.set(row.node.id, position);
    placements.push({
      nodeId: row.node.id,
      word: [...row.node.word],
      hyperbolicPoint: [...row.hyperbolicPoint],
      modelPoint: [...projected.modelPoints[index]],
      position,
    });
  });

  return {
    ok: placements.length === nodes.length,
    nodes: nodes.map((node) => ({
      ...node,
      hyperbolicPoint:
        hyperbolicPointsByNodeId.get(node.id) ?? node.hyperbolicPoint,
      position: positionByNodeId.get(node.id) ?? node.position,
    })),
    placements,
    reflectionMatrices,
    basepoint,
    projection,
    warnings,
  };
}

function validateNormalShape(
  normals: number[][],
  rank: number,
  coordinateCount: number,
): string | undefined {
  if (normals.length !== rank) {
    return `geometry.normalCoordinates must have ${rank} rows; got ${normals.length}.`;
  }

  for (let index = 0; index < normals.length; index += 1) {
    if (normals[index].length !== coordinateCount) {
      return `geometry.normalCoordinates[${index}] must have ${coordinateCount} coordinates; got ${normals[index].length}.`;
    }
  }

  return undefined;
}

function resolveProjection(
  system: CoxeterSystemInput,
  options: HyperbolicGeometryOptions,
): HyperbolicProjection {
  return (
    options.projection ?? system.geometry?.projection ?? DEFAULT_PROJECTION
  );
}

function projectPointRows(
  rows: Array<{ node: CayleyNode; hyperbolicPoint: Vector }>,
  projection: HyperbolicProjection,
  tolerance: number,
  warnings: string[],
): {
  rows: Array<{ node: CayleyNode; hyperbolicPoint: Vector }>;
  modelPoints: Vector[];
} {
  const projectedRows: Array<{ node: CayleyNode; hyperbolicPoint: Vector }> =
    [];
  const modelPoints: Vector[] = [];

  for (const row of rows) {
    try {
      const modelPoint = projection.startsWith("poincare")
        ? poincareProject(row.hyperbolicPoint)
        : kleinProject(row.hyperbolicPoint);
      const normSquared = euclideanNormSquared(modelPoint);

      if (normSquared >= 1 + tolerance) {
        warnings.push(
          `Projection of node ${row.node.id} is outside the unit ball by tolerance ${tolerance}.`,
        );
      }

      projectedRows.push(row);
      modelPoints.push(modelPoint);
    } catch (error) {
      warnings.push(
        `Could not project node ${row.node.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return { rows: projectedRows, modelPoints };
}

function positionProjectedPoints(
  modelPoints: Vector[],
  nodeIds: string[],
  projection: HyperbolicProjection,
  axes: [number, number, number],
  displayScale: number,
  pcaFitNodeIds: Set<string> | undefined,
  pcaCenterNodeId: string | undefined,
  warnings: string[],
): Array<[number, number, number]> {
  if (modelPoints.length === 0) {
    return [];
  }

  if (projection.endsWith("-pca")) {
    try {
      return positionPointsWithPcaBasis(
        modelPoints,
        nodeIds,
        displayScale,
        pcaFitNodeIds,
        pcaCenterNodeId,
        warnings,
      );
    } catch (error) {
      warnings.push(
        `PCA projection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return modelPoints.map((point) =>
        axesPosition(point, axes, displayScale),
      );
    }
  }

  return modelPoints.map((point) => axesPosition(point, axes, displayScale));
}

function positionPointsWithPcaBasis(
  modelPoints: Vector[],
  nodeIds: string[],
  displayScale: number,
  pcaFitNodeIds: Set<string> | undefined,
  pcaCenterNodeId: string | undefined,
  warnings: string[],
): Array<[number, number, number]> {
  let fitPoints = modelPoints;
  if (pcaFitNodeIds !== undefined) {
    fitPoints = modelPoints.filter((_, index) =>
      pcaFitNodeIds.has(nodeIds[index]),
    );
    if (fitPoints.length < 2) {
      warnings.push(
        "Local PCA projection had fewer than two fitting chambers; using all projected chambers instead.",
      );
      fitPoints = modelPoints;
    } else {
      warnings.push(
        `PCA projection is fitted to ${fitPoints.length} local chamber barycenters around ${pcaCenterNodeId ?? "the selected chamber"} for readability.`,
      );
    }
  }

  const pca = pcaProject(fitPoints, 3);
  const centerIndex =
    pcaCenterNodeId === undefined ? -1 : nodeIds.indexOf(pcaCenterNodeId);
  const origin = centerIndex >= 0 ? modelPoints[centerIndex] : pca.mean;

  return modelPoints.map((point) =>
    toPosition3(
      scalePosition(
        matVec(pca.components, subtractVectors(point, origin)),
        displayScale,
      ),
    ),
  );
}

function validateHyperbolicPoint(
  nodeId: string,
  point: Vector,
  tolerance: number,
  warnings: string[],
): void {
  const norm = lorentzDot(point, point);

  if (Math.abs(norm + 1) > tolerance) {
    warnings.push(
      `Hyperbolic point for node ${nodeId} has Lorentz norm ${formatNumber(norm)}, not -1 within tolerance ${tolerance}.`,
    );
  }

  if (point[0] <= 0) {
    warnings.push(
      `Hyperbolic point for node ${nodeId} is not on the upper sheet: x0=${formatNumber(point[0])}.`,
    );
  }
}

function axesPosition(
  point: Vector,
  axes: [number, number, number],
  displayScale: number,
): [number, number, number] {
  return toPosition3(
    scalePosition(
      axes.map((axis) => point[axis] ?? 0),
      displayScale,
    ),
  );
}

function scalePosition(point: Vector, scale: number): Vector {
  return point.map((coordinate) => coordinate * scale);
}

function subtractVectors(left: Vector, right: Vector): Vector {
  return left.map((coordinate, index) => coordinate - (right[index] ?? 0));
}

function toPosition3(point: Vector): [number, number, number] {
  return [
    cleanZero(point[0] ?? 0),
    cleanZero(point[1] ?? 0),
    cleanZero(point[2] ?? 0),
  ];
}

function euclideanNormSquared(point: Vector): number {
  return point.reduce(
    (total, coordinate) => total + coordinate * coordinate,
    0,
  );
}

function cleanZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toPrecision(6) : String(value);
}
