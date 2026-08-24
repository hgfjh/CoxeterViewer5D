import type { CoxeterSystemInput } from "../types";
import type { QuotientComplex } from "../quotient";

/** An integer that remains exact even after it exceeds Number.MAX_SAFE_INTEGER. */
export interface ExactIntegerValue {
  decimal: string;
  safeInteger?: number;
}

export type FiniteCoxeterComponentType =
  | "A1"
  | `A${number}`
  | `B${number}`
  | `D${number}`
  | "E6"
  | "E7"
  | "E8"
  | "F4"
  | "H3"
  | "H4"
  | `I2(${number})`;

export interface SphericalComponentPlan {
  generators: number[];
  type: FiniteCoxeterComponentType;
  order: ExactIntegerValue;
}

export interface SphericalSpecialSubgroupPlan {
  id: string;
  generators: number[];
  generatorLabels: string[];
  rank: number;
  components: SphericalComponentPlan[];
  type: string;
  order: ExactIntegerValue;
}

export interface SphericalEnumerationLimits {
  maxRankForExhaustiveEnumeration?: number;
  maxSubsetsToCheck?: number;
  maxSubsetRankWhenIncomplete?: number;
}

/**
 * Exhaustiveness is part of the mathematical result, not merely telemetry.
 * A torsion-free certificate cannot pass when this plan is incomplete.
 */
export interface SphericalSubsetPlan {
  status: "complete" | "incomplete";
  rank: number;
  candidateSubsetCount: ExactIntegerValue;
  checkedSubsetCount: number;
  sphericalSubgroups: SphericalSpecialSubgroupPlan[];
  omittedReason?: "rank-limit" | "subset-cap";
  warnings: string[];
}

export interface TorsionFreeIndexLowerBound {
  value: ExactIntegerValue;
  contributingSubgroupIds: string[];
  explanation: string;
}

/**
 * A candidate is a complete finite right action on points 0,...,index-1.
 * `generatorImages[g][p]` is the endpoint of the generator-g edge from p.
 */
export interface TorsionFreeActionCandidate {
  id: string;
  name?: string;
  index: number;
  generatorImages: number[][];
  pointLabels?: string[];
  representativeWords?: number[][];
  backend?: string;
  backendVersion?: string;
  source?: string;
  notes?: string[];
}

export interface TorsionFreeCandidateEnumeration {
  complete: boolean;
  method: string;
  searchedThroughIndex?: number;
  notes?: string[];
}

export interface TorsionFreeDiscoveryLimits extends SphericalEnumerationLimits {
  maxSphericalSubgroupElements?: number;
  maxWitnesses?: number;
}

export interface TorsionFreeDiscoveryRequest {
  schemaVersion: 1;
  system: CoxeterSystemInput;
  candidates: TorsionFreeActionCandidate[];
  candidateEnumeration: TorsionFreeCandidateEnumeration;
  limits?: TorsionFreeDiscoveryLimits;
}

export type TorsionFreeDiscoveryPhase =
  | "spherical-planning"
  | "candidate-validation"
  | "spherical-action"
  | "quotient-construction"
  | "complete";

export interface TorsionFreeDiscoveryProgress {
  phase: TorsionFreeDiscoveryPhase;
  completed: number;
  total: number;
  candidateId?: string;
  sphericalSubsetId?: string;
  message: string;
}

export type TorsionFreeWitness =
  | {
      kind: "invalid-permutation";
      generator?: number;
      message: string;
    }
  | {
      kind: "intransitive-action";
      orbit: number[];
      unreachablePoints: number[];
    }
  | {
      kind: "non-involution";
      generator: number;
      point: number;
      image: number;
      secondImage: number;
    }
  | {
      kind: "coxeter-relation-failure";
      generatorPair: [number, number];
      m: number;
      point: number;
      image: number;
    }
  | {
      kind: "index-divisibility-failure";
      index: number;
      requiredDivisor: ExactIntegerValue;
    }
  | {
      kind: "subgroup-enumeration-capped";
      sphericalSubsetId: string;
      cap: number;
      enumeratedElements: number;
    }
  | {
      kind: "spherical-action-kernel";
      sphericalSubsetId: string;
      expectedOrder: ExactIntegerValue;
      imageOrder: number;
    }
  | {
      kind: "fixed-point";
      sphericalSubsetId: string;
      generators: number[];
      word: number[];
      point: number;
      pointLabel?: string;
    };

export interface SphericalActionCheck {
  sphericalSubsetId: string;
  generators: number[];
  expectedOrder: ExactIntegerValue;
  enumeratedImageElements: number;
  enumerationComplete: boolean;
  faithful: boolean;
  free: boolean;
  fixedPointElementCount: number;
}

export interface TorsionFreeActionCertificate {
  status: "passed" | "failed" | "incomplete";
  method: "tits-spherical-special-subgroup-action";
  candidateId: string;
  candidateIndex: number;
  actionFingerprint: string;
  indexLowerBound: TorsionFreeIndexLowerBound;
  checks: {
    actionShape: boolean;
    transitive: boolean;
    involutiveGenerators: boolean;
    coxeterRelations: boolean;
    indexDivisibility: boolean;
    sphericalEnumerationComplete: boolean;
    sphericalSubgroupEnumerationsComplete: boolean;
    sphericalActionsFaithful: boolean;
    sphericalActionsFree: boolean;
  };
  sphericalActions: SphericalActionCheck[];
  witnesses: TorsionFreeWitness[];
  witnessCount: number;
  errors: string[];
  warnings: string[];
}

export interface TorsionFreeCandidateResult {
  candidate: TorsionFreeActionCandidate;
  certificate: TorsionFreeActionCertificate;
}

export interface TorsionFreeDiscoveryResult {
  status: "found" | "not-found" | "incomplete";
  sphericalPlan: SphericalSubsetPlan;
  indexLowerBound: TorsionFreeIndexLowerBound;
  candidates: TorsionFreeCandidateResult[];
  accepted?: TorsionFreeCandidateResult;
  quotient?: QuotientComplex;
  errors: string[];
  warnings: string[];
}

export interface AcceptedActionQuotientOptions {
  name?: string;
  subgroupName?: string;
  checkedAt?: string;
}
