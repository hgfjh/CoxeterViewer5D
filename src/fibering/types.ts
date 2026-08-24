import type { OrientationSign } from "../walls/types";

/** One value of the wall-derived cochain in the stored edge orientation. */
export interface WallCocycleEdgeValue {
  edgeId: string;
  wallId: string;
  generator: number;
  sourceVertexId: string;
  targetVertexId: string;
  wallSign: OrientationSign;
  wallWeight: number;
  storedDirection: OrientationSign;
  value: number;
}

/** One signed term in the cellular boundary evaluation of a relation cell. */
export interface RelationBoundaryCocycleStep {
  boundaryIndex: number;
  edgeId: string;
  generator: number;
  fromVertexId: string;
  toVertexId: string;
  traversal: OrientationSign;
  storedEdgeValue: number;
  signedContribution: number;
  runningSum: number;
}

export interface RelationBoundaryCocycleCheck {
  cellId: string;
  generatorPair: [number, number];
  m: number;
  expectedBoundaryLength: number;
  boundaryEdgeIds: string[];
  boundaryVertexIds: string[];
  steps: RelationBoundaryCocycleStep[];
  boundarySum: number;
  passed: boolean;
  errors: string[];
}

export type WallCocycleFailureWitness =
  | {
      kind: "invalid-bar-x";
      message: string;
    }
  | {
      kind: "source-complex-mismatch";
      expectedName: string;
      actualName: string;
      message: string;
    }
  | {
      kind: "invalid-coorientation";
      message: string;
    }
  | {
      kind: "unknown-wall-weight";
      wallId: string;
      message: string;
    }
  | {
      kind: "invalid-wall-weight";
      wallId: string;
      value: number;
      message: string;
    }
  | {
      kind: "missing-wall-for-edge";
      edgeId: string;
      message: string;
    }
  | {
      kind: "missing-edge-direction";
      edgeId: string;
      wallId?: string;
      message: string;
    }
  | {
      kind: "edge-direction-mismatch";
      edgeId: string;
      wallId: string;
      expectedDirection: OrientationSign;
      actualDirection: OrientationSign;
      message: string;
    }
  | {
      kind: "unknown-cooriented-edge";
      edgeId: string;
      message: string;
    }
  | {
      kind: "invalid-relation-boundary";
      cellId: string;
      message: string;
    }
  | {
      kind: "relation-boundary-sum";
      cellId: string;
      boundarySum: number;
      edgeIds: string[];
      contributions: number[];
      message: string;
    };

/**
 * Finite cellular check for the integer edge cochain obtained from cooriented
 * walls. `closed` means precisely that every stored relation boundary sums to
 * zero; it does not assert any PL Morse or fibering conclusion.
 */
export interface WallIntegerCocycleCertificate {
  schemaVersion: 1;
  kind: "wall-integer-cocycle-certificate";
  method: "cooriented-wall-edge-values-and-cellular-boundary-sums";
  sourceComplexName: string;
  edgeValues: WallCocycleEdgeValue[];
  relationChecks: RelationBoundaryCocycleCheck[];
  checks: {
    barXReferencesValid: boolean;
    wallAssignmentsComplete: boolean;
    coorientationConsistent: boolean;
    edgeValuesComplete: boolean;
    relationBoundarySumsZero: boolean;
  };
  closed: boolean;
  failures: WallCocycleFailureWitness[];
  nonClaims: string[];
}

export interface FundamentalCycleStep {
  edgeId: string;
  traversal: OrientationSign;
}

/** A deterministic one-skeleton generator associated to one non-tree edge. */
export interface FundamentalCycleEvaluation {
  generatorId: string;
  componentRootVertexId: string;
  nonTreeEdgeId: string;
  steps: FundamentalCycleStep[];
  rawValue: number;
  normalizedValue?: number;
}

export interface BezoutTerm {
  generatorId: string;
  value: number;
  coefficient: number;
}

export interface BezoutIdentity {
  gcd: number;
  terms: BezoutTerm[];
  evaluatedSum: number;
  verified: boolean;
}

export type CocycleImageStatus =
  | "primitive"
  | "nonprimitive"
  | "zero"
  | "unavailable";

export type CocycleImageFailureWitness =
  | {
      kind: "cocycle-not-closed";
      failedCellIds: string[];
      message: string;
    }
  | {
      kind: "incomplete-edge-values";
      missingEdgeIds: string[];
      message: string;
    }
  | {
      kind: "disconnected-one-skeleton";
      componentRootVertexIds: string[];
      message: string;
    }
  | {
      kind: "invalid-one-skeleton";
      message: string;
    }
  | {
      kind: "unsafe-integer-arithmetic";
      message: string;
    }
  | {
      kind: "zero-image";
      generatorIds: string[];
      message: string;
    };

/**
 * Image computation for the induced map on the fundamental group.
 *
 * The raw edge cochain need not itself be primitive. When its loop periods
 * generate dZ with d > 0, `fundamentalCycles[].normalizedValue` records the
 * integer values of the divided, primitive homomorphism on the deterministic
 * one-skeleton generators.
 */
export interface CocycleImageCertificate {
  schemaVersion: 1;
  kind: "cocycle-image-certificate";
  method: "deterministic-spanning-tree-period-gcd";
  status: CocycleImageStatus;
  sourceComplexName: string;
  connected: boolean;
  componentRootVertexIds: string[];
  spanningTreeEdgeIds: string[];
  fundamentalCycles: FundamentalCycleEvaluation[];
  rawImageGenerator: number | null;
  rawImageNotation: "0" | "Z" | `${number}Z` | "unavailable";
  rawHomomorphismPrimitive: boolean;
  primitiveRepresentativeAvailable: boolean;
  normalizationDivisor: number | null;
  bezoutIdentity?: BezoutIdentity;
  normalizedBezoutIdentity?: BezoutIdentity;
  failures: CocycleImageFailureWitness[];
  nonClaims: string[];
}

/** A finite-data package suitable for later Schreier/PL-Morse integration. */
export interface WallHomomorphismFiniteCertificate {
  schemaVersion: 1;
  kind: "wall-homomorphism-finite-certificate";
  method: "wall-cocycle-plus-fundamental-cycle-image";
  sourceComplexName: string;
  cocycle: WallIntegerCocycleCertificate;
  image: CocycleImageCertificate;
  checks: {
    cocycleDefinedOnEveryEdge: boolean;
    cocycleConsistentAroundEveryRelationCell: boolean;
    oneSkeletonConnected: boolean;
    nonzeroImage: boolean;
    primitiveRepresentativeAvailable: boolean;
  };
  finiteChecksPassed: boolean;
  nonClaims: string[];
}
