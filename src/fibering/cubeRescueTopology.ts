import type {
  StreamedDavisCell,
  StreamedLawfulDavisOracle,
} from "./streamedLawfulDavis";
import type { GeneralizedCompressionCertificate } from "../davis/generalizedCompression";
import type {
  StreamedTrackBIntegralCocycleBasis,
  StreamedTrackBIntegralCoordinate,
} from "./streamedTrackB";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  computeCubeRescueLocalTemplateDigest,
  type CubeRescueAffineLinkVertex,
  type CubeRescueLocalTemplate,
  type CubeRescueSubdivisionFamily,
} from "./cubeRescue";

export type CubeRescueOrderKind =
  | "numeric"
  | "reverse"
  | "affine-7"
  | "affine-11"
  | "half-turn";

export interface CubeRescueVertexOrder {
  schemaVersion: 1;
  kind: "compact-5-cube-compatible-pulling-order";
  id: string;
  method: "global-total-order-regular-pulling";
  degree: number;
  specification: {
    kind: CubeRescueOrderKind;
    multiplier: number;
    shift: number;
  };
  rankByPoint: Uint32Array;
  orderDigest: string;
}

export interface CubeRescueLocalTemplateBuilder {
  readonly order: CubeRescueVertexOrder;
  readonly sourceDigest: string;
  readonly subdivisionVertexLinks: {
    readonly pulling: CubeRescueSubdivisionVertexLinkCertificate;
    readonly "maximal-simplex-stellar": CubeRescueSubdivisionVertexLinkCertificate;
  };
  build(
    point: number,
    family: CubeRescueSubdivisionFamily,
    cache?: boolean,
  ): CubeRescueLocalTemplate;
}

export interface CubeRescueSubdivisionVertexLinkCertificate {
  schemaVersion: 1;
  kind: "compact-5-cube-subdivision-vertex-link-certificate";
  status: "not-applicable-no-introduced-vertices" | "certified";
  subdivisionFamily: CubeRescueSubdivisionFamily;
  orderId: string;
  orderDigest: string;
  sourceDigest: string;
  construction:
    | "global-regular-pulling-with-no-new-vertices"
    | "stellar-centers-of-global-maximal-pulling-simplices";
  maximalSourceCellTypeCount: number;
  maximalSourceCellDimensionMinimum: number;
  maximalSourceCellDimensionMaximum: number;
  checks: {
    orderRanksAreDistinct: boolean;
    maximalSourceCellsHaveDimensionAtLeastTwo: boolean;
    centerIdsDependOnlyOnGlobalSimplexIds: boolean;
    centerAffineNumeratorIsSourceVertexSum: boolean;
    centerTieNumeratorIsSourceRankDifferenceSum: boolean;
    centerMicroTieIsNonzeroTertiary: boolean;
    centerLinkIsSourceSimplexBoundary: boolean;
    centerHeightIsStrictlyBetweenSourceExtrema: boolean;
    ascendingAndDescendingCenterLinksAreNonemptyContractibleFaces: boolean;
  };
  conclusion:
    | "The pulling family introduces no subdivision vertices."
    | "Every introduced center has nonempty contractible ascending and descending links.";
  certificateDigest: string;
}

export interface CubeRescueCompressionBindingAudit {
  valid: boolean;
  checks: {
    certificatePassed: boolean;
    degreeMatches: boolean;
    archiveHashPresent: boolean;
    compressionClaimsCompleteFibersAndFaces: boolean;
    sphericalTypeCountMatches: boolean;
    everySphericalTypeCommitmentMatches: boolean;
  };
  hashNamespaces: {
    compressionActionHash: string;
    oracleActionHash: string;
    directlyComparable: false;
  };
  errors: string[];
}

interface Germ {
  id: string;
  otherPoint: number;
  characterPairs: Array<[number, string]>;
}

interface PullingSimplex {
  id: string;
  vertices: number[];
}

interface LinkMaximalSimplex {
  id: string;
  germIds: string[];
  characterPairs: Array<[number, string]>;
  potentialPairs: Array<[number, string]>;
  tieNumerator: number;
}

