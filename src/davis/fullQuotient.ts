import { parseCoxeterSystemInput } from "../coxeter";
import {
  planSphericalSpecialSubgroups,
  torsionFreeActionFingerprint,
  type SphericalSubsetPlan,
  type TorsionFreeActionCandidate,
  type TorsionFreeActionCertificate,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";

/** A vertex of H\Sigma, identified with one point of the right H\W action. */
export interface FullDavisQuotientVertex {
  id: string;
  actionPoint: number;
  /** Vertex id in the supplied quotient action, when that action is available. */
  sourceQuotientVertexId?: string;
  label: string;
  representativeWord?: number[];
}

/**
 * One spherical cell type. The empty type records quotient vertices, while a
 * nonempty T records Coxeter cells indexed by H\W/W_T.
 */
export interface FullDavisQuotientSphericalType {
  id: string;
  generators: number[];
  generatorLabels: string[];
  rank: number;
  subgroupOrder: number;
  source: "empty-subset" | "torsion-free-certificate";
  cellIds: string[];
}

/** One exact Coxeter cell of H\Sigma. This type contains no drawing data. */
export interface FullDavisQuotientCell {
  id: string;
  dimension: number;
  sphericalSubsetId: string;
  generators: number[];
  representativePoint: number;
  actionPoints: number[];
  vertexIds: string[];
  facetCellIds: string[];
  properFaceCellIds: string[];
  cofacetCellIds: string[];
  properCofaceCellIds: string[];
  incidenceHash: string;
}

/** A strict order relation in the face poset. */
export interface FullDavisQuotientFaceIncidence {
  faceCellId: string;
  cofaceCellId: string;
  codimension: number;
  immediate: boolean;
}

export interface FullDavisQuotientCountCheck {
  sphericalSubsetId: string;
  generators: number[];
  subgroupOrder: number;
  actionIndex: number;
  expectedCellCount: number;
  actualCellCount: number;
  orbitSizes: number[];
  passed: boolean;
}

export interface FullDavisQuotientCertificate {
  status: "passed";
  method: "certified-right-action-davis-cell-poset";
  actionFingerprint: string;
  checks: {
    sourceCertificatePassed: true;
    sourceCertificateMatchesAction: true;
    actionShapeValid: true;
    actionTransitive: true;
    sphericalEnumerationComplete: true;
    sphericalActionsFree: true;
    hereditarySphericalTypes: true;
    orbitCountsMatch: true;
    faceIncidenceClosed: true;
  };
  countChecks: FullDavisQuotientCountCheck[];
  hashAlgorithm: "fnv1a64";
  posetHash: string;
  archiveHashAlgorithm: "sha256";
  archiveHash: string;
  warnings: string[];
}

/**
 * Complete finite cell poset of K = H\Sigma for a certified coset action.
 *
 * A T-cell is a W_T-orbit in H\W. Its U-faces are precisely the W_U-orbits
 * contained in that orbit, for spherical U properly contained in T.
 */
export interface FullDavisQuotientCellPoset {
  schemaVersion: 1;
  kind: "full-davis-quotient-cell-poset";
  systemName: string;
  actionCandidateId: string;
  actionIndex: number;
  actionFingerprint: string;
  dimension: number;
  vertices: FullDavisQuotientVertex[];
  sphericalTypes: FullDavisQuotientSphericalType[];
  cells: FullDavisQuotientCell[];
  faceIncidences: FullDavisQuotientFaceIncidence[];
  cellCountByDimension: Record<string, number>;
  posetHash: string;
  archiveHash: string;
  certificate: FullDavisQuotientCertificate;
  warnings: string[];
}

interface MutableCell extends Omit<FullDavisQuotientCell, "incidenceHash"> {
  incidenceHash?: string;
}

export class FullDavisQuotientError extends Error {
  readonly errors: string[];

  constructor(message: string, errors: string[]) {
    super(`${message}:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "FullDavisQuotientError";
    this.errors = errors;
  }
}

function compareNumberArrays(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    return left.length - right.length;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function subsetId(generators: number[]): string {
  return generators.length === 0 ? "T:empty" : `T:${generators.join(",")}`;
}

function subsetPointKey(id: string, point: number): string {
  return `${id}\u0000${point}`;
}

function cellId(generators: number[], representativePoint: number): string {
  if (generators.length === 0) {
    return `fdq:v:q${representativePoint}`;
  }
  return `fdq:cell:T${generators.join("-")}:q${representativePoint}`;
}

function stableValueString(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableValueString).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableValueString(record[key])}`)
    .join(",")}}`;
}

// This stable hash detects stale incidence artifacts; it is not a cryptographic
// certificate hash. External artifacts should additionally carry SHA-256.
function fnv1a64(value: unknown): string {
  const canonical = stableValueString(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function posetHashPayload(
  system: CoxeterSystemInput,
  actionFingerprint: string,
  sphericalTypes: readonly FullDavisQuotientSphericalType[],
  cells: readonly FullDavisQuotientCell[],
  faceIncidences: readonly FullDavisQuotientFaceIncidence[],
): unknown {
  return {
    system: {
      rank: system.rank,
      generators: system.generators.map((generator) => ({
        id: generator.id,
        label: generator.label,
      })),
      coxeterMatrix: system.coxeterMatrix,
    },
    actionFingerprint,
    sphericalTypes: sphericalTypes.map((type) => ({
      id: type.id,
      generators: type.generators,
      subgroupOrder: type.subgroupOrder,
      cellIds: type.cellIds,
    })),
    cells: cells.map((cell) => ({ id: cell.id, hash: cell.incidenceHash })),
    faceIncidences,
  };
}

function posetArchivePayload(
  system: CoxeterSystemInput,
  actionFingerprint: string,
  sphericalTypes: readonly FullDavisQuotientSphericalType[],
  cells: readonly FullDavisQuotientCell[],
  faceIncidences: readonly FullDavisQuotientFaceIncidence[],
): unknown {
  return {
    system: {
      schemaVersion: system.schemaVersion,
      name: system.name,
      rank: system.rank,
      generators: system.generators,
      coxeterMatrix: system.coxeterMatrix,
    },
    actionFingerprint,
    sphericalTypes,
    cells: cells.map((cell) => ({
      id: cell.id,
      dimension: cell.dimension,
      sphericalSubsetId: cell.sphericalSubsetId,
      generators: cell.generators,
      representativePoint: cell.representativePoint,
      actionPoints: cell.actionPoints,
      vertexIds: cell.vertexIds,
      facetCellIds: cell.facetCellIds,
      properFaceCellIds: cell.properFaceCellIds,
      cofacetCellIds: cell.cofacetCellIds,
      properCofaceCellIds: cell.properCofaceCellIds,
      incidenceHash: cell.incidenceHash,
    })),
    faceIncidences,
  };
}

/** Recompute the archival identity of a complete Davis quotient cell poset. */
export function computeFullDavisQuotientArchiveHash(
  system: CoxeterSystemInput,
  poset: Pick<
    FullDavisQuotientCellPoset,
    "actionFingerprint" | "sphericalTypes" | "cells" | "faceIncidences"
  >,
): string {
  return canonicalSha256(
    posetArchivePayload(
      system,
      poset.actionFingerprint,
      poset.sphericalTypes,
      poset.cells,
      poset.faceIncidences,
    ),
  );
}

function isSortedGeneratorSubset(generators: number[], rank: number): boolean {
  return generators.every(
    (generator, index) =>
      Number.isInteger(generator) &&
      generator >= 0 &&
      generator < rank &&
      (index === 0 || generators[index - 1] < generator),
  );
}

function isSubset(left: number[], right: number[]): boolean {
  let rightIndex = 0;
  for (const generator of left) {
    while (rightIndex < right.length && right[rightIndex] < generator) {
      rightIndex += 1;
    }
    if (right[rightIndex] !== generator) {
      return false;
    }
    rightIndex += 1;
  }
  return true;
}

function validatePermutationAction(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): string[] {
  const errors: string[] = [];
  if (!Number.isSafeInteger(candidate.index) || candidate.index < 1) {
    errors.push("The action index must be a positive safe integer.");
  }
  if (candidate.generatorImages.length !== system.rank) {
    errors.push(
      `The action has ${candidate.generatorImages.length} generator permutations; expected ${system.rank}.`,
    );
  }
  for (let generator = 0; generator < system.rank; generator += 1) {
    const permutation = candidate.generatorImages[generator];
    if (permutation?.length !== candidate.index) {
      errors.push(
        `Generator ${generator} has ${permutation?.length ?? 0} images; expected ${candidate.index}.`,
      );
      continue;
    }
    const imageSet = new Set(permutation);
    if (
      imageSet.size !== candidate.index ||
      permutation.some(
        (image) =>
          !Number.isInteger(image) || image < 0 || image >= candidate.index,
      )
    ) {
      errors.push(`Generator ${generator} is not a permutation of the points.`);
    }
  }
  return errors;
}

function restrictedOrbits(
  candidate: TorsionFreeActionCandidate,
  generators: number[],
): number[][] {
  if (generators.length === 0) {
    return Array.from({ length: candidate.index }, (_unused, point) => [point]);
  }

  const seen = new Uint8Array(candidate.index);
  const orbits: number[][] = [];
  for (let start = 0; start < candidate.index; start += 1) {
    if (seen[start] === 1) {
      continue;
    }
    const orbit = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < orbit.length; cursor += 1) {
      const point = orbit[cursor];
      for (const generator of generators) {
        const image = candidate.generatorImages[generator][point];
        if (seen[image] === 0) {
          seen[image] = 1;
          orbit.push(image);
        }
      }
    }
    orbit.sort((left, right) => left - right);
    orbits.push(orbit);
  }
  return orbits.sort((left, right) => left[0] - right[0]);
}

function validateCertifiedAction(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
  certificate: TorsionFreeActionCertificate,
): void {
  const errors = validatePermutationAction(system, candidate);
  const expectedFingerprint = torsionFreeActionFingerprint(system, candidate);

  if (certificate.status !== "passed") {
    errors.push(
      `The torsion-free action certificate has status ${certificate.status}; passed is required.`,
    );
  }
  if (
    certificate.candidateId !== candidate.id ||
    certificate.candidateIndex !== candidate.index
  ) {
    errors.push("The torsion-free certificate identifies a different action.");
  }
  if (certificate.actionFingerprint !== expectedFingerprint) {
    errors.push(
      "The torsion-free certificate fingerprint is stale or mismatched.",
    );
  }
  for (const [check, passed] of Object.entries(certificate.checks)) {
    if (!passed) {
      errors.push(`The source certificate check ${check} did not pass.`);
    }
  }

  const fullOrbit = restrictedOrbits(
    candidate,
    Array.from({ length: system.rank }, (_unused, index) => index),
  );
  if (fullOrbit.length !== 1 || fullOrbit[0].length !== candidate.index) {
    errors.push("The supplied right action is not transitive on H\\W.");
  }

  if (errors.length > 0) {
    throw new FullDavisQuotientError(
      "Cannot construct the full Davis quotient",
      errors,
    );
  }
}

function exactSafeOrder(decimal: string, subset: string): number {
  let value: bigint;
  try {
    value = BigInt(decimal);
  } catch {
    throw new FullDavisQuotientError("Invalid spherical subgroup order", [
      `${subset} has non-integer order ${JSON.stringify(decimal)}.`,
    ]);
  }
  if (value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FullDavisQuotientError("Invalid spherical subgroup order", [
      `${subset} has order ${decimal}, which is outside the safe action range.`,
    ]);
  }
  return Number(value);
}

function certifiedSphericalTypes(
  system: CoxeterSystemInput,
  certificate: TorsionFreeActionCertificate,
  plan: SphericalSubsetPlan,
): FullDavisQuotientSphericalType[] {
  const errors: string[] = [];
  const checkById = new Map(
    certificate.sphericalActions.map((check) => [
      subsetId(check.generators),
      check,
    ]),
  );
  if (checkById.size !== certificate.sphericalActions.length) {
    errors.push("The certificate repeats at least one spherical subset check.");
  }
  const byId = new Map<string, FullDavisQuotientSphericalType>();
  byId.set("T:empty", {
    id: "T:empty",
    generators: [],
    generatorLabels: [],
    rank: 0,
    subgroupOrder: 1,
    source: "empty-subset",
    cellIds: [],
  });

  for (const subgroup of plan.sphericalSubgroups) {
    const generators = [...subgroup.generators];
    const id = subgroup.id;
    const check = checkById.get(id);
    if (!isSortedGeneratorSubset(generators, system.rank)) {
      errors.push(`${id} is not a sorted subset of the source generators.`);
      continue;
    }
    if (check === undefined) {
      errors.push(`The certificate is missing spherical action check ${id}.`);
      continue;
    }
    if (compareNumberArrays(check.generators, generators) !== 0) {
      errors.push(`${id} uses inconsistent generator subsets.`);
    }
    if (!check.enumerationComplete || !check.faithful || !check.free) {
      errors.push(
        `${id} does not carry a complete faithful free action check.`,
      );
    }
    const subgroupOrder = exactSafeOrder(subgroup.order.decimal, id);
    if (check.expectedOrder.decimal !== subgroup.order.decimal) {
      errors.push(
        `${id} has certified order ${check.expectedOrder.decimal}; the exact spherical plan gives ${subgroup.order.decimal}.`,
      );
    }
    if (check.enumeratedImageElements !== subgroupOrder) {
      errors.push(
        `${id} enumerated ${check.enumeratedImageElements} image elements; expected ${subgroupOrder}.`,
      );
    }
    byId.set(id, {
      id,
      generators,
      generatorLabels: [...subgroup.generatorLabels],
      rank: subgroup.rank,
      subgroupOrder,
      source: "torsion-free-certificate",
      cellIds: [],
    });
  }

  const plannedIds = new Set(
    plan.sphericalSubgroups.map((subgroup) => subgroup.id),
  );
  for (const certificateId of checkById.keys()) {
    if (!plannedIds.has(certificateId)) {
      errors.push(
        `The certificate contains ${certificateId}, which is absent from the exact spherical plan.`,
      );
    }
  }

  const types = [...byId.values()].sort((left, right) =>
    compareNumberArrays(left.generators, right.generators),
  );
  for (const type of types.filter((entry) => entry.rank > 0)) {
    for (let removed = 0; removed < type.generators.length; removed += 1) {
      const faceGenerators = type.generators.filter(
        (_generator, index) => index !== removed,
      );
      const faceId = subsetId(faceGenerators);
      if (!byId.has(faceId)) {
        errors.push(
          `Spherical type ${type.id} is missing its hereditary face type ${faceId}.`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new FullDavisQuotientError(
      "The source certificate does not define a complete spherical type system",
      errors,
    );
  }
  return types;
}

function compareCells(left: MutableCell, right: MutableCell): number {
  return (
    left.dimension - right.dimension ||
    compareNumberArrays(left.generators, right.generators) ||
    left.representativePoint - right.representativePoint
  );
}

function countByDimension(
  cells: FullDavisQuotientCell[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cell of cells) {
    const key = String(cell.dimension);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Builds the complete Coxeter-cell poset of K = H\Sigma from a passed finite
 * right-action certificate. No geometric realization or PL subdivision is
 * inferred here; all returned incidences come directly from action orbits.
 */
export function buildFullDavisQuotientCellPoset(
  input: unknown,
  accepted: TorsionFreeCandidateResult,
  options: { sourceQuotientVertexIds?: readonly string[] } = {},
): FullDavisQuotientCellPoset {
  const system = parseCoxeterSystemInput(input);
  const { candidate, certificate: sourceCertificate } = accepted;
  validateCertifiedAction(system, candidate, sourceCertificate);

  const sphericalPlan = planSphericalSpecialSubgroups(system);
  if (sphericalPlan.status !== "complete") {
    throw new FullDavisQuotientError(
      "Cannot construct a complete Davis quotient from partial spherical data",
      sphericalPlan.warnings.length > 0
        ? sphericalPlan.warnings
        : ["Exact spherical-subset planning was incomplete."],
    );
  }

  const actionFingerprint = torsionFreeActionFingerprint(system, candidate);
  const sphericalTypes = certifiedSphericalTypes(
    system,
    sourceCertificate,
    sphericalPlan,
  );
  const mutableCells: MutableCell[] = [];
  const cellBySubsetPoint = new Map<string, string>();
  const countChecks: FullDavisQuotientCountCheck[] = [];
  const constructionErrors: string[] = [];

  for (const type of sphericalTypes) {
    const orbits = restrictedOrbits(candidate, type.generators);
    const expectedCellCount = candidate.index / type.subgroupOrder;
    const orbitSizes = orbits.map((orbit) => orbit.length);
    const passed =
      Number.isInteger(expectedCellCount) &&
      orbits.length === expectedCellCount &&
      orbitSizes.every((size) => size === type.subgroupOrder);
    countChecks.push({
      sphericalSubsetId: type.id,
      generators: [...type.generators],
      subgroupOrder: type.subgroupOrder,
      actionIndex: candidate.index,
      expectedCellCount,
      actualCellCount: orbits.length,
      orbitSizes,
      passed,
    });
    if (!passed) {
      constructionErrors.push(
        `${type.id} has ${orbits.length} cells with orbit sizes [${orbitSizes.join(", ")}]; expected ${expectedCellCount} cells of size ${type.subgroupOrder}.`,
      );
    }

    for (const orbit of orbits) {
      const representativePoint = orbit[0];
      const id = cellId(type.generators, representativePoint);
      const vertexIds = orbit.map((point) => cellId([], point));
      mutableCells.push({
        id,
        dimension: type.rank,
        sphericalSubsetId: type.id,
        generators: [...type.generators],
        representativePoint,
        actionPoints: [...orbit],
        vertexIds,
        facetCellIds: [],
        properFaceCellIds: [],
        cofacetCellIds: [],
        properCofaceCellIds: [],
      });
      type.cellIds.push(id);
      for (const point of orbit) {
        cellBySubsetPoint.set(subsetPointKey(type.id, point), id);
      }
    }
  }

  if (constructionErrors.length > 0) {
    throw new FullDavisQuotientError(
      "The certified action failed Davis cell-orbit checks",
      constructionErrors,
    );
  }

  mutableCells.sort(compareCells);
  const cellById = new Map(mutableCells.map((cell) => [cell.id, cell]));
  const cellOrder = new Map(
    mutableCells.map((cell, index) => [cell.id, index]),
  );
  const sortCellIds = (ids: Iterable<string>): string[] =>
    [...new Set(ids)].sort(
      (left, right) =>
        (cellOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (cellOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
    );

  const faceIncidences: FullDavisQuotientFaceIncidence[] = [];
  for (const cell of mutableCells.filter((entry) => entry.dimension > 0)) {
    const lowerTypes = sphericalTypes.filter(
      (type) =>
        type.rank < cell.dimension &&
        isSubset(type.generators, cell.generators),
    );
    const properFaces = new Set<string>();
    const facets = new Set<string>();
    for (const lowerType of lowerTypes) {
      for (const point of cell.actionPoints) {
        const faceId = cellBySubsetPoint.get(
          subsetPointKey(lowerType.id, point),
        );
        if (faceId === undefined) {
          constructionErrors.push(
            `Cell ${cell.id} cannot find its ${lowerType.id} face through q${point}.`,
          );
          continue;
        }
        properFaces.add(faceId);
        if (lowerType.rank === cell.dimension - 1) {
          facets.add(faceId);
        }
      }
    }
    cell.properFaceCellIds = sortCellIds(properFaces);
    cell.facetCellIds = sortCellIds(facets);
    for (const faceId of cell.properFaceCellIds) {
      const face = cellById.get(faceId);
      if (face === undefined) {
        constructionErrors.push(`Face ${faceId} of ${cell.id} is missing.`);
        continue;
      }
      const codimension = cell.dimension - face.dimension;
      face.properCofaceCellIds.push(cell.id);
      if (codimension === 1) {
        face.cofacetCellIds.push(cell.id);
      }
      faceIncidences.push({
        faceCellId: faceId,
        cofaceCellId: cell.id,
        codimension,
        immediate: codimension === 1,
      });
    }
  }

  if (constructionErrors.length > 0) {
    throw new FullDavisQuotientError(
      "The Davis face incidence is not closed",
      constructionErrors,
    );
  }

  for (const cell of mutableCells) {
    cell.cofacetCellIds = sortCellIds(cell.cofacetCellIds);
    cell.properCofaceCellIds = sortCellIds(cell.properCofaceCellIds);
    cell.incidenceHash = fnv1a64({
      id: cell.id,
      dimension: cell.dimension,
      sphericalSubsetId: cell.sphericalSubsetId,
      actionPoints: cell.actionPoints,
      vertexIds: cell.vertexIds,
      facetCellIds: cell.facetCellIds,
      properFaceCellIds: cell.properFaceCellIds,
      cofacetCellIds: cell.cofacetCellIds,
      properCofaceCellIds: cell.properCofaceCellIds,
    });
  }

  const cells = mutableCells as FullDavisQuotientCell[];
  const vertices: FullDavisQuotientVertex[] = Array.from(
    { length: candidate.index },
    (_unused, point) => {
      const sourceQuotientVertexId = options.sourceQuotientVertexIds?.[point];
      return {
        id: cellId([], point),
        actionPoint: point,
        ...(sourceQuotientVertexId ? { sourceQuotientVertexId } : {}),
        label:
          candidate.pointLabels?.[point] ??
          sourceQuotientVertexId ??
          `q${point}`,
        representativeWord: candidate.representativeWords?.[point],
      };
    },
  );
  const dimension = sphericalTypes.at(-1)?.rank ?? 0;
  const hashPayload = posetHashPayload(
    system,
    actionFingerprint,
    sphericalTypes,
    cells,
    faceIncidences,
  );
  const posetHash = fnv1a64(hashPayload);
  const archiveHash = canonicalSha256(
    posetArchivePayload(
      system,
      actionFingerprint,
      sphericalTypes,
      cells,
      faceIncidences,
    ),
  );
  const warnings = [
    ...new Set([...sphericalPlan.warnings, ...sourceCertificate.warnings]),
  ].sort();
  const certificate: FullDavisQuotientCertificate = {
    status: "passed",
    method: "certified-right-action-davis-cell-poset",
    actionFingerprint,
    checks: {
      sourceCertificatePassed: true,
      sourceCertificateMatchesAction: true,
      actionShapeValid: true,
      actionTransitive: true,
      sphericalEnumerationComplete: true,
      sphericalActionsFree: true,
      hereditarySphericalTypes: true,
      orbitCountsMatch: true,
      faceIncidenceClosed: true,
    },
    countChecks,
    hashAlgorithm: "fnv1a64",
    posetHash,
    archiveHashAlgorithm: "sha256",
    archiveHash,
    warnings,
  };

  return {
    schemaVersion: 1,
    kind: "full-davis-quotient-cell-poset",
    systemName: system.name,
    actionCandidateId: candidate.id,
    actionIndex: candidate.index,
    actionFingerprint,
    dimension,
    vertices,
    sphericalTypes,
    cells,
    faceIncidences,
    cellCountByDimension: countByDimension(cells),
    posetHash,
    archiveHash,
    certificate,
    warnings,
  };
}
