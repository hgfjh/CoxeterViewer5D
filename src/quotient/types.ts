import type {
  CertificateSummary,
  CoxeterSystemInput,
  DavisHigherCell,
} from "../types";
import type { QuotientGameData } from "../game";

export interface QuotientExportInput {
  schemaVersion: 1;
  sourceSystem: CoxeterSystemInput;
  subgroupName?: string;
  requestedBackend?: "sage" | "gap" | "in-repo";
  includeGamePreset?: "i2-5-height" | "zero";
  artifactManifest?: {
    tool?: string;
    toolVersion?: string;
    command?: string;
    inputHash?: string;
    outputHash?: string;
    artifactPath?: string;
    status?: "passed" | "failed" | "skipped" | "in-repo-checked";
    warnings?: string[];
  };
  subgroupGenerators: number[][];
  subgroupGeneratorRecords?: Array<{
    id: string;
    word: number[];
    label?: string;
    notes?: string[];
  }>;
  maxCosets?: number;
  notes?: string[];
}

export type QuotientBuildInput = QuotientExportInput;

export interface QuotientVertex {
  id: string;
  label?: string;
  representativeWord?: number[];
  sourceNodeIds?: string[];
}

export interface QuotientEdge {
  id: string;
  source: string;
  target: string;
  generator: number;
  inverseEdgeId: string;
  label?: string;
  sourceEdgeIds?: string[];
}

export interface QuotientTwoCell {
  id: string;
  generatorPair: [number, number];
  m: number;
  boundaryVertexIds: string[];
  boundaryEdgeIds?: string[];
  sourceCellIds?: string[];
}

export interface TorsionFreeVerificationMetadata {
  verified: true;
  method: "external-sage" | "external-gap-kbmag" | "published-reference";
  source: string;
  checkedAt?: string;
  notes?: string[];
}

export interface QuotientSubgroupMetadata {
  name?: string;
  index?: number;
  generators?: number[][];
  source?: string;
  manifoldClaimed?: boolean;
  torsionFreeVerification?: TorsionFreeVerificationMetadata;
  certificate?: CertificateSummary;
  notes?: string[];
}

export interface QuotientPermutationAction {
  generator: number;
  images: Record<string, string>;
}

export interface SchreierCertificate {
  status: "passed" | "failed" | "skipped";
  method: "in-repo-permutation-action" | "external-sage" | "external-gap-kbmag";
  checkedAt?: string;
  generatorRank: number;
  vertexCount: number;
  checks: {
    generatorRegularity: boolean;
    bijectiveActions: boolean;
    involutiveGenerators: boolean;
    edgeCompatibility: boolean;
    coxeterRelations: boolean;
    rankTwoCellCoverage: boolean;
    duplicateRankTwoCells: boolean;
  };
  rankTwoOrbits: Array<{
    generatorPair: [number, number];
    m: number;
    orbitKey: string;
    boundaryVertexIds: string[];
    matchedCellIds: string[];
  }>;
  errors: string[];
  warnings: string[];
}

export interface VisibleSphericalStabilizerWitness {
  vertexId: string;
  sphericalSubsetId: string;
  generators: number[];
  word: number[];
}

export interface TorsionFreeCertificate {
  status: "passed" | "failed" | "skipped";
  method:
    | "visible-spherical-stabilizer"
    | "external-sage"
    | "external-gap-kbmag"
    | "published-reference";
  checkedAt?: string;
  checkedSphericalSubsets: Array<{
    id: string;
    generators: number[];
    subgroupOrder?: number;
    enumeratedElements: number;
  }>;
  witnesses: VisibleSphericalStabilizerWitness[];
  limitations: string[];
  errors: string[];
  warnings: string[];
}

export interface QuotientPLDiagnostics {
  linkChecks?: Array<{
    vertexId: string;
    status: "not-checked" | "passed" | "failed";
    reason?: string;
  }>;
  notes?: string[];
}

export interface QuotientComplex {
  schemaVersion: 1;
  name: string;
  sourceSystem?: CoxeterSystemInput;
  generatorRank?: number;
  permutationAction?: QuotientPermutationAction[];
  vertices: QuotientVertex[];
  edges: QuotientEdge[];
  twoCells: QuotientTwoCell[];
  higherCells?: DavisHigherCell[];
  subgroup?: QuotientSubgroupMetadata;
  game?: QuotientGameData;
  verifier?: CertificateSummary;
  schreierCertificate?: SchreierCertificate;
  torsionFreeCertificate?: TorsionFreeCertificate;
  plDiagnostics?: QuotientPLDiagnostics;
  warnings?: string[];
}

export interface QuotientValidationResult {
  ok: boolean;
  value?: QuotientComplex;
  errors: string[];
  warnings: string[];
}

export interface QuotientManifoldStatus {
  canUseManifoldLanguage: boolean;
  label: "quotient complex" | "torsion-free quotient manifold";
  reason: string;
}
