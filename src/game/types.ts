import type { CertificateSummary } from "../types";

export interface IntegerGeneratorState {
  generator: number;
  value: number;
}

export interface IntegerEdgeState {
  edgeId: string;
  value: number;
}

export type IntegerGameAssignmentKind =
  | "integer-generator-labeling"
  | "integer-edge-labeling";

interface IntegerGameAssignmentBase {
  id: string;
  label?: string;
  description?: string;
  notes?: string[];
}

export interface IntegerGeneratorGameAssignment extends IntegerGameAssignmentBase {
  kind: "integer-generator-labeling";
  generatorStates: IntegerGeneratorState[];
}

export interface IntegerEdgeGameAssignment extends IntegerGameAssignmentBase {
  kind: "integer-edge-labeling";
  edgeStates: IntegerEdgeState[];
}

export type IntegerGameAssignment =
  | IntegerGeneratorGameAssignment
  | IntegerEdgeGameAssignment;

export interface NamedIntegerCocycle {
  id: string;
  label?: string;
  assignmentId: string;
  coefficientRing: "Z";
  certificate?: CertificateSummary;
  notes?: string[];
}

export interface GameExperimentLog {
  id: string;
  label?: string;
  createdAt?: string;
  inputHash?: string;
  assignmentId?: string;
  cocycleId?: string;
  selectedVertexId?: string;
  certificate?: CertificateSummary;
  diagnostics?: Record<string, unknown>;
  notes?: string[];
}

export interface QuotientGameData {
  activeAssignmentId?: string;
  activeCocycleId?: string;
  assignments: IntegerGameAssignment[];
  cocycles?: NamedIntegerCocycle[];
  experimentLogs?: GameExperimentLog[];
  notes?: string[];
}

export interface ResolvedIntegerEdgeAssignment {
  assignmentId?: string;
  label: string;
  edgeStates: IntegerEdgeState[];
  source: "imported" | "zero-fallback";
  errors: string[];
  warnings: string[];
}

export interface BoundaryCocycleTerm {
  edgeId: string;
  from: string;
  to: string;
  storedValue: number;
  signedValue: number;
  traversal: "stored-orientation" | "opposite-orientation";
}

export interface RankTwoBoundaryCheck {
  cellId: string;
  boundarySum: number;
  ok: boolean;
  terms: BoundaryCocycleTerm[];
  expectedBoundaryLength: number;
  actualBoundaryLength: number;
  missingEdgeSteps: Array<{
    step: number;
    from: string;
    to: string;
    edgeId?: string;
  }>;
  missingStateEdgeIds: string[];
}

export interface RankTwoCocycleValidationResult {
  ok: boolean;
  checks: RankTwoBoundaryCheck[];
  errors: string[];
}

export interface MorseCocycleCertificate {
  status: "passed" | "failed" | "skipped";
  method: "in-repo-rank-two-boundary-sums";
  assignmentId?: string;
  cocycleId?: string;
  checkedAt?: string;
  cellCount: number;
  boundaryFailures: string[];
  warnings: string[];
}

export type IncidentEdgeClassification = "ascending" | "descending" | "level";

export interface IncidentEdgeFlow {
  edgeId: string;
  generator: number;
  neighborId: string;
  valueAwayFromVertex: number;
  orientation: "stored-orientation" | "opposite-orientation" | "loop";
  classification: IncidentEdgeClassification;
}
