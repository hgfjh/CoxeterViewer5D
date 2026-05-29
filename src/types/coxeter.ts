export type CoxeterMatrixEntry = number | "inf";

export type DataStatus =
  | "toy"
  | "placeholder"
  | "verified-source"
  | "certified";

export interface SourceRef {
  id: string;
  citation: string;
  url?: string;
  locator?: string;
  notes?: string;
}

export interface ExactReal {
  kind: "algebraic-real";
  decimal: number;
  minimalPolynomial: number[];
  isolatingInterval: [number, number];
}

export interface IntervalReal {
  kind: "interval-real";
  lower: number;
  upper: number;
  decimal?: number;
  exact?: ExactReal;
}

export type IntervalVector = IntervalReal[];
export type IntervalMatrix = IntervalReal[][];

export interface ProjectionBounds {
  model: "klein" | "poincare";
  axes: [number, number, number];
  coordinateBounds: [IntervalReal, IntervalReal, IntervalReal];
  radialSquaredBound: IntervalReal;
}

export type CertificateScope =
  | "source-transcription"
  | "gram-signature"
  | "geometry"
  | "geometry-intervals"
  | "geometry-interval-coordinates"
  | "geometry-interval-reflections"
  | "projection-bounds"
  | "coxiter-diagram"
  | "generated-ball"
  | "backend-parity"
  | "quotient-action"
  | "torsion-free"
  | "morse-cocycle"
  | "local-link-homology"
  | "davis-incidence";

export interface CertificateSummary {
  status: "not-certified" | "passed" | "failed" | "skipped";
  backend: string;
  backendVersion?: string;
  scopes?: CertificateScope[];
  command?: string;
  checkedAt?: string;
  inputHash?: string;
  outputHash?: string;
  sourceRefIds?: string[];
  diagnostics?: Record<string, unknown>;
  warnings?: string[];
}

export interface ExternalCheckerSummary extends CertificateSummary {
  checker: string;
  checkerVersion?: string;
}

export interface CertifiedGeometryModel {
  status: "not-certified" | "passed" | "failed" | "skipped";
  coordinateSystem: "hyperboloid";
  coordinateType: "interval-certified-numeric" | "exact-algebraic";
  normalCoordinates?: IntervalMatrix;
  basepoint?: IntervalVector;
  reflectionMatrices?: IntervalMatrix[];
  lorentzPreservationResidual?: IntervalReal;
  reflectionInvolutionResidual?: IntervalReal;
  chamberInequalityBounds?: IntervalReal[];
  projectionBounds?: ProjectionBounds[];
  certificate: CertificateSummary;
  warnings: string[];
}

export type GeometricEntry =
  | { kind: "coxeter"; m: number; sourceRefId?: string; exact?: ExactReal }
  | { kind: "right"; sourceRefId?: string; exact?: ExactReal }
  | {
      kind: "dotted";
      coshDistance: number;
      sourceRefId?: string;
      exact?: ExactReal;
    }
  | {
      kind: "numericGram";
      value: number;
      sourceRefId?: string;
      exact?: ExactReal;
    };

export interface CoxeterGeneratorInput {
  id: string;
  label: string;
  colorHint?: string;
}

export type HyperbolicProjection =
  | "klein-pca"
  | "poincare-pca"
  | "klein-axes"
  | "poincare-axes";

export interface CoxeterGeometryInput {
  model: "hyperboloid";
  dimension: number;
  normalGram?: GeometricEntry[][];
  normalCoordinates?: number[][];
  basepoint?: number[];
  projection?: HyperbolicProjection;
  source?: string;
  diagnostics?: GeometryDiagnostics;
  certifiedModel?: CertifiedGeometryModel;
}

export interface CoxeterSystemInput {
  schemaVersion: 1;
  name: string;
  dataStatus?: DataStatus;
  description?: string;
  rank: number;
  generators: CoxeterGeneratorInput[];
  coxeterMatrix: CoxeterMatrixEntry[][];
  geometry?: CoxeterGeometryInput;
  sourceRefs?: SourceRef[];
  certificate?: CertificateSummary;
  checkerSummaries?: ExternalCheckerSummary[];
  notes?: string[];
  warnings?: string[];
}

export interface CayleyNode {
  id: string;
  word: number[];
  length: number;
  matrixKey?: string;
  position?: [number, number, number];
  hyperbolicPoint?: number[];
}

export interface CayleyEdge {
  id: string;
  source: string;
  target: string;
  generator: number;
}

export interface DavisTwoCell {
  id: string;
  generatorPair: [number, number];
  m: number;
  boundaryNodeIds: string[];
}

export type DavisHigherCellSource =
  | "derived-visible-coset"
  | "imported-exact-coset";

export type DavisHigherCellSubgroupSizeStatus =
  | "matches"
  | "mismatch"
  | "unknown";

export interface DavisHigherCellCosetMetadata {
  key: string;
  representativeNodeId: string;
  representativeWord?: number[];
  minNodeId: string;
  nodeCount: number;
  expectedSubgroupOrder?: number;
  subgroupSizeStatus: DavisHigherCellSubgroupSizeStatus;
}

export interface DavisHigherCellIncidence {
  vertexNodeIds: string[];
  edgeIds: string[];
  rankTwoCellIds: string[];
}

