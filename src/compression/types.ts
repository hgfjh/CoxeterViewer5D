import type { CoxeterSystemInput } from "../types";

/**
 * One signed use of an oriented edge in a cellular attaching map.
 *
 * `traversal` compares the boundary direction with the stored edge direction.
 * It is always `1` for the directed lifts in hat X, but can be `-1` after a
 * generator bigon is compressed to a single geometric edge in bar X.
 */
export interface BoundaryOccurrence {
  edgeId: string;
  traversal: 1 | -1;
  boundaryIndex: number;
  sourceVertexId: string;
  targetVertexId: string;
  generator: number;
}

export interface HatXVertex {
  id: string;
  sourceQuotientVertexId: string;
  label?: string;
  representativeWord?: number[];
}

/** A lift of an oriented generator loop in the Coxeter presentation complex. */
export interface HatXDirectedLiftEdge {
  id: string;
  sourceVertexId: string;
  targetVertexId: string;
  generator: number;
  sourceQuotientEdgeId: string;
}

/**
 * One lift of the presentation cell s_i^2, based at `baseVertexId`.
 *
 * A degree-d cover has d such lifts for each generator. The cells based at
 * x and x s_i have cyclically shifted attaching maps around the same pair of
 * directed lift edges; both cells lie in the fiber of one bar-X edge.
 */
export interface HatXGeneratorBigonCell {
  id: string;
  baseVertexId: string;
  generator: number;
  boundaryOccurrences: [BoundaryOccurrence, BoundaryOccurrence];
}

/** One lift of the presentation cell (s_i s_j)^m. */
export interface HatXLiftedRelationCell {
  id: string;
  baseVertexId: string;
  generatorPair: [number, number];
  m: number;
  boundaryOccurrences: BoundaryOccurrence[];
}

export type CoverEvidenceStatus =
  | "supplied-passed"
  | "in-repo-checked"
  | "not-supplied";

export interface CoverConstructionProvenance {
  sourceQuotientName: string;
  construction: "permutation-action-lift";
  actionEvidence: CoverEvidenceStatus;
  torsionFreeEvidence: CoverEvidenceStatus;
  sourceVerifierBackend?: string;
  sourceVerifierInputHash?: string;
  checksPerformed: string[];
  claims: string[];
  limitations: string[];
}

/**
 * The finite cover hat X before the generator bigons and parallel relation
 * lifts are compressed. No field in this model is a drawing coordinate.
 */
export interface HatXCoverComplex {
  schemaVersion: 1;
  kind: "hat-x-cover";
  name: string;
  sourceSystem: CoxeterSystemInput;
  vertices: HatXVertex[];
  directedLiftEdges: HatXDirectedLiftEdge[];
  generatorBigonCells: HatXGeneratorBigonCell[];
  liftedRelationCells: HatXLiftedRelationCell[];
  provenance: CoverConstructionProvenance;
  warnings: string[];
}

export interface BarXVertex {
  id: string;
  sourceHatVertexId: string;
  sourceQuotientVertexId: string;
  label?: string;
}

/** A geometric edge obtained by collapsing both bigons over one s_i orbit. */
export interface BarXGeometricEdge {
  id: string;
  sourceVertexId: string;
  targetVertexId: string;
  generator: number;
  sourceHatDirectedEdgeIds: [string, string];
  sourceHatBigonCellIds: [string, string];
}

/** A relation polygon obtained from one free finite-dihedral vertex orbit. */
export interface BarXRelationCell {
  id: string;
  generatorPair: [number, number];
  m: number;
  boundaryOccurrences: BoundaryOccurrence[];
  sourceHatRelationCellIds: string[];
}

export interface BarXCompressedComplex {
  schemaVersion: 1;
  kind: "bar-x-compression";
  name: string;
  sourceSystem: CoxeterSystemInput;
  vertices: BarXVertex[];
  geometricEdges: BarXGeometricEdge[];
  relationCells: BarXRelationCell[];
  provenance: CoverConstructionProvenance & {
    construction: "permutation-action-lift";
    compression: "generator-bigons-and-parallel-relation-lifts";
  };
  warnings: string[];
}

export interface CompressionEdgeFiber {
  barEdgeId: string;
  hatDirectedEdgeIds: [string, string];
}

export interface CompressionBigonFiber {
  barEdgeId: string;
  hatBigonCellIds: [string, string];
}

export interface CompressionRelationFiber {
  barRelationCellId: string;
  generatorPair: [number, number];
  expectedCardinality: number;
  hatRelationCellIds: string[];
}

/** Explicit cellular fibers of the compression map hat X -> bar X. */
export interface CompressionMap {
  kind: "hat-x-to-bar-x";
  vertexImages: Record<string, string>;
  directedEdgeImages: Record<string, string>;
  generatorBigonImages: Record<string, string>;
  liftedRelationCellImages: Record<string, string>;
  edgeFibers: CompressionEdgeFiber[];
  bigonFibers: CompressionBigonFiber[];
  relationFibers: CompressionRelationFiber[];
}

export interface CompressionCountCheck {
  expected: number;
  actual: number;
  passed: boolean;
}

export interface CompressionPairCountCheck {
  generatorPair: [number, number];
  m: number;
  expectedHatRelationCells: number;
  actualHatRelationCells: number;
  expectedBarRelationCells: number;
  actualBarRelationCells: number;
  passed: boolean;
}

export interface CompressionCertificate {
  status: "passed" | "failed";
  method: "in-repo-exact-cellular-compression";
  counts: {
    vertices: CompressionCountCheck;
    directedLiftEdges: CompressionCountCheck;
    generatorBigonCells: CompressionCountCheck;
    geometricEdges: CompressionCountCheck;
  };
  pairCounts: CompressionPairCountCheck[];
  checks: {
    hatBoundaryClosure: boolean;
    barBoundaryClosure: boolean;
    edgeFibersHaveCardinalityTwo: boolean;
    bigonFibersHaveCardinalityTwo: boolean;
    relationFibersHaveCardinalityTwoM: boolean;
    everyHatCellHasOneImage: boolean;
    signedRelationBoundariesAgree: boolean;
  };
  errors: string[];
  warnings: string[];
}

export interface CompressionValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface CoverCompressionResult {
  hatX: HatXCoverComplex;
  barX: BarXCompressedComplex;
  compressionMap: CompressionMap;
  certificate: CompressionCertificate;
}