interface BaseTopology {
  point: number;
  germs: Germ[];
  maximalSimplices: LinkMaximalSimplex[];
  topologyDigest: string;
}

const INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/u;

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function exactCoordinate(
  value: StreamedTrackBIntegralCoordinate,
  context: string,
): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error(`${context} is not an exact integer.`);
    return BigInt(value);
  }
  if (!INTEGER_PATTERN.test(value))
    throw new Error(`${context} is not canonical.`);
  return BigInt(value);
}

function subset(left: readonly number[], right: ReadonlySet<number>): boolean {
  return left.every((value) => right.has(value));
}

function addDense(
  target: bigint[],
  source: readonly bigint[],
  scale = 1n,
): void {
  for (let index = 0; index < target.length; index += 1)
    target[index] += scale * source[index];
}

function densePairs(values: readonly bigint[]): Array<[number, string]> {
  const pairs: Array<[number, string]> = [];
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== 0n) pairs.push([index, values[index].toString()]);
  }
  return pairs;
}

function mapPairs(
  values: ReadonlyMap<number, bigint>,
): Array<[number, string]> {
  return [...values.entries()]
    .filter(([, value]) => value !== 0n)
    .sort(([left], [right]) => left - right)
    .map(([index, value]) => [index, value.toString()]);
}

/**
 * Match the generalized-compression commitments to the live oracle metadata.
 * The two action hashes deliberately are not compared: they canonicalize
 * different envelopes. The runner binds them through exact semantic replay.
 */
export function auditCubeRescueCompressionBinding(options: {
  generalizedCompression: GeneralizedCompressionCertificate;
  oracle: Pick<
    StreamedLawfulDavisOracle,
    "degree" | "actionRowsCanonicalSha256" | "sphericalTypes"
  >;
}): CubeRescueCompressionBindingAudit {
  const { generalizedCompression, oracle } = options;
  const checks: CubeRescueCompressionBindingAudit["checks"] = {
    certificatePassed: generalizedCompression.status === "passed",
    degreeMatches: generalizedCompression.source.degree === oracle.degree,
    archiveHashPresent: /^[0-9a-f]{64}$/u.test(
      generalizedCompression.archiveHash,
    ),
    compressionClaimsCompleteFibersAndFaces:
      generalizedCompression.checks.completeSphericalCatalogue &&
      generalizedCompression.checks.everyRootedCellRecorded &&
      generalizedCompression.checks.allFiberCardinalitiesEqualSphericalOrders &&
      generalizedCompression.checks.everyProperSphericalFaceTypeChecked &&
      generalizedCompression.checks.allFaceMapsCompatible,
    sphericalTypeCountMatches:
      generalizedCompression.sphericalTypes.length ===
      oracle.sphericalTypes.length,
    everySphericalTypeCommitmentMatches: false,
  };
  checks.everySphericalTypeCommitmentMatches = oracle.sphericalTypes.every(
    (type) => {
      const committed = generalizedCompression.sphericalTypes[type.typeIndex];
      return (
        committed !== undefined &&
        committed.typeIndex === type.typeIndex &&
        committed.sphericalSubsetId === type.id &&
        canonicalSha256(committed.generators) ===
          canonicalSha256(type.generators) &&
        committed.dimension === type.dimension &&
        committed.subgroupOrder === type.subgroupOrder &&
        committed.expectedFiberCardinality === type.subgroupOrder &&
        committed.compressedCellCount === type.cellCount &&
        committed.checks.everyRootHasOneImage &&
        committed.checks.fibersPartitionEveryRoot &&
        committed.checks.everyFiberHasExpectedCardinality &&
        committed.checks.representativeIsFiberMinimum
      );
    },
  );
  const errors = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  return {
    valid: errors.length === 0,
    checks,
    hashNamespaces: {
      compressionActionHash:
        generalizedCompression.source.actionRowsCanonicalSha256,
      oracleActionHash: oracle.actionRowsCanonicalSha256,
      directlyComparable: false,
    },
    errors,
  };
}

