import type {
  BarXCompressedComplex,
  BoundaryOccurrence,
} from "../compression/types";

export type OrientationSign = 1 | -1;

export interface WallCrossingEndpoint {
  edgeId: string;
  boundaryIndex: number;
  traversal: OrientationSign;
  sourceVertexId: string;
  targetVertexId: string;
  generator: number;
}

/** One arc through a relation polygon joining the midpoints of opposite sides. */
export interface WallCrossingSegment {
  id: string;
  cellId: string;
  wallId: string;
  first: WallCrossingEndpoint;
  second: WallCrossingEndpoint;
  /**
   * If d(e) records an arrow relative to the stored edge orientation, then
   * d(second) = orientationParity * d(first) for a coherent coorientation.
   */
  orientationParity: OrientationSign;
}

export interface Wall {
  id: string;
  canonicalEdgeId: string;
  edgeIds: string[];
  crossingSegmentIds: string[];
  cellIds: string[];
  twoSided: boolean;
  /** Direction of each edge relative to the canonical edge of this wall. */
  edgeOrientationParity: Record<string, OrientationSign>;
}

export interface WallEmbeddednessWitness {
  kind: "multiple-crossings-in-cell" | "opposite-occurrence-reuses-edge";
  wallId: string;
  cellId: string;
  segmentIds: string[];
  edgePairs: Array<[string, string]>;
}

export interface WallParityConstraintWitness {
  segmentId: string;
  cellId: string;
  firstEdgeId: string;
  secondEdgeId: string;
  parity: OrientationSign;
}

export interface WallTwoSidednessWitness {
  kind: "orientation-parity-conflict";
  wallId: string;
  conflictSegmentId: string;
  firstEdgeId: string;
  secondEdgeId: string;
  expectedSecondParity: OrientationSign;
  existingSecondParity: OrientationSign;
  constraintCycle: WallParityConstraintWitness[];
}

export interface WallLinkVertexFeature {
  kind: "link-vertex";
  id: string;
  vertexId: string;
  edgeId: string;
  edgeEnd: "source" | "target";
}

export interface WallLinkEdgeFeature {
  kind: "link-edge";
  id: string;
  vertexId: string;
  cellId: string;
  cornerIndex: number;
  incomingEdgeId: string;
  outgoingEdgeId: string;
  segmentIds: string[];
}

export type WallAdjacencyFeature = WallLinkVertexFeature | WallLinkEdgeFeature;

/**
 * Section 2.2 calls a wall self-osculating when it is adjacent to one vertex
 * at more than one vertex and/or edge of that vertex link. The concrete link
 * features are retained here so the diagnosis can be inspected, not guessed.
 */
export interface WallSelfOsculationWitness {
  kind: "multiple-link-adjacencies";
  wallId: string;
  vertexId: string;
  features: WallAdjacencyFeature[];
}

export interface WallSystemDiagnostics {
  embedded: boolean;
  twoSided: boolean;
  selfOsculationFree: boolean;
  embeddednessWitnesses: WallEmbeddednessWitness[];
  twoSidednessWitnesses: WallTwoSidednessWitness[];
  selfOsculationWitnesses: WallSelfOsculationWitness[];
}

export interface WallSystem {
  sourceComplexName: string;
  walls: Wall[];
  crossingSegments: WallCrossingSegment[];
  edgeToWallId: Record<string, string>;
  diagnostics: WallSystemDiagnostics;
}

export interface WallCoorientation {
  wallSigns: Record<string, OrientationSign>;
  /** Arrow on each bar-X edge relative to its stored source-to-target direction. */
  edgeDirections: Record<string, OrientationSign>;
  valid: boolean;
  errors: string[];
}

export interface LawfulBoundaryStep {
  boundaryIndex: number;
  edgeId: string;
  generator: number;
  fromVertexId: string;
  toVertexId: string;
  traversal: OrientationSign;
  directionAlongBoundary: OrientationSign;
}

export interface PositiveBoundaryPath {
  id: "clockwise" | "counterclockwise";
  sourceVertexId: string;
  sinkVertexId: string;
  steps: LawfulBoundaryStep[];
}

export interface LawfulCellEvaluation {
  cellId: string;
  lawful: boolean;
  transitionCount: number;
  boundarySigns: OrientationSign[];
  sourceVertexId?: string;
  sinkVertexId?: string;
  positivePaths: PositiveBoundaryPath[];
}

export interface LawfulSubcomplexEvaluation {
  valid: boolean;
  errors: string[];
  cells: LawfulCellEvaluation[];
  retainedCellIds: string[];
  discardedCellIds: string[];
  retainedEdgeIds: string[];
  retainedVertexIds: string[];
}

export interface MorseLinkVertex {
  id: string;
  vertexId: string;
  edgeId: string;
  edgeEnd: "source" | "target";
  generator: number;
}

export interface MorseLinkCorner {
  id: string;
  vertexId: string;
  cellId: string;
  cornerIndex: number;
  firstLinkVertexId: string;
  secondLinkVertexId: string;
}

export interface DirectedMorseLink {
  kind: "ascending" | "descending";
  vertices: MorseLinkVertex[];
  corners: MorseLinkCorner[];
  components: string[][];
  nonempty: boolean;
  connected: boolean;
}

export interface VertexMorseLinks {
  vertexId: string;
  ascending: DirectedMorseLink;
  descending: DirectedMorseLink;
}

export interface MorseLinksResult {
  valid: boolean;
  errors: string[];
  vertices: VertexMorseLinks[];
  allAscendingNonempty: boolean;
  allDescendingNonempty: boolean;
  allAscendingConnected: boolean;
  allDescendingConnected: boolean;
}

export interface MorseLinkConstraint {
  requireAscendingNonempty?: boolean;
  requireDescendingNonempty?: boolean;
  requireAscendingConnected?: boolean;
  requireDescendingConnected?: boolean;
}

export interface MaximumLawfulSearchOptions {
  cellWeights?: Record<string, number>;
  morseConstraint?: MorseLinkConstraint;
  exactWallLimit?: number;
  nodeBudget?: number;
  timeBudgetMs?: number;
}

export type MaximumLawfulSearchStatus =
  | "optimal"
  | "best-found"
  | "infeasible"
  | "invalid-wall-system";

export interface MaximumLawfulSearchCertificate {
  method: "exact-branch-and-bound" | "deterministic-local-search";
  status: MaximumLawfulSearchStatus;
  optimalityProven: boolean;
  globalReversalSymmetryUsed: boolean;
  fixedWallId?: string;
  searchedNodes: number;
  elapsedMs: number;
  wallCount: number;
  lowerBound: number | null;
  upperBound: number;
  absoluteGap: number | null;
  relativeGap: number | null;
  terminationReason:
    | "complete"
    | "wall-limit"
    | "node-budget"
    | "time-budget"
    | "invalid-wall-system";
  deterministicStrategy: string;
}

export interface MaximumLawfulSearchResult {
  status: MaximumLawfulSearchStatus;
  coorientation?: WallCoorientation;
  lawfulSubcomplex?: LawfulSubcomplexEvaluation;
  morseLinks?: MorseLinksResult;
  objectiveValue: number | null;
  certificate: MaximumLawfulSearchCertificate;
  warnings: string[];
}

export interface NormalizedBarXBoundaryCell {
  id: string;
  m: number;
  boundary: BoundaryOccurrence[];
}

export type WallCompatibleBarX = BarXCompressedComplex;