export interface DavisHigherCellRenderingMetadata {
  kind: "exact-incidence" | "visual-proxy";
  proxy: boolean;
  note: string;
}

export interface DavisHigherCell {
  id: string;
  sphericalSubsetId: string;
  generators: number[];
  rank: number;
  nodeIds: string[];
  complete: boolean;
  source: DavisHigherCellSource;
  coset?: DavisHigherCellCosetMetadata;
  incidence?: DavisHigherCellIncidence;
  rendering?: DavisHigherCellRenderingMetadata;
}

export interface DavisCellIncidenceRecord {
  id: string;
  dimension: number;
  rank: number;
  sphericalSubsetId?: string;
  generators: number[];
  cosetRepresentativeNodeId: string;
  vertexNodeIds: string[];
  edgeIds: string[];
  rankTwoCellIds: string[];
  faceCellIds: string[];
  expectedSubgroupOrder?: number;
  clipped: boolean;
  renderingStatus: "exact-incidence" | "visual-proxy";
  certificate?: CertificateSummary;
}

export interface LocalLinkHomologySummary {
  nodeId: string;
  coefficientRing: "F2" | "Z";
  simplexCountByDimension: Record<string, number>;
  bettiNumbers: Record<string, number>;
  certificate?: CertificateSummary;
  warnings: string[];
}

export interface DavisIncidencePoset {
  status: "complete-in-ball" | "clipped" | "not-computed";
  records: DavisCellIncidenceRecord[];
  localLinks?: LocalLinkHomologySummary[];
  certificate?: CertificateSummary;
  warnings: string[];
}

export type DeduplicationMethod =
  | "exact"
  | "rounded-matrix"
  | "external-sage"
  | "external-gap-kbmag";

export interface GenerationCaps {
  maxRadius: number;
  maxNodes: number;
  maxEdges: number;
}

export interface GenerationMetadata {
  radius: number;
  requestedRadius: number;
  generatorConvention: "right-multiplication";
  deduplication: DeduplicationMethod;
  matrixKeyPrecision?: number;
  caps: GenerationCaps;
  backend?: {
    id: string;
    version?: string;
    requiredRuntime?: string;
    command?: {
      argv: string[];
      note?: string;
    };
    input?: {
      path: string;
      sha256: string;
    };
  };
  backendVersion?: string;
  command?: string;
  inputHash?: string;
  outputHash?: string;
  completeness?:
    | "complete"
    | "truncated"
    | "unknown"
    | {
        requestedBallComplete: boolean;
        effectiveRadiusBallComplete: boolean;
        blockingReasons: string[];
        rankTwoCells?: {
          allFinitePairBoundariesComplete: boolean;
          clippedGeneratorPairs: string[];
        };
      };
  capStatus?: {
    hitNodeCap?: boolean;
    hitEdgeCap?: boolean;
    hitRadiusCap?: boolean;
    radiusCapped?: boolean;
    nodeCapHit?: boolean;
    edgeCapHit?: boolean;
    truncated?: boolean;
  };
  certification?: GeneratedBallCertification;
  checkerSummaries?: CertificateSummary[];
  normalForms?: NormalFormRecord[];
  relationProofs?: RelationProofSummary[];
  backendParity?: BackendParityReport;
  createdAt: string;
  warnings: string[];
}

export interface GeneratedCayleyBall {
  systemName: string;
  rank: number;
  nodes: CayleyNode[];
  edges: CayleyEdge[];
  twoCells: DavisTwoCell[];
  higherCells?: DavisHigherCell[];
  davisIncidence?: DavisIncidencePoset;
  metadata: GenerationMetadata;
}

export interface NormalFormRecord {
  nodeId: string;
  word: number[];
  length: number;
  backend: string;
  reduced: boolean;
}

export interface RelationProofSummary {
  relation: string;
  generatorIndices: number[];
  order?: number;
  status: "passed" | "failed" | "skipped";
  checkedNodes?: number;
  failures?: string[];
}

export interface BackendParityReport {
  status: "passed" | "failed" | "skipped";
  backends: string[];
  comparedAt?: string;
  inputHashes: string[];
  diagnostics: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface GeometryDiagnostics {
  factorization?: {
    signature: { positive: number; negative: number; zero: number };
    residual: number;
    tolerance: number;
  };
  basepoint?: {
    method: string;
    maxFacetValue: number;
    tolerance: number;
    orientedByGlobalSign: boolean;
  };
  reflectionResidual?: number;
}

export interface GeneratedBallCertification {
  status: "uncertified" | "certified" | "failed" | "passed" | "skipped";
  certifiedAt?: string;
  verifier?: string;
  backend?: string;
  backendVersion?: string;
  diagnostics?: Record<string, unknown>;
  checks?: {
    reducedWords: boolean;
    generatorEdgeCompleteness: boolean;
    rankTwoBoundaries: boolean;
    capAwareCompleteness: boolean;
  };
  errors: string[];
  warnings?: string[];
}

export interface CayleyGenerationOptions {
  radius: number;
  maxRadius?: number;
  maxNodes?: number;
  maxEdges?: number;
  matrixKeyPrecision?: number;
  createdAt?: string;
}

export interface CayleyBallBackend {
  name: string;
  generate(
    input: CoxeterSystemInput,
    radius: number,
    options?: Omit<CayleyGenerationOptions, "radius">,
  ): Promise<GeneratedCayleyBall>;
}