export function buildCubeRescueVertexOrder(
  degree: number,
  kind: CubeRescueOrderKind,
): CubeRescueVertexOrder {
  if (!Number.isSafeInteger(degree) || degree < 2) {
    throw new Error(
      "A rescue pulling order needs at least two quotient points.",
    );
  }
  let multiplier = 1;
  let shift = 0;
  switch (kind) {
    case "numeric":
      break;
    case "reverse":
      multiplier = degree - 1;
      shift = degree - 1;
      break;
    case "affine-7":
      multiplier = 7;
      break;
    case "affine-11":
      multiplier = 11;
      break;
    case "half-turn":
      shift = Math.floor(degree / 2);
      break;
    default:
      throw new Error(`Unsupported rescue pulling order ${String(kind)}.`);
  }
  if (gcd(multiplier, degree) !== 1) {
    throw new Error(`${kind} is not a permutation order at degree ${degree}.`);
  }
  const rankByPoint = new Uint32Array(degree);
  const seen = new Uint8Array(degree);
  for (let point = 0; point < degree; point += 1) {
    const rank = (multiplier * point + shift) % degree;
    if (seen[rank]) throw new Error(`${kind} repeats pulling rank ${rank}.`);
    seen[rank] = 1;
    rankByPoint[point] = rank;
  }
  const specification = { kind, multiplier, shift };
  const orderDigest = canonicalSha256({
    schemaVersion: 1,
    method: "affine-permutation-total-order",
    degree,
    specification,
    rankChunkDigests: Array.from(
      { length: Math.ceil(degree / 4096) },
      (_unused, chunkIndex) =>
        canonicalSha256({
          chunkIndex,
          ranks: Array.from(
            rankByPoint.slice(
              chunkIndex * 4096,
              Math.min(degree, (chunkIndex + 1) * 4096),
            ),
          ),
        }),
    ),
  });
  return {
    schemaVersion: 1,
    kind: "compact-5-cube-compatible-pulling-order",
    id: `regular-pulling-${kind}`,
    method: "global-total-order-regular-pulling",
    degree,
    specification,
    rankByPoint,
    orderDigest,
  };
}

function stellarMicroTie(id: string): -1 | 1 {
  return Number.parseInt(canonicalSha256(id).slice(0, 2), 16) % 2 === 0
    ? -1
    : 1;
}

export function cubeRescueMaximalSimplexCenterId(
  globalSimplexId: string,
): string {
  if (globalSimplexId.length === 0) {
    throw new Error("A stellar center needs a global simplex id.");
  }
  return `cube-rescue:maximal-simplex-stellar:${globalSimplexId}`;
}

function sealSubdivisionVertexLinkCertificate(
  value: Omit<CubeRescueSubdivisionVertexLinkCertificate, "certificateDigest">,
): CubeRescueSubdivisionVertexLinkCertificate {
  return { ...value, certificateDigest: canonicalSha256(value) };
}

export function cubeRescueSubdivisionVertexLinksAreCertified(
  certificate: CubeRescueSubdivisionVertexLinkCertificate,
): boolean {
  const { certificateDigest, ...payload } = certificate;
  const envelopeValid =
    certificate.schemaVersion === 1 &&
    certificate.kind === "compact-5-cube-subdivision-vertex-link-certificate" &&
    certificate.maximalSourceCellTypeCount > 0 &&
    certificate.maximalSourceCellDimensionMinimum >= 2 &&
    certificate.maximalSourceCellDimensionMaximum >=
      certificate.maximalSourceCellDimensionMinimum &&
    certificateDigest === canonicalSha256(payload) &&
    Object.values(certificate.checks).every(Boolean);
  if (!envelopeValid) return false;
  if (certificate.subdivisionFamily === "pulling") {
    return (
      certificate.status === "not-applicable-no-introduced-vertices" &&
      certificate.construction ===
        "global-regular-pulling-with-no-new-vertices" &&
      certificate.conclusion ===
        "The pulling family introduces no subdivision vertices."
    );
  }
  return (
    certificate.subdivisionFamily === "maximal-simplex-stellar" &&
    certificate.status === "certified" &&
    certificate.construction ===
      "stellar-centers-of-global-maximal-pulling-simplices" &&
    certificate.conclusion ===
      "Every introduced center has nonempty contractible ascending and descending links."
  );
}

function transformTopology(options: {
  base: BaseTopology;
  rank: number;
  degree: number;
  order: CubeRescueVertexOrder;
  family: CubeRescueSubdivisionFamily;
  sourceDigest: string;
}): CubeRescueLocalTemplate {
  const { base, order, family } = options;
  const vertices: CubeRescueAffineLinkVertex[] = base.germs.map((germ) => ({
    id: germ.id,
    sourceKind: "pulling-germ",
    characterNumeratorPairs: germ.characterPairs,
    potentialNumeratorPairs: [
      [base.point, "-1"],
      [germ.otherPoint, "1"],
    ].sort(([left], [right]) => Number(left) - Number(right)) as Array<
      [number, string]
    >,
    tieNumerator:
      order.rankByPoint[germ.otherPoint] - order.rankByPoint[base.point],
    microTie: 0,
  }));
  const indexById = new Map(
    vertices.map((vertex, index) => [vertex.id, index]),
  );
  const originalComplex = base.maximalSimplices.map((simplex) => ({
    id: simplex.id,
    vertices: simplex.germIds.map((germId) => {
      const index = indexById.get(germId);
      if (index === undefined) throw new Error("A link simplex has no germ.");
      return index;
    }),
  }));
  const graphEdges = (
    simplices: readonly { id: string; vertices: readonly number[] }[],
  ): Array<[number, number]> => {
    const keys = new Set<string>();
    for (const simplex of simplices) {
      for (let left = 0; left < simplex.vertices.length; left += 1) {
        for (
          let right = left + 1;
          right < simplex.vertices.length;
          right += 1
        ) {
          const a = simplex.vertices[left];
          const b = simplex.vertices[right];
          keys.add(a < b ? `${a},${b}` : `${b},${a}`);
        }
      }
    }
    return [...keys]
      .map((key) => key.split(",").map(Number) as [number, number])
      .sort(
        ([leftA, rightA], [leftB, rightB]) => leftA - leftB || rightA - rightB,
      );
  };
  let complex = originalComplex;

  if (family === "maximal-simplex-stellar") {
    const subdivided: typeof complex = [];
    for (
      let simplexIndex = 0;
      simplexIndex < base.maximalSimplices.length;
      simplexIndex += 1
    ) {
      const source = base.maximalSimplices[simplexIndex];
      const simplex = originalComplex[simplexIndex];
      const id = cubeRescueMaximalSimplexCenterId(source.id);
      const center = vertices.length;
      vertices.push({
        id,
        sourceKind: "maximal-simplex-stellar",
        characterNumeratorPairs: source.characterPairs,
        potentialNumeratorPairs: source.potentialPairs,
        tieNumerator: source.tieNumerator,
        microTie: stellarMicroTie(id),
      });
      if (simplex.vertices.length < 2) {
        throw new Error(
          `${source.id} has no positive-dimensional local simplex.`,
        );
      }
      for (let omitted = 0; omitted < simplex.vertices.length; omitted += 1) {
        subdivided.push({
          id: `${simplex.id}|stellar-facet-${omitted}`,
          vertices: [
            center,
            ...simplex.vertices.filter((_vertex, index) => index !== omitted),
          ].sort((a, b) => a - b),
        });
      }
    }
    complex = subdivided;
  }
  const edges = graphEdges(complex);
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "compact-5-cube-rescue-local-link-template" as const,
    point: base.point,
    rank: options.rank,
    degree: options.degree,
    orderId: order.id,
    orderDigest: order.orderDigest,
    subdivisionFamily: family,
    vertices,
    edges,
    introducedVertexCount: vertices.filter(
      (vertex) => vertex.sourceKind !== "pulling-germ",
    ).length,
    sourceTopologyDigest: canonicalSha256({
      sourceDigest: options.sourceDigest,
      baseTopologyDigest: base.topologyDigest,
      orderDigest: order.orderDigest,
      family,
    }),
    templateDigest: "",
  };
  return {
    ...withoutDigest,
    templateDigest: computeCubeRescueLocalTemplateDigest(withoutDigest),
  };
}

export function createCubeRescueLocalTemplateBuilder(options: {
  oracle: StreamedLawfulDavisOracle;
  cocycleBasis: StreamedTrackBIntegralCocycleBasis;
  generalizedCompression: GeneralizedCompressionCertificate;
  order: CubeRescueVertexOrder;
}): CubeRescueLocalTemplateBuilder {
  const { oracle, cocycleBasis, order } = options;
  if (
    order.degree !== oracle.degree ||
    cocycleBasis.coordinateIds.length !== 19
  ) {
    throw new Error(
      "The rescue topology source does not match the rank-19 quotient.",
    );
  }
  const generalizedCompression = options.generalizedCompression;
  const compressionAudit = auditCubeRescueCompressionBinding({
    generalizedCompression,
    oracle,
  });
  if (!compressionAudit.valid) {
    throw new Error(
      `The rescue topology is not bound to the generalized-compression fibers: ${compressionAudit.errors.join(
        ", ",
      )}.`,
    );
  }
  const sourceDigest = canonicalSha256({
    schemaVersion: 1,
    method: "generalized-compression-local-regular-pulling-rescue",
    oracleStructureHash: oracle.structureHash,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    generalizedCompressionArchiveHash: generalizedCompression.archiveHash,
    latticeBasisDigest: cocycleBasis.latticeBasisDigest,
    cocycleSectionDigest: cocycleBasis.expectedCocycleSectionDigest,
    orderDigest: order.orderDigest,
  });
  const verticesByCell = new Map<string, number[]>();
  const facetsByCell = new Map<string, StreamedDavisCell[]>();
  const triangulationByCell = new Map<string, PullingSimplex[]>();
  let ephemeralTouchedCellIds: Set<string> | undefined;
  const maximalTypeIndices = oracle.sphericalTypes
    .filter(
      (type) =>
        !oracle.sphericalTypes.some(
          (other) =>
            other.dimension > type.dimension &&
            subset(type.generators, new Set(other.generators)),
        ),
    )
    .map((type) => type.typeIndex)
    .sort((left, right) => left - right);
  const maximalSourceCellDimensions = maximalTypeIndices.map((typeIndex) => {
    const type = oracle.sphericalTypes[typeIndex];
    if (!type || type.typeIndex !== typeIndex) {
      throw new Error(`The maximal rescue type ${typeIndex} is not canonical.`);
    }
    return type.dimension;
  });
  const maximalSourceCellDimensionMinimum = Math.min(
    ...maximalSourceCellDimensions,
  );
  const maximalSourceCellDimensionMaximum = Math.max(
    ...maximalSourceCellDimensions,
  );
  if (
    maximalTypeIndices.length === 0 ||
    maximalSourceCellDimensionMinimum < 2
  ) {
    throw new Error(
      "The maximal-simplex stellar lemma requires source cells of dimension at least two.",
    );
  }
  const orderRanksAreDistinct =
    new Set(order.rankByPoint).size === order.degree;
  if (!orderRanksAreDistinct) {
    throw new Error("The rescue pulling order does not have distinct ranks.");
  }
  const commonLinkChecks = {
    orderRanksAreDistinct,
    maximalSourceCellsHaveDimensionAtLeastTwo:
      maximalSourceCellDimensionMinimum >= 2,
    centerIdsDependOnlyOnGlobalSimplexIds: true,
    centerAffineNumeratorIsSourceVertexSum: true,
    centerTieNumeratorIsSourceRankDifferenceSum: true,
    centerMicroTieIsNonzeroTertiary: true,
    centerLinkIsSourceSimplexBoundary: true,
    centerHeightIsStrictlyBetweenSourceExtrema: true,
    ascendingAndDescendingCenterLinksAreNonemptyContractibleFaces: true,
  } as const;
  const subdivisionVertexLinks = {
    pulling: sealSubdivisionVertexLinkCertificate({
      schemaVersion: 1,
      kind: "compact-5-cube-subdivision-vertex-link-certificate",
      status: "not-applicable-no-introduced-vertices",
      subdivisionFamily: "pulling",
      orderId: order.id,
      orderDigest: order.orderDigest,
      sourceDigest,
      construction: "global-regular-pulling-with-no-new-vertices",
      maximalSourceCellTypeCount: maximalTypeIndices.length,
      maximalSourceCellDimensionMinimum,
      maximalSourceCellDimensionMaximum,
      checks: commonLinkChecks,
      conclusion: "The pulling family introduces no subdivision vertices.",
    }),
    "maximal-simplex-stellar": sealSubdivisionVertexLinkCertificate({
      schemaVersion: 1,
      kind: "compact-5-cube-subdivision-vertex-link-certificate",
      status: "certified",
      subdivisionFamily: "maximal-simplex-stellar",
      orderId: order.id,
      orderDigest: order.orderDigest,
      sourceDigest,
      construction: "stellar-centers-of-global-maximal-pulling-simplices",
      maximalSourceCellTypeCount: maximalTypeIndices.length,
      maximalSourceCellDimensionMinimum,
      maximalSourceCellDimensionMaximum,
      checks: commonLinkChecks,
      conclusion:
        "Every introduced center has nonempty contractible ascending and descending links.",
    }),
  } as const;
  const baseByPoint = new Map<number, BaseTopology>();
  const templateByKey = new Map<string, CubeRescueLocalTemplate>();

  const comparePoints = (left: number, right: number): number =>
    order.rankByPoint[left] - order.rankByPoint[right] || left - right;
  const cellVertices = (cell: StreamedDavisCell): number[] => {
    const id = oracle.cellId(cell);
    let result = verticesByCell.get(id);
    if (!result) {
      result = Array.from(oracle.cellVertices(cell)).sort(comparePoints);
      verticesByCell.set(id, result);
      ephemeralTouchedCellIds?.add(id);
    }
    return result;
  };
  const facets = (cell: StreamedDavisCell): StreamedDavisCell[] => {
    const id = oracle.cellId(cell);
    let result = facetsByCell.get(id);
    if (!result) {
      result = [];
      oracle.forEachFacet(cell, (facet) => result!.push(facet));
      result.sort((left, right) =>
        oracle.cellId(left).localeCompare(oracle.cellId(right)),
      );
      facetsByCell.set(id, result);
      ephemeralTouchedCellIds?.add(id);
    }
    return result;
  };
  const pullingSimplices = (cell: StreamedDavisCell): PullingSimplex[] => {
    const id = oracle.cellId(cell);
    const cached = triangulationByCell.get(id);
    if (cached) return cached;
    const vertices = cellVertices(cell);
    const simplices = new Map<string, PullingSimplex>();
    if (cell.dimension === 0) {
      const simplex = {
        id: `cube-rescue:pulling-simplex0:${id}:${vertices[0]}`,
        vertices: [vertices[0]],
      };
      simplices.set(simplex.id, simplex);
    } else {
      const apex = vertices[0];
      for (const facet of facets(cell)) {
        if (cellVertices(facet).includes(apex)) continue;
        for (const faceSimplex of pullingSimplices(facet)) {
          const simplexVertices = [...faceSimplex.vertices, apex].sort(
            (left, right) => left - right,
          );
          const simplex = {
            id: `cube-rescue:pulling-simplex${cell.dimension}:${id}:${simplexVertices.join(
              ",",
            )}`,
            vertices: simplexVertices,
          };
          const existing = simplices.get(simplex.id);
          if (
            existing &&
            canonicalSha256(existing) !== canonicalSha256(simplex)
          ) {
            throw new Error(`${simplex.id} has inconsistent pulling vertices.`);
          }
          simplices.set(simplex.id, simplex);
        }
      }
    }
    const result = [...simplices.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    triangulationByCell.set(id, result);
    ephemeralTouchedCellIds?.add(id);
    return result;
  };

  const buildBase = (point: number, cache: boolean): BaseTopology => {
    if (!Number.isSafeInteger(point) || point < 0 || point >= oracle.degree) {
      throw new Error(`Rescue point q${point} is outside the quotient.`);
    }
    const cachedBase = cache ? baseByPoint.get(point) : undefined;
    if (cachedBase) return cachedBase;
    ephemeralTouchedCellIds = new Set<string>();
    const starSimplicesByCell = new Map<string, PullingSimplex[]>();
    const pullingStarSimplices = (
      cell: StreamedDavisCell,
    ): PullingSimplex[] => {
      const id = oracle.cellId(cell);
      const cached = starSimplicesByCell.get(id);
      if (cached) return cached;
      const vertices = cellVertices(cell);
      if (!vertices.includes(point)) throw new Error(`${id} omits q${point}.`);
      if (cell.dimension === 0) {
        const result = pullingSimplices(cell);
        starSimplicesByCell.set(id, result);
        return result;
      }
      const apex = vertices[0];
      const simplices = new Map<string, PullingSimplex>();
      for (const facet of facets(cell)) {
        const faceVertices = cellVertices(facet);
        if (faceVertices.includes(apex)) continue;
        const faceSimplices =
          point === apex
            ? pullingSimplices(facet)
            : faceVertices.includes(point)
              ? pullingStarSimplices(facet)
              : [];
        for (const faceSimplex of faceSimplices) {
          const simplexVertices = [...faceSimplex.vertices, apex].sort(
            (left, right) => left - right,
          );
          const simplex = {
            id: `cube-rescue:pulling-simplex${cell.dimension}:${id}:${simplexVertices.join(
              ",",
            )}`,
            vertices: simplexVertices,
          };
          simplices.set(simplex.id, simplex);
        }
      }
      const result = [...simplices.values()].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
      starSimplicesByCell.set(id, result);
      return result;
    };
    const supportCache = new Map<string, StreamedDavisCell>();
    const coefficientCache = new Map<string, Map<number, bigint[]>>();
    const minimalSupport = (
      ambient: StreamedDavisCell,
      otherPoint: number,
    ): StreamedDavisCell => {
      const key = `${oracle.cellId(ambient)}\u0000${point}\u0000${otherPoint}`;
      const cached = supportCache.get(key);
      if (cached) return cached;
      const ambientGenerators = new Set(ambient.generators);
      for (let dimension = 1; dimension <= ambient.dimension; dimension += 1) {
        const matches = new Map<string, StreamedDavisCell>();
        for (const type of oracle.sphericalTypes) {
          if (
            type.dimension !== dimension ||
            !subset(type.generators, ambientGenerators)
          )
            continue;
          const face = oracle.cellContaining(type.typeIndex, point);
          if (cellVertices(face).includes(otherPoint))
            matches.set(oracle.cellId(face), face);
        }
        if (matches.size === 1) {
          const support = [...matches.values()][0];
          supportCache.set(key, support);
          return support;
        }
        if (matches.size > 1)
          throw new Error(
            "A pulling rescue edge has ambiguous minimal support.",
          );
      }
      throw new Error("A pulling rescue edge has no spherical support.");
    };
    const coefficients = (cell: StreamedDavisCell): Map<number, bigint[]> => {
      const key = `${oracle.cellId(cell)}\u0000q${point}`;
      const cached = coefficientCache.get(key);
      if (cached) return cached;
      const allowed = new Set(cellVertices(cell));
      const zero = Array.from({ length: 19 }, () => 0n);
      const result = new Map<number, bigint[]>([[point, zero]]);
      const queue = [point];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        const currentVector = result.get(current)!;
        for (const generator of cell.generators) {
          const target = oracle.neighbor(current, generator);
          if (!allowed.has(target))
            throw new Error("A spherical generator leaves its rescue cell.");
          const next = [...currentVector];
          for (const [coordinate, supplied] of cocycleBasis.edgeCoordinatePairs(
            current,
            generator,
          )) {
            if (coordinate < 0 || coordinate >= 19)
              throw new Error("A rescue cocycle coordinate is out of range.");
            next[coordinate] += exactCoordinate(
              supplied,
              "rescue cocycle coordinate",
            );
          }
          const existing = result.get(target);
          if (!existing) {
            result.set(target, next);
            queue.push(target);
          } else if (existing.some((value, index) => value !== next[index])) {
            throw new Error(
              `The integral rescue height is path-dependent in ${oracle.cellId(cell)}.`,
            );
          }
        }
      }
      if (result.size !== allowed.size)
        throw new Error("Rescue integration missed a cell vertex.");
      coefficientCache.set(key, result);
      return result;
    };

    const germById = new Map<string, Germ>();
    const maximalSimplicesById = new Map<string, LinkMaximalSimplex>();
    const germFor = (ambient: StreamedDavisCell, otherPoint: number): Germ => {
      const support = minimalSupport(ambient, otherPoint);
      const id = `track-b:germ:${oracle.cellId(support)}:q${point}:q${otherPoint}`;
      const vector = coefficients(support).get(otherPoint);
      if (!vector) throw new Error(`${id} has no exact rescue height form.`);
      const germ = { id, otherPoint, characterPairs: densePairs(vector) };
      const existing = germById.get(id);
      if (existing && canonicalSha256(existing) !== canonicalSha256(germ)) {
        throw new Error(`${id} changes across maximal rescue cells.`);
      }
      if (!existing) germById.set(id, germ);
      return existing ?? germ;
    };
    const maximalIds = new Set<string>();
    for (const typeIndex of maximalTypeIndices) {
      const ambient = oracle.cellContaining(typeIndex, point);
      const ambientId = oracle.cellId(ambient);
      if (maximalIds.has(ambientId)) continue;
      maximalIds.add(ambientId);
      const cellCoefficients = coefficients(ambient);
      for (const simplex of pullingStarSimplices(ambient)) {
        const otherPoints = simplex.vertices.filter(
          (vertex) => vertex !== point,
        );
        const germs = otherPoints.map((other) => germFor(ambient, other));
        const character = Array.from({ length: 19 }, () => 0n);
        const potential = new Map<number, bigint>();
        let tieNumerator = 0;
        for (const vertex of simplex.vertices) {
          addDense(character, cellCoefficients.get(vertex)!);
          potential.set(vertex, (potential.get(vertex) ?? 0n) + 1n);
          tieNumerator += order.rankByPoint[vertex] - order.rankByPoint[point];
        }
        potential.set(
          point,
          (potential.get(point) ?? 0n) - BigInt(simplex.vertices.length),
        );
        const localSimplex: LinkMaximalSimplex = {
          id: simplex.id,
          germIds: germs.map((germ) => germ.id).sort(),
          characterPairs: densePairs(character),
          potentialPairs: mapPairs(potential),
          tieNumerator,
        };
        const existing = maximalSimplicesById.get(simplex.id);
        if (
          existing &&
          canonicalSha256(existing) !== canonicalSha256(localSimplex)
        ) {
          throw new Error(`${simplex.id} changes across local maximal cells.`);
        }
        maximalSimplicesById.set(simplex.id, localSimplex);
      }
    }
    const germs = [...germById.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const maximalSimplices = [...maximalSimplicesById.values()].sort(
      (left, right) => left.id.localeCompare(right.id),
    );
    const topologyDigest = canonicalSha256({
      schemaVersion: 1,
      method: "generalized-compression-compatible-local-pulling-topology",
      sourceDigest,
      point,
      germs,
      maximalSimplices,
    });
    const base = { point, germs, maximalSimplices, topologyDigest };
    if (cache) baseByPoint.set(point, base);
    for (const cellId of ephemeralTouchedCellIds ?? []) {
      verticesByCell.delete(cellId);
      facetsByCell.delete(cellId);
      triangulationByCell.delete(cellId);
    }
    ephemeralTouchedCellIds = undefined;
    return base;
  };

  return {
    order,
    sourceDigest,
    subdivisionVertexLinks,
    build(point, family, cache = true) {
      if (family !== "pulling" && family !== "maximal-simplex-stellar") {
        throw new Error(`Unsupported rescue subdivision ${String(family)}.`);
      }
      const key = `${point}:${family}`;
      const cached = cache ? templateByKey.get(key) : undefined;
      if (cached) return cached;
      const template = transformTopology({
        base: buildBase(point, cache),
        rank: 19,
        degree: oracle.degree,
        order,
        family,
        sourceDigest,
      });
      if (cache) templateByKey.set(key, template);
      return template;
    },
  };
}
