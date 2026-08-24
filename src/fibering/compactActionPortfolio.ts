import { parseCoxeterSystemInput } from "../coxeter/validation";
import {
  certifyTorsionFreeAction,
  computeTorsionFreeIndexLowerBound,
  exactIntegerToBigInt,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeActionCertificate,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import type { CoxeterMatrixEntry, CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  buildGenericActionH1Certificate,
  type GenericActionH1Budgets,
  type GenericActionH1BuildResult,
  type GenericActionH1Certificate,
} from "./genericActionH1";
import {
  buildExactCheapScreenPeriodicPotential,
  buildExactCheapScreenPullingOrder,
  computeExactCheapScreenActionBindingDigest,
  replayExactCompactActionCheapScreen,
  runExactCompactActionCheapScreen,
  type ExactCheapScreenActionBinding,
  type ExactCheapScreenCharacter,
  type ExactCompactActionCheapScreenBounds,
  type ExactCompactActionCheapScreenOptions,
  type ExactCompactActionCheapScreenReport,
} from "./exactCompactActionCheapScreen";
import {
  buildGenericCompactExpensiveStage,
  replayGenericCompactExpensiveStage,
  selectGenericCompactExpensiveStageSurvivor,
  type GenericCompactExpensiveStageBounds,
  type GenericCompactExpensiveStageCertificate,
} from "./genericCompactExpensiveStage";
import { buildStreamedLawfulDavisOracle } from "./streamedLawfulDavis";

export type CompactTargetId =
  | "makarov-p0"
  | "makarov-p1"
  | "tumarkin-g11411-15"
  | "tumarkin-g11411-04";

export type CompactPortfolioStageId =
  | "source-certification"
  | "spherical-planning"
  | "torsion-free-action"
  | "integral-h1-wall-saturation"
  | "cheap-link-screen"
  | "generalized-compression"
  | "exact-chamber-arrangement";

export type CompactPortfolioStageStatus =
  | "passed"
  | "ready"
  | "blocked"
  | "incomplete"
  | "timed-out"
  | "failed"
  | "deprioritized";

export interface CompactTargetSourceInput {
  id: CompactTargetId;
  path: string;
  bytesSha256: string;
  input: unknown;
}

export interface CompactDiscoveryOutcomeEvidence {
  schemaVersion: 1;
  kind: "compact-torsion-free-discovery-outcome";
  targetId: CompactTargetId;
  sourceBinding: {
    path: string;
    bytesSha256: string;
    canonicalInputSha256: string;
  };
  targetBindingDigest: string;
  configuredCommandDigest: string;
  rawStatus: string;
  normalizedStatus: "failed" | "incomplete" | "timed-out";
  materializedTorsionFreeActionCertified: false;
  rawArtifactDigest: string;
  rawArtifact: unknown;
  outcomeDigest: string;
}

export interface CompactTorsionFreeEvidence {
  status: "passed" | "failed" | "incomplete" | "timed-out";
  actionDigest?: string;
  degree?: number;
  /** Legacy diagnostic only; promotion replays the embedded rows/certificate. */
  replayPassed?: boolean;
  certificateDigest?: string;
  candidate?: TorsionFreeActionCandidate;
  certificate?: TorsionFreeActionCertificate;
  discoveryOutcome?: CompactDiscoveryOutcomeEvidence;
  note?: string;
}

export interface CompactH1WallEvidence {
  status: "passed" | "failed" | "incomplete";
  actionDigest: string;
  certificateDigest: string;
  /** Raw action-rooted certificate; portfolio replay rebuilds it in full. */
  certificate: GenericActionH1Certificate;
  fullIntegralLatticeCertified: boolean;
  h1Rank?: number;
  wallRank?: number;
  wallSaturationIndex?: string;
  h1ModuloWall?: string;
  note?: string;
}

export interface CompactCheapScreenEvidence {
  status: "passed" | "failed" | "incomplete";
  actionDigest: string;
  h1CertificateDigest: string;
  certificateDigest: string;
  /** Raw bounded report; portfolio replay reconstructs every sampled link. */
  report: ExactCompactActionCheapScreenReport;
  completedExperimentCount?: number;
  requiredExperimentCount?: number;
  survivorCount?: number;
  note?: string;
}

export interface CompactCompressionEvidence {
  status: "passed" | "failed" | "incomplete";
  actionDigest: string;
  h1CertificateDigest: string;
  screenCertificateDigest: string;
  survivorTrialId: string;
  certificateDigest: string;
  /** One raw artifact owns both compression and arrangement summaries. */
  stageCertificate: GenericCompactExpensiveStageCertificate;
  replayPassed: boolean;
  note?: string;
}

export interface CompactArrangementEvidence {
  status: "passed" | "failed" | "incomplete";
  compressionCertificateDigest: string;
  certificateDigest: string;
  replayPassed: boolean;
  survivorCount?: number;
  note?: string;
}

export interface CompactTargetEvidence {
  torsionFree?: CompactTorsionFreeEvidence;
  h1Wall?: CompactH1WallEvidence;
  cheapScreen?: CompactCheapScreenEvidence;
  generalizedCompression?: CompactCompressionEvidence;
  exactArrangement?: CompactArrangementEvidence;
}

export interface CompactPortfolioStage {
  id: CompactPortfolioStageId;
  status: CompactPortfolioStageStatus;
  gate: string;
  evidenceDigest?: string;
  note: string;
}

export interface CompactTargetDefinition {
  id: CompactTargetId;
  priority: number;
  role: "primary" | "companion" | "first-backup" | "contrast";
  rationale: string;
  sourcePath: string;
  expectedBytesSha256: string;
  expectedCanonicalInputSha256: string;
  discovery: {
    backend: "auto";
    maxIndex: number;
    maxCandidates: number;
    maxModuleCandidates: number;
    maxCompositeModules: number;
    maxCompositeCombinations: number;
    maxCongruencePrime: number;
    maxCongruenceImageOrder: number;
    maxWitnesses: number;
    maxSphericalOrder: number;
    maxSubsets: number;
    timeoutSeconds: number;
  };
}

export interface CompactP0P1DoubleCertificate {
  status: "passed";
  relation: "W(P1)-is-index-two-kernel-in-W(P0)";
  p0OddCharacter: number[];
  kernelIndex: 2;
  schreierTransversal: number[][];
  p1GeneratorWordsInP0: number[][];
  checks: Array<{ id: string; passed: true; explanation: string }>;
  sourceClaim: string;
  certificateDigest: string;
}

export interface CompactTargetRecord {
  id: CompactTargetId;
  priority: number;
  role: CompactTargetDefinition["role"];
  rationale: string;
  source: {
    path: string;
    bytesSha256: string;
    canonicalInputSha256: string;
    name: string;
    rank: number;
    dimension: number;
    dataStatus: string;
    certificateStatus: string;
  };
  sphericalPlan: {
    status: "complete";
    nonemptyTypeCount: number;
    countsByRank: Record<string, number>;
    torsionFreeDegreeDivisor: string;
    largestSphericalOrder: string;
    conditionalMinimumQuotientCellCount: string;
  };
  oddCoxeterGraph: {
    components: number[][];
    componentCount: number;
    nonzeroMod2CharacterCount: string;
  };
  discovery: CompactTargetDefinition["discovery"] & {
    command: string[];
    p0TransferEligible?: true;
  };
  cheapScreenPlan: {
    gaugeFamilies: string[];
    pullingOrderFamilies: string[];
    subdivisionFamilies: string[];
    tiePolarities: [-1, 1];
    plannedConfigurationFamilyCount: number;
    plannedDirectedRunCount: number;
    executorStatus: "registered-exact-bounded-post-action";
    characterSamplingPolicy: string;
    samplingPolicy: string;
  };
  stages: CompactPortfolioStage[];
  evidence?: CompactTargetEvidence;
  disposition:
    | "ready-for-torsion-free-search"
    | "awaiting-full-integral-h1"
    | "deprioritized-b1-zero"
    | "deprioritized-no-cheap-survivor"
    | "ready-for-cheap-screen"
    | "ready-for-generalized-compression"
    | "ready-for-exact-arrangement"
    | "exact-arrangement-no-survivor"
    | "exact-arrangement-survivor"
    | "stage-failed"
    | "stage-incomplete"
    | "stage-timed-out";
  nonClaims: string[];
}

export interface CompactActionPortfolioArtifact {
  schemaVersion: 1;
  kind: "compact-h5-fibering-action-portfolio";
  generatedAt: string;
  status: "passed";
  policy: {
    order: CompactPortfolioStageId[];
    b1ZeroAction: "deprioritize";
    expensiveConstructionRule: string;
    excludedTarget: "tumarkin-g12221";
  };
  p0P1Double: CompactP0P1DoubleCertificate;
  targets: CompactTargetRecord[];
  artifactHash: string;
}

export interface CompactActionPortfolioReplay {
  status: "passed" | "failed";
  checks: {
    envelopeRecognized: boolean;
    artifactHashValid: boolean;
    sourceBindingsValid: boolean;
    exactPreflightFactsMatch: boolean;
    stageOrderValid: boolean;
  };
  errors: string[];
  replayDigest: string;
}

export interface CompactExpensiveStageCapacityAudit {
  status: "passed" | "failed";
  targetId: CompactTargetId;
  workload: {
    maximumActionEntries: number;
    sphericalTypeCountIncludingEmpty: number;
    strictFaceTypeRelationCount: number;
    maximumRootedSourceCells: number;
    maximumCompressedCells: number;
    maximumRootedFaceRecords: number;
    maximumTemplates: number;
    cubeScaledGermCalibration: number;
    cubeScaledAdjacencyCalibration: number;
  };
  errors: string[];
}

const TARGETS: readonly CompactTargetDefinition[] = [
  {
    id: "makarov-p0",
    priority: 1,
    role: "primary",
    rationale:
      "First compact target: 92 nonempty spherical types, the lowest stored Coxeter growth in this portfolio, and every action can be restricted to the explicit index-two P1 kernel.",
    sourcePath: "public/examples/compact_5_prism_makarov.json",
    expectedBytesSha256:
      "6cb5c7bd535e654e83dc87d383fd9aba5db61fa491edaeff634f792aea5bc221",
    expectedCanonicalInputSha256:
      "c1e89cfd943dbb7eda7c55a761ca80f612e95bdc44d118b9429f38bcf77914d0",
    discovery: {
      backend: "auto",
      maxIndex: 115_200,
      maxCandidates: 128,
      maxModuleCandidates: 512,
      maxCompositeModules: 6,
      maxCompositeCombinations: 100_000,
      maxCongruencePrime: 47,
      maxCongruenceImageOrder: 5_000_000,
      maxWitnesses: 8192,
      maxSphericalOrder: 100_000,
      maxSubsets: 65_536,
      timeoutSeconds: 1800,
    },
  },
  {
    id: "makarov-p1",
    priority: 2,
    role: "companion",
    rationale:
      "Natural companion to P0: the exact doubling kernel permits restriction of every discovered P0 action before an independent search.",
    sourcePath: "public/examples/compact_5_polytope_p1_double_makarov.json",
    expectedBytesSha256:
      "2f5acbaef9bfa5423a38e6052eb1bd25929b41b9c8430c179e49e0993bdcaf31",
    expectedCanonicalInputSha256:
      "d88862776eb9945135d42f16b2fe7ed35f813d5f6bd388a0ae6c03398148daec",
    discovery: {
      backend: "auto",
      maxIndex: 115_200,
      maxCandidates: 128,
      maxModuleCandidates: 512,
      maxCompositeModules: 6,
      maxCompositeCombinations: 100_000,
      maxCongruencePrime: 47,
      maxCongruenceImageOrder: 5_000_000,
      maxWitnesses: 8192,
      maxSphericalOrder: 100_000,
      maxSubsets: 65_536,
      timeoutSeconds: 1800,
    },
  },
  {
    id: "tumarkin-g11411-15",
    priority: 3,
    role: "first-backup",
    rationale:
      "First eight-facet backup: it has the lowest certified Coxeter growth among the G11411 cases considered here.",
    sourcePath: "public/examples/tumarkin_5d_8facet_g11411_15.json",
    expectedBytesSha256:
      "8955e1c37c4993b9af271d84a796b0551e3e21aedfeed8341319f304cce7bdac",
    expectedCanonicalInputSha256:
      "16e88a6577484de52a0a9eb45724dfbd6faf3951e70e45ebccd7b053e06e3219",
    discovery: {
      backend: "auto",
      maxIndex: 57_600,
      maxCandidates: 96,
      maxModuleCandidates: 384,
      maxCompositeModules: 5,
      maxCompositeCombinations: 75_000,
      maxCongruencePrime: 43,
      maxCongruenceImageOrder: 5_000_000,
      maxWitnesses: 8192,
      maxSphericalOrder: 100_000,
      maxSubsets: 65_536,
      timeoutSeconds: 1800,
    },
  },
  {
    id: "tumarkin-g11411-04",
    priority: 4,
    role: "contrast",
    rationale:
      "Cheapest contrasting G11411 case by the stored conditional quotient-cell estimate; it is not a replacement for #15.",
    sourcePath: "public/examples/tumarkin_5d_8facet_g11411_04.json",
    expectedBytesSha256:
      "8329d612e98ac0020ffb93bf9ba3d8ee988cd66330a617a0992893812d1cc750",
    expectedCanonicalInputSha256:
      "7002f52f6acd9dc05c418df7379042312abbde75d5e83de0b0fb3541eb512d30",
    discovery: {
      backend: "auto",
      maxIndex: 57_600,
      maxCandidates: 96,
      maxModuleCandidates: 384,
      maxCompositeModules: 5,
      maxCompositeCombinations: 75_000,
      maxCongruencePrime: 43,
      maxCongruenceImageOrder: 5_000_000,
      maxWitnesses: 8192,
      maxSphericalOrder: 100_000,
      maxSubsets: 65_536,
      timeoutSeconds: 1800,
    },
  },
] as const;

const CUBE_TEMPLATE_GERM_CALIBRATION = {
  degree: 34_560,
  germOccurrences: 4_467_168,
  adjacencyEntriesPerGerm: 10,
} as const;

/**
 * Check exact action/compression workloads at each target's configured maximum
 * index. Germ and adjacency figures are conservative resource calibrations
 * from the completed cube stream, not mathematical upper bounds.
 */
export function auditCompactExpensiveStageCapacity(
  systemInput: unknown,
  targetId: CompactTargetId,
  suppliedBounds: Readonly<GenericCompactExpensiveStageBounds> = COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS,
): CompactExpensiveStageCapacityAudit {
  const definition = TARGETS.find((target) => target.id === targetId);
  if (definition === undefined) throw new Error(`Unknown target ${targetId}.`);
  const system = parseCoxeterSystemInput(systemInput);
  const plan = planSphericalSpecialSubgroups(system, {
    maxRankForExhaustiveEnumeration: system.rank,
    maxSubsetsToCheck: 2 ** system.rank,
  });
  if (plan.status !== "complete") {
    throw new Error(`${targetId} does not have a complete spherical plan.`);
  }
  const sphericalGeneratorSets = [
    [] as number[],
    ...plan.sphericalSubgroups.map((subgroup) => [...subgroup.generators]),
  ];
  const strictFaceTypeRelationCount = sphericalGeneratorSets.reduce(
    (count, coface) =>
      count +
      sphericalGeneratorSets.filter(
        (face) =>
          face.length < coface.length &&
          face.every((generator) => coface.includes(generator)),
      ).length,
    0,
  );
  const maximumIndex = definition.discovery.maxIndex;
  const maximumCompressedCells = Number(
    exactCellCount(
      BigInt(maximumIndex),
      plan.sphericalSubgroups.map((subgroup) =>
        exactIntegerToBigInt(subgroup.order),
      ),
    ),
  );
  const cubeScaledGermCalibration = Math.ceil(
    (CUBE_TEMPLATE_GERM_CALIBRATION.germOccurrences * maximumIndex) /
      CUBE_TEMPLATE_GERM_CALIBRATION.degree,
  );
  const workload: CompactExpensiveStageCapacityAudit["workload"] = {
    maximumActionEntries: maximumIndex * system.rank,
    sphericalTypeCountIncludingEmpty: sphericalGeneratorSets.length,
    strictFaceTypeRelationCount,
    maximumRootedSourceCells: sphericalGeneratorSets.length * maximumIndex,
    maximumCompressedCells,
    maximumRootedFaceRecords: strictFaceTypeRelationCount * maximumIndex,
    maximumTemplates: maximumIndex,
    cubeScaledGermCalibration,
    cubeScaledAdjacencyCalibration:
      cubeScaledGermCalibration *
      CUBE_TEMPLATE_GERM_CALIBRATION.adjacencyEntriesPerGerm,
  };
  const errors: string[] = [];
  if (canonicalSha256(system) !== definition.expectedCanonicalInputSha256) {
    errors.push("The capacity audit input is not the reviewed target source.");
  }
  const requireCapacity = (
    name: keyof GenericCompactExpensiveStageBounds,
    required: number,
    label: string,
  ): void => {
    const actual = suppliedBounds[name];
    if (
      actual === undefined ||
      !Number.isSafeInteger(actual) ||
      actual < required
    ) {
      errors.push(`${name}=${String(actual)} is below ${label} ${required}.`);
    }
  };
  requireCapacity(
    "maxActionEntries",
    workload.maximumActionEntries,
    "the maximum action-entry count",
  );
  requireCapacity(
    "maxSphericalTypes",
    workload.sphericalTypeCountIncludingEmpty,
    "the spherical-type count including the empty type",
  );
  requireCapacity(
    "maxSphericalRankForTemplates",
    system.rank,
    "the Coxeter rank",
  );
  requireCapacity(
    "maxSphericalSubgroupOrder",
    Math.max(
      1,
      ...plan.sphericalSubgroups.map((subgroup) =>
        Number(exactIntegerToBigInt(subgroup.order)),
      ),
    ),
    "the largest spherical-subgroup order",
  );
  requireCapacity(
    "maxRootedSourceCells",
    workload.maximumRootedSourceCells,
    "the maximum rooted-source-cell count",
  );
  requireCapacity(
    "maxCompressedCells",
    workload.maximumCompressedCells,
    "the maximum compressed-cell count",
  );
  requireCapacity(
    "maxFaceTypeRelations",
    workload.strictFaceTypeRelationCount,
    "the strict face-type relation count",
  );
  requireCapacity(
    "maxRootedFaceRecords",
    workload.maximumRootedFaceRecords,
    "the maximum rooted-face-record count",
  );
  requireCapacity(
    "maxTemplates",
    workload.maximumTemplates,
    "the maximum quotient-point template count",
  );
  requireCapacity(
    "maxTemplateGerms",
    workload.cubeScaledGermCalibration,
    "the cube-scaled germ calibration",
  );
  requireCapacity(
    "maxTemplateAdjacencyEntries",
    workload.cubeScaledAdjacencyCalibration,
    "the cube-scaled adjacency calibration",
  );
  return {
    status: errors.length === 0 ? "passed" : "failed",
    targetId,
    workload,
    errors,
  };
}

const STAGE_ORDER: CompactPortfolioStageId[] = [
  "source-certification",
  "spherical-planning",
  "torsion-free-action",
  "integral-h1-wall-saturation",
  "cheap-link-screen",
  "generalized-compression",
  "exact-chamber-arrangement",
];

const CHEAP_SCREEN = {
  gauges: [
    "tree-section",
    "affine-periodic-seed-17-amplitude-1",
    "affine-periodic-seed-43-amplitude-2",
  ],
  pullingOrders: [
    "increasing-point-id",
    "decreasing-point-id",
    "affine-seed-17",
    "affine-seed-43",
  ],
  subdivisions: ["regular-pulling", "maximal-simplex-stellar"],
} as const;

const REQUIRED_CHEAP_SCREEN_EXPERIMENTS =
  CHEAP_SCREEN.gauges.length *
  CHEAP_SCREEN.pullingOrders.length *
  CHEAP_SCREEN.subdivisions.length;

// This exact actionless artifact predates the registered two-family executor.
// It contains no promoted evidence, so replay may recognize it as a historical
// preflight record while every newly built artifact uses the executable plan.
const LEGACY_ACTIONLESS_PREFLIGHT_HASH =
  "3ec5c9ed1dd06b6cc3fa32e53a8a1d35407783a04e2e87e2a9c14ba9ba98e667";

/**
 * The first exact backend is deliberately small. Compact actions above these
 * bounds receive a replayable `incomplete` H1 certificate instead of silently
 * falling back to rational or sampled algebra.
 */
export const COMPACT_GENERIC_H1_BUDGETS: Readonly<GenericActionH1Budgets> = {
  maxCoxeterRank: 12,
  maxDegree: 4_096,
  maxGeneratorEntries: 32_768,
  maxSphericalSubsets: 4_096,
  maxSphericalOrbitEntries: 262_144,
  maxSphericalSubgroupElements: 100_000,
  maxGeometricEdges: 8_192,
  maxRankTwoCells: 8_192,
  maxCotreeEdges: 128,
  maxBoundaryNonzeros: 65_536,
  maxDenseEntries: 65_536,
  maxWalls: 128,
  maxWallPotentialEntries: 262_144,
  maxSmithOperations: 2_000_000,
  maxIntermediateBitLength: 4_096,
  maxModularPrimeAttempts: 16,
};

export const COMPACT_EXACT_CHEAP_SCREEN_BOUNDS: Readonly<ExactCompactActionCheapScreenBounds> =
  {
    maxSamplePoints: 32,
    maxCharacters: 8,
    maxOrders: 4,
    maxPotentials: 3,
    maxSubdivisionFamilies: 2,
    maxTrials: 384,
    maxSourceCellsPerPoint: 4_096,
    maxPullingSimplicesPerSourceCell: 8_192,
    maxOriginalLinkVerticesPerPoint: 8_192,
    maxIntroducedCentersPerTrial: 65_536,
  };

/**
 * Expensive-stage resource stops are certificate data and replay with these
 * same limits. No stop is replaced by a sampled or lower-rank calculation.
 */
export const COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS: Readonly<GenericCompactExpensiveStageBounds> =
  {
    maxActionEntries: 1_000_000,
    maxSphericalTypes: 512,
    maxSphericalRankForTemplates: 12,
    maxSphericalSubgroupOrder: 100_000,
    maxRootedSourceCells: 11_000_000,
    maxCompressedCells: 2_000_000,
    maxFaceTypeRelations: 65_536,
    maxRootedFaceRecords: 120_000_000,
    maxTemplates: 115_200,
    maxTemplateGerms: 20_000_000,
    maxTemplateAdjacencyEntries: 250_000_000,
    maxArrangementNormals: 128,
    maxConeNodes: 1_000_000,
    maxIntermediateInequalities: 250_000,
    maxLeafTemplateEvaluations: 5_000_000,
    maxLeafGermEvaluations: 250_000_000,
  };

// These are effective command bounds even though the Python CLI currently
// supplies them as defaults. Archival replay checks them so a smaller run
// cannot be relabelled as the configured portfolio campaign.
const DISCOVERY_RUNTIME_BOUNDS = {
  maxLowIndexFallback: 512,
  maxMemoryBytes: 12 * 1024 * 1024 * 1024,
  lightWorkers: 4,
  heavyWorkers: 1,
} as const;

const DISCOVERY_PRODUCER = {
  backendVersion: "3.4.1",
  backends: new Set([
    "automatic-torsion-free-cover",
    "gap-low-index-torsion-free",
    "sage-congruence-torsion-free",
  ]),
  commands: new Set([
    "python scripts/torsion_free_discovery.py",
    "python scripts/torsion_free_discovery.py --input <request>",
  ]),
} as const;

function matrixEntryEquals(
  left: CoxeterMatrixEntry,
  right: CoxeterMatrixEntry,
): boolean {
  return left === right;
}

function requireSourceCertification(system: CoxeterSystemInput, id: string) {
  if (system.dataStatus !== "certified") {
    throw new Error(`${id} is not marked as certified source data.`);
  }
  if (system.certificate?.status !== "passed") {
    throw new Error(`${id} has no passed in-repository source certificate.`);
  }
  if (system.geometry?.dimension !== 5) {
    throw new Error(
      `${id} is not certified as a hyperbolic 5-dimensional input.`,
    );
  }
}

function oddCoxeterComponents(system: CoxeterSystemInput): number[][] {
  const unseen = new Set(
    Array.from({ length: system.rank }, (_, index) => index),
  );
  const components: number[][] = [];
  while (unseen.size > 0) {
    const seed = Math.min(...unseen);
    const component: number[] = [];
    const queue = [seed];
    unseen.delete(seed);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor];
      component.push(vertex);
      for (let other = 0; other < system.rank; other += 1) {
        const m = system.coxeterMatrix[vertex][other];
        if (
          typeof m === "number" &&
          m >= 3 &&
          m % 2 === 1 &&
          unseen.has(other)
        ) {
          unseen.delete(other);
          queue.push(other);
        }
      }
    }
    components.push(component.sort((a, b) => a - b));
  }
  return components.sort((a, b) => a[0] - b[0]);
}

function exactCellCount(
  degree: bigint,
  sphericalOrders: readonly bigint[],
): bigint {
  let count = degree;
  for (const order of sphericalOrders) {
    if (degree % order !== 0n) {
      throw new Error(
        `Degree ${degree} is not divisible by spherical order ${order}.`,
      );
    }
    count += degree / order;
  }
  return count;
}

function commandForTarget(definition: CompactTargetDefinition): string[] {
  const d = definition.discovery;
  return [
    "python",
    "scripts/torsion_free_discovery.py",
    "--input",
    definition.sourcePath,
    "--backend",
    d.backend,
    "--max-index",
    String(d.maxIndex),
    "--max-candidates",
    String(d.maxCandidates),
    "--max-module-candidates",
    String(d.maxModuleCandidates),
    "--max-composite-modules",
    String(d.maxCompositeModules),
    "--max-composite-combinations",
    String(d.maxCompositeCombinations),
    "--max-congruence-prime",
    String(d.maxCongruencePrime),
    "--max-congruence-image-order",
    String(d.maxCongruenceImageOrder),
    "--max-witnesses",
    String(d.maxWitnesses),
    "--max-spherical-order",
    String(d.maxSphericalOrder),
    "--max-subsets",
    String(d.maxSubsets),
    "--timeout",
    String(d.timeoutSeconds),
  ];
}

export function compactTargetDiscoveryCommand(id: CompactTargetId): string[] {
  const definition = TARGETS.find((candidate) => candidate.id === id);
  if (definition === undefined)
    throw new Error(`Unknown compact target ${id}.`);
  return commandForTarget(definition);
}

function p0P1DoubleCertificate(
  p0: CoxeterSystemInput,
  p1: CoxeterSystemInput,
): CompactP0P1DoubleCertificate {
  if (p0.rank !== 7 || p1.rank !== 7) {
    throw new Error(
      "The stored P0/P1 doubling certificate requires rank-seven diagrams.",
    );
  }
  for (let i = 0; i <= 5; i += 1) {
    for (let j = 0; j <= 5; j += 1) {
      if (!matrixEntryEquals(p0.coxeterMatrix[i][j], p1.coxeterMatrix[i][j])) {
        throw new Error(`P0/P1 common subdiagram mismatch at (${i},${j}).`);
      }
    }
  }
  for (let i = 0; i <= 4; i += 1) {
    if (p0.coxeterMatrix[6][i] !== 2) {
      throw new Error(`P0 generator 6 must commute with generator ${i}.`);
    }
  }
  if (p0.coxeterMatrix[6][5] !== "inf") {
    throw new Error(
      "P0 terminal generators 5 and 6 must generate infinite dihedral type.",
    );
  }
  const expectedNewRelations: CoxeterMatrixEntry[] = [
    ...p0.coxeterMatrix[5].slice(0, 5),
    "inf",
    1,
  ];
  for (let i = 0; i < p1.rank; i += 1) {
    if (!matrixEntryEquals(p1.coxeterMatrix[6][i], expectedNewRelations[i])) {
      throw new Error(
        `P1 conjugate generator has the wrong relation to generator ${i}.`,
      );
    }
  }

  const withoutDigest = {
    status: "passed" as const,
    relation: "W(P1)-is-index-two-kernel-in-W(P0)" as const,
    p0OddCharacter: [0, 0, 0, 0, 0, 0, 1],
    kernelIndex: 2 as const,
    schreierTransversal: [[], [6]],
    p1GeneratorWordsInP0: [[0], [1], [2], [3], [4], [5], [6, 5, 6]],
    checks: [
      {
        id: "parity-character",
        passed: true as const,
        explanation:
          "Sending p6 to 1 in Z/2 and p0,...,p5 to 0 respects every Coxeter relator; its kernel has index two.",
      },
      {
        id: "reidemeister-schreier-generators",
        passed: true as const,
        explanation:
          "For transversal {1,p6}, commuting relations p6*pi=pi*p6 (i<=4) reduce the kernel generators to p0,...,p5 and p6*p5*p6.",
      },
      {
        id: "derived-coxeter-matrix",
        passed: true as const,
        explanation:
          "Because p6 commutes with p0,...,p4, the order of pi with p6*p5*p6 equals the stored order of pi with p5 for every i<=4; p5 with its conjugate remains infinite dihedral. These derived entries, not a hard-coded row, equal the stored P1 matrix.",
      },
      {
        id: "source-double",
        passed: true as const,
        explanation:
          "The stored Emery-Kellerhals source record identifies P1 as the geometric double of P0 along its [5,3,3,3] facet.",
      },
    ],
    sourceClaim:
      "public/examples/compact_5_polytope_p1_double_makarov.json source record: P1 = D P0 along the [5,3,3,3] Coxeter facet.",
  };
  return {
    ...withoutDigest,
    certificateDigest: canonicalSha256(withoutDigest),
  };
}

function stage(
  id: CompactPortfolioStageId,
  status: CompactPortfolioStageStatus,
  gate: string,
  note: string,
  evidenceDigest?: string,
): CompactPortfolioStage {
  return {
    id,
    status,
    gate,
    note,
    ...(evidenceDigest ? { evidenceDigest } : {}),
  };
}

export interface CompactPostActionEvidenceReplay {
  status: "passed" | "failed";
  checks: {
    exactH1CertificateRebuilt: boolean;
    exactCheapScreenRebuilt: boolean;
    expensiveStageBudgetsMatchPortfolio: boolean;
    exactExpensiveStageRebuilt: boolean;
    embeddedSummariesDerivedFromRawEvidence: boolean;
  };
  errors: string[];
  replayDigest: string;
}

function actionDigest(candidate: TorsionFreeActionCandidate): string {
  return canonicalSha256({
    index: candidate.index,
    generatorImages: candidate.generatorImages,
  });
}

function compactH1Evidence(
  boundActionDigest: string,
  result: GenericActionH1BuildResult,
): CompactH1WallEvidence {
  const certificate = result.certificate;
  const fullIntegralLatticeCertified =
    certificate.status === "passed" &&
    certificate.h1 !== undefined &&
    Object.values(certificate.h1.checks).every(Boolean) &&
    certificate.walls !== undefined &&
    Object.values(certificate.walls.checks).every(Boolean) &&
    certificate.checks.allClaimedChecksPassed;
  return {
    status: certificate.status,
    actionDigest: boundActionDigest,
    certificateDigest: certificate.certificateDigest,
    certificate,
    fullIntegralLatticeCertified,
    ...(certificate.h1 ? { h1Rank: certificate.h1.rank } : {}),
    ...(certificate.walls
      ? {
          wallRank: certificate.walls.wallRank,
          wallSaturationIndex: certificate.walls.wallIndexInSaturation,
          h1ModuloWall: certificate.walls.quotientByWallLattice.presentation,
        }
      : {}),
    note:
      certificate.status === "passed"
        ? `Exact action-rooted calculation certified ${certificate.h1?.isomorphicTo ?? "unknown H1"} and the integral wall Smith data.`
        : `Exact generic H1 backend ended ${certificate.status}: ${certificate.stopReason ?? certificate.errors.join(" ")}`,
  };
}

function coprimeAtOrAbove(degree: number, start: number): number {
  const gcd = (left: number, right: number): number => {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b !== 0) [a, b] = [b, a % b];
    return a;
  };
  for (let candidate = Math.max(1, start); ; candidate += 1) {
    if (gcd(candidate, degree) === 1) return candidate;
  }
}

function compactCheapScreenOptions(input: {
  system: CoxeterSystemInput;
  accepted: TorsionFreeCandidateResult;
  h1: GenericActionH1BuildResult;
}): ExactCompactActionCheapScreenOptions {
  const { accepted, h1 } = input;
  const basis = h1.integralCocycleBasis;
  if (
    h1.certificate.status !== "passed" ||
    (h1.certificate.h1?.rank ?? 0) <= 0 ||
    basis === null
  ) {
    throw new Error(
      "The exact cheap screen requires a passed positive-rank H1 result.",
    );
  }
  const actionChecks = accepted.certificate.checks;
  if (
    accepted.certificate.status !== "passed" ||
    actionChecks.actionShape !== true ||
    actionChecks.transitive !== true ||
    actionChecks.involutiveGenerators !== true ||
    actionChecks.coxeterRelations !== true ||
    actionChecks.indexDivisibility !== true ||
    actionChecks.sphericalEnumerationComplete !== true ||
    actionChecks.sphericalSubgroupEnumerationsComplete !== true ||
    actionChecks.sphericalActionsFaithful !== true ||
    actionChecks.sphericalActionsFree !== true
  ) {
    throw new Error(
      "The exact cheap screen requires every named action-certificate check to pass.",
    );
  }
  const oracle = buildStreamedLawfulDavisOracle({
    system: input.system,
    generatorImages: accepted.candidate.generatorImages,
  });
  const bindingWithoutDigest: ExactCheapScreenActionBinding = {
    schemaVersion: 1 as const,
    kind: "exact-finite-coxeter-permutation-action-binding" as const,
    status: "passed" as const,
    upstreamCertificateKind: accepted.certificate.method,
    upstreamCertificateDigest: canonicalSha256(accepted.certificate),
    degree: oracle.degree,
    generatorCount: oracle.generatorCount,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    checks: {
      exactPermutationActionVerified: true,
      coxeterRelationsVerified: true,
      torsionFreeVerified: true,
    },
    bindingDigest: "",
  };
  bindingWithoutDigest.bindingDigest =
    computeExactCheapScreenActionBindingDigest(bindingWithoutDigest);

  const characters: ExactCheapScreenCharacter[] = Array.from(
    {
      length: Math.min(
        basis.coordinateIds.length,
        COMPACT_EXACT_CHEAP_SCREEN_BOUNDS.maxCharacters,
      ),
    },
    (_unused, coordinate) => ({
      id: `primitive-basis-${coordinate}`,
      coordinates: basis.coordinateIds.map((_id, index) =>
        index === coordinate ? "1" : "0",
      ),
    }),
  );
  const rawOrders = [
    buildExactCheapScreenPullingOrder(oracle.degree, {
      id: "increasing-point-id",
      multiplier: 1,
      shift: 0,
    }),
    buildExactCheapScreenPullingOrder(oracle.degree, {
      id: "decreasing-point-id",
      multiplier: -1,
      shift: oracle.degree - 1,
    }),
    buildExactCheapScreenPullingOrder(oracle.degree, {
      id: "affine-seed-17",
      multiplier: coprimeAtOrAbove(oracle.degree, 17),
      shift: 17,
    }),
    buildExactCheapScreenPullingOrder(oracle.degree, {
      id: "affine-seed-43",
      multiplier: coprimeAtOrAbove(oracle.degree, 43),
      shift: 43,
    }),
  ];
  const seenOrders = new Set<string>();
  const pullingOrders = rawOrders.filter((order) => {
    const key = canonicalSha256(order.rankChunkDigests);
    if (seenOrders.has(key)) return false;
    seenOrders.add(key);
    return true;
  });
  const periodicPotentials = [
    buildExactCheapScreenPeriodicPotential(oracle.degree, {
      id: "tree-section",
      specification: { method: "zero" },
    }),
    buildExactCheapScreenPeriodicPotential(oracle.degree, {
      id: "affine-periodic-seed-17-amplitude-1",
      specification: {
        method: "affine-centered-doubled",
        multiplier: 7,
        shift: 17,
        amplitude: 1,
      },
    }),
    buildExactCheapScreenPeriodicPotential(oracle.degree, {
      id: "affine-periodic-seed-43-amplitude-2",
      specification: {
        method: "affine-centered-doubled",
        multiplier: 11,
        shift: 43,
        amplitude: 2,
      },
    }),
  ];
  return {
    oracle,
    actionBinding: bindingWithoutDigest,
    cocycleBasis: basis,
    characters,
    pullingOrders,
    periodicPotentials,
    subdivisionFamilies: ["pulling", "maximal-simplex-stellar"],
    tiePolarities: [-1, 1],
    bounds: { ...COMPACT_EXACT_CHEAP_SCREEN_BOUNDS },
  };
}

function compactCheapScreenEvidence(
  boundActionDigest: string,
  h1CertificateDigest: string,
  report: ExactCompactActionCheapScreenReport,
): CompactCheapScreenEvidence {
  const completedExperimentCount = report.trials.filter(
    (trial) => trial.status === "evaluated",
  ).length;
  return {
    status: report.status === "completed" ? "passed" : "incomplete",
    actionDigest: boundActionDigest,
    h1CertificateDigest,
    certificateDigest: report.reportDigest,
    report,
    completedExperimentCount,
    requiredExperimentCount: report.declaredPortfolio.scheduledTrialCount,
    survivorCount: report.passingTrialIds.length,
    note:
      report.status === "completed"
        ? `Exact bounded screen completed ${completedExperimentCount} trials with ${report.passingTrialIds.length} sampled survivor(s).`
        : `Exact bounded screen stopped within bounds: ${report.stopReasons.join(", ") || "a per-trial topology bound"}.`,
  };
}

function compactExpensiveStageEvidence(input: {
  boundActionDigest: string;
  h1CertificateDigest: string;
  screenCertificateDigest: string;
  survivorTrialId: string;
  certificate: GenericCompactExpensiveStageCertificate;
}): Pick<CompactTargetEvidence, "generalizedCompression" | "exactArrangement"> {
  const { certificate } = input;
  const compressionReplayed =
    certificate.generalizedCompression?.replay.valid === true;
  const compressionStatus: CompactCompressionEvidence["status"] =
    compressionReplayed
      ? "passed"
      : certificate.status === "failed"
        ? "failed"
        : "incomplete";
  const arrangementReplayed =
    certificate.outcome === "exact-arrangement-complete" &&
    certificate.status === "completed" &&
    certificate.checks.exactArrangementReplayed &&
    certificate.arrangement?.coverReplay.status === "passed";
  const arrangementStatus: CompactArrangementEvidence["status"] =
    arrangementReplayed
      ? "passed"
      : certificate.status === "failed"
        ? "failed"
        : "incomplete";
  const survivorCount = certificate.arrangement
    ? certificate.arrangement.census.passingFaceCountByPolarity["-1"] +
      certificate.arrangement.census.passingFaceCountByPolarity["1"]
    : undefined;
  const generalizedCompression: CompactCompressionEvidence = {
    status: compressionStatus,
    actionDigest: input.boundActionDigest,
    h1CertificateDigest: input.h1CertificateDigest,
    screenCertificateDigest: input.screenCertificateDigest,
    survivorTrialId: input.survivorTrialId,
    certificateDigest: certificate.certificateDigest,
    stageCertificate: certificate,
    replayPassed: compressionReplayed,
    note: compressionReplayed
      ? "The full action-rooted generalized compression is embedded in the expensive-stage certificate and passed its internal exact replay."
      : `The expensive stage ended ${certificate.status} before a replayed generalized compression was available: ${certificate.stop?.detail ?? certificate.errors.join(" ")}`,
  };
  const exactArrangement: CompactArrangementEvidence = {
    status: arrangementStatus,
    compressionCertificateDigest: certificate.certificateDigest,
    certificateDigest: certificate.certificateDigest,
    replayPassed: arrangementReplayed,
    ...(survivorCount === undefined ? {} : { survivorCount }),
    note: arrangementReplayed
      ? `The exhaustive full-H1 arrangement replayed with ${survivorCount ?? 0} passing face/polarity pair(s).`
      : certificate.outcome === "compression-sidecar-only"
        ? `The generalized compression is preserved, but arrangement promotion is incomplete: ${certificate.nonpromotableGap?.detail ?? certificate.stop?.detail ?? "the exact arrangement was not run"}`
        : `The exact arrangement ended ${certificate.status}: ${certificate.stop?.detail ?? certificate.errors.join(" ")}`,
  };
  return { generalizedCompression, exactArrangement };
}

/** Run every registered exact post-action stage through its deterministic gate. */
export function buildCompactPostActionEvidence(
  systemInput: unknown,
  accepted: TorsionFreeCandidateResult,
): Pick<
  CompactTargetEvidence,
  "h1Wall" | "cheapScreen" | "generalizedCompression" | "exactArrangement"
> {
  const system = parseCoxeterSystemInput(systemInput);
  const boundActionDigest = actionDigest(accepted.candidate);
  const h1 = buildGenericActionH1Certificate(system, accepted, {
    budgets: { ...COMPACT_GENERIC_H1_BUDGETS },
  });
  const h1Wall = compactH1Evidence(boundActionDigest, h1);
  if (
    h1.certificate.status !== "passed" ||
    (h1.certificate.h1?.rank ?? 0) === 0
  ) {
    return { h1Wall };
  }
  const screenOptions = compactCheapScreenOptions({ system, accepted, h1 });
  const report = runExactCompactActionCheapScreen(screenOptions);
  const cheapScreen = compactCheapScreenEvidence(
    boundActionDigest,
    h1.certificate.certificateDigest,
    report,
  );
  if (report.status !== "completed" || report.passingTrialIds.length === 0) {
    return { h1Wall, cheapScreen };
  }
  const survivorTrialId = selectGenericCompactExpensiveStageSurvivor({
    degree: screenOptions.oracle.degree,
    pullingOrders: screenOptions.pullingOrders,
    periodicPotentials: screenOptions.periodicPotentials,
    report,
  });
  if (survivorTrialId === undefined) {
    throw new Error(
      "The completed cheap screen reports a survivor that cannot be resolved to a trial.",
    );
  }
  const certificate = buildGenericCompactExpensiveStage(system, accepted, {
    oracle: screenOptions.oracle,
    h1,
    cheapScreenOptions: screenOptions,
    cheapScreenReport: report,
    survivorTrialId,
    bounds: { ...COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS },
  });
  return {
    h1Wall,
    cheapScreen,
    ...compactExpensiveStageEvidence({
      boundActionDigest,
      h1CertificateDigest: h1.certificate.certificateDigest,
      screenCertificateDigest: report.reportDigest,
      survivorTrialId,
      certificate,
    }),
  };
}

/** Rebuild raw certificates and sampled links from the action rows. */
export function replayCompactPostActionEvidence(
  systemInput: unknown,
  accepted: TorsionFreeCandidateResult,
  stored: Pick<
    CompactTargetEvidence,
    "h1Wall" | "cheapScreen" | "generalizedCompression" | "exactArrangement"
  >,
): CompactPostActionEvidenceReplay {
  const checks: CompactPostActionEvidenceReplay["checks"] = {
    exactH1CertificateRebuilt: false,
    exactCheapScreenRebuilt: stored.cheapScreen === undefined,
    expensiveStageBudgetsMatchPortfolio:
      stored.generalizedCompression === undefined &&
      stored.exactArrangement === undefined,
    exactExpensiveStageRebuilt:
      stored.generalizedCompression === undefined &&
      stored.exactArrangement === undefined,
    embeddedSummariesDerivedFromRawEvidence: false,
  };
  const errors: string[] = [];
  try {
    if (stored.h1Wall === undefined) {
      throw new Error(
        "Post-action evidence has no raw generic H1 certificate.",
      );
    }
    const system = parseCoxeterSystemInput(systemInput);
    const rebuiltH1 = buildGenericActionH1Certificate(system, accepted, {
      budgets: { ...COMPACT_GENERIC_H1_BUDGETS },
    });
    const rebuiltH1Evidence = compactH1Evidence(
      actionDigest(accepted.candidate),
      rebuiltH1,
    );
    checks.exactH1CertificateRebuilt =
      canonicalSha256(stored.h1Wall.certificate) ===
        canonicalSha256(rebuiltH1.certificate) &&
      canonicalSha256(stored.h1Wall) === canonicalSha256(rebuiltH1Evidence);
    if (!checks.exactH1CertificateRebuilt) {
      errors.push(
        "Embedded generic H1 evidence differs from action-rooted replay.",
      );
    }

    let rebuiltScreenEvidence: CompactCheapScreenEvidence | undefined;
    let rebuiltCompressionEvidence: CompactCompressionEvidence | undefined;
    let rebuiltArrangementEvidence: CompactArrangementEvidence | undefined;
    if (stored.cheapScreen !== undefined) {
      if (
        rebuiltH1.certificate.status !== "passed" ||
        (rebuiltH1.certificate.h1?.rank ?? 0) <= 0
      ) {
        throw new Error(
          "Cheap-screen evidence follows a non-passed or rank-zero H1 result.",
        );
      }
      const screenOptions = compactCheapScreenOptions({
        system,
        accepted,
        h1: rebuiltH1,
      });
      const screenReplay = replayExactCompactActionCheapScreen(
        screenOptions,
        stored.cheapScreen.report,
      );
      rebuiltScreenEvidence = compactCheapScreenEvidence(
        actionDigest(accepted.candidate),
        rebuiltH1.certificate.certificateDigest,
        stored.cheapScreen.report,
      );
      checks.exactCheapScreenRebuilt =
        screenReplay.status === "passed" &&
        canonicalSha256(stored.cheapScreen) ===
          canonicalSha256(rebuiltScreenEvidence);
      if (!checks.exactCheapScreenRebuilt) {
        errors.push(
          "Embedded cheap-screen evidence differs from exact link replay.",
        );
      }
      const survivorTrialId = selectGenericCompactExpensiveStageSurvivor({
        degree: screenOptions.oracle.degree,
        pullingOrders: screenOptions.pullingOrders,
        periodicPotentials: screenOptions.periodicPotentials,
        report: stored.cheapScreen.report,
      });
      const expensiveEvidencePresent =
        stored.generalizedCompression !== undefined ||
        stored.exactArrangement !== undefined;
      if (
        stored.cheapScreen.report.status === "completed" &&
        survivorTrialId !== undefined
      ) {
        if (
          stored.generalizedCompression === undefined ||
          stored.exactArrangement === undefined
        ) {
          checks.exactExpensiveStageRebuilt = false;
          errors.push(
            "A completed cheap screen with a survivor lacks the registered expensive-stage certificate and summaries.",
          );
        } else {
          checks.expensiveStageBudgetsMatchPortfolio =
            canonicalSha256(
              stored.generalizedCompression.stageCertificate.budgets,
            ) === canonicalSha256(COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS);
          if (!checks.expensiveStageBudgetsMatchPortfolio) {
            checks.exactExpensiveStageRebuilt = false;
            errors.push(
              "The expensive-stage certificate did not use the fixed portfolio bounds.",
            );
          }
          const expensiveReplay = checks.expensiveStageBudgetsMatchPortfolio
            ? replayGenericCompactExpensiveStage(
                system,
                accepted,
                {
                  oracle: screenOptions.oracle,
                  h1: rebuiltH1,
                  cheapScreenOptions: screenOptions,
                  cheapScreenReport: stored.cheapScreen.report,
                  survivorTrialId,
                  bounds: { ...COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS },
                },
                stored.generalizedCompression.stageCertificate,
              )
            : undefined;
          const rebuiltExpensiveEvidence = compactExpensiveStageEvidence({
            boundActionDigest: actionDigest(accepted.candidate),
            h1CertificateDigest: rebuiltH1.certificate.certificateDigest,
            screenCertificateDigest: stored.cheapScreen.report.reportDigest,
            survivorTrialId,
            certificate: stored.generalizedCompression.stageCertificate,
          });
          rebuiltCompressionEvidence =
            rebuiltExpensiveEvidence.generalizedCompression;
          rebuiltArrangementEvidence =
            rebuiltExpensiveEvidence.exactArrangement;
          checks.exactExpensiveStageRebuilt =
            expensiveReplay?.status === "passed" &&
            canonicalSha256(stored.generalizedCompression) ===
              canonicalSha256(rebuiltCompressionEvidence) &&
            canonicalSha256(stored.exactArrangement) ===
              canonicalSha256(rebuiltArrangementEvidence);
          if (!checks.exactExpensiveStageRebuilt) {
            errors.push(
              "Embedded expensive-stage evidence differs from exact action-rooted replay.",
            );
          }
        }
      } else if (expensiveEvidencePresent) {
        checks.exactExpensiveStageRebuilt = false;
        errors.push(
          "Expensive-stage evidence is attached without a completed cheap-screen survivor.",
        );
      }
    } else if (
      rebuiltH1.certificate.status === "passed" &&
      (rebuiltH1.certificate.h1?.rank ?? 0) > 0
    ) {
      checks.exactCheapScreenRebuilt = false;
      errors.push(
        "Positive-rank H1 evidence lacks the required deterministic bounded cheap screen.",
      );
    } else if (
      stored.generalizedCompression !== undefined ||
      stored.exactArrangement !== undefined
    ) {
      checks.exactExpensiveStageRebuilt = false;
      errors.push(
        "Expensive-stage evidence is attached without a cheap screen.",
      );
    }
    checks.embeddedSummariesDerivedFromRawEvidence =
      canonicalSha256(stored.h1Wall) === canonicalSha256(rebuiltH1Evidence) &&
      (stored.cheapScreen === undefined ||
        canonicalSha256(stored.cheapScreen) ===
          canonicalSha256(rebuiltScreenEvidence)) &&
      (stored.generalizedCompression === undefined ||
        canonicalSha256(stored.generalizedCompression) ===
          canonicalSha256(rebuiltCompressionEvidence)) &&
      (stored.exactArrangement === undefined ||
        canonicalSha256(stored.exactArrangement) ===
          canonicalSha256(rebuiltArrangementEvidence));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const uniqueErrors = [...new Set(errors)].sort();
  const status =
    uniqueErrors.length === 0 && Object.values(checks).every(Boolean)
      ? "passed"
      : "failed";
  const payload = { status, checks, errors: uniqueErrors };
  return {
    ...payload,
    replayDigest: canonicalSha256(payload),
  } as CompactPostActionEvidenceReplay;
}

function evaluateStages(
  divisor: bigint,
  evidence: CompactTargetEvidence | undefined,
): Pick<CompactTargetRecord, "stages" | "disposition" | "nonClaims"> {
  const stages: CompactPortfolioStage[] = [
    stage(
      "source-certification",
      "passed",
      "The bundled source transcription and hyperbolic dimension must replay.",
      "Certified source data replayed.",
    ),
    stage(
      "spherical-planning",
      "passed",
      "All generator subsets must be exhausted and every finite special-subgroup order exact.",
      "The complete spherical-subgroup plan and degree divisor were recomputed.",
    ),
  ];
  const nonClaims = [
    "A source certificate is not a torsion-free subgroup certificate.",
    "A cheap screen without a survivor is a prioritization result, not a non-fibering theorem.",
    "No generalized compression or chamber arrangement is constructed before its promotion gate passes.",
    "At most one deterministic compatible cheap-screen survivor is promoted to the expensive stage; other passing rules are not exhaustively promoted.",
  ];
  const action = evidence?.torsionFree;
  if (action === undefined) {
    stages.push(
      stage(
        "torsion-free-action",
        "ready",
        "Supply a complete permutation action and replay freeness on every spherical special subgroup.",
        "Bounded discovery is the next executable stage.",
      ),
      stage(
        "integral-h1-wall-saturation",
        "blocked",
        "Requires a passed torsion-free action.",
        "No action is available.",
      ),
      stage(
        "cheap-link-screen",
        "blocked",
        "Requires full integral H1 and wall saturation with b1>0.",
        "Algebraic gate has not run.",
      ),
      stage(
        "generalized-compression",
        "blocked",
        "Requires at least one cheap-screen survivor.",
        "Expensive construction is intentionally withheld.",
      ),
      stage(
        "exact-chamber-arrangement",
        "blocked",
        "Requires a replayed generalized compression.",
        "Expensive arrangement is intentionally withheld.",
      ),
    );
    return { stages, disposition: "ready-for-torsion-free-search", nonClaims };
  }
  if (action.status !== "passed") {
    nonClaims.push(
      "A failed, incomplete, or timed-out bounded discovery outcome neither certifies a torsion-free action nor proves that none exists.",
    );
    stages.push(
      stage(
        "torsion-free-action",
        action.status,
        "Exact torsion-freeness replay is mandatory.",
        action.note ?? `Action stage ended ${action.status}.`,
        action.certificateDigest,
      ),
      stage(
        "integral-h1-wall-saturation",
        "blocked",
        "Requires a passed torsion-free action.",
        "Action gate did not pass.",
      ),
      stage(
        "cheap-link-screen",
        "blocked",
        "Requires the H1 gate.",
        "Action gate did not pass.",
      ),
      stage(
        "generalized-compression",
        "blocked",
        "Requires a cheap-screen survivor.",
        "Action gate did not pass.",
      ),
      stage(
        "exact-chamber-arrangement",
        "blocked",
        "Requires compression.",
        "Action gate did not pass.",
      ),
    );
    return {
      stages,
      disposition:
        action.status === "failed"
          ? "stage-failed"
          : action.status === "timed-out"
            ? "stage-timed-out"
            : "stage-incomplete",
      nonClaims,
    };
  }
  if (
    action.actionDigest === undefined ||
    action.certificateDigest === undefined ||
    !Number.isSafeInteger(action.degree) ||
    (action.degree ?? 0) <= 0 ||
    BigInt(action.degree as number) % divisor !== 0n
  ) {
    throw new Error(
      "Passed torsion-free evidence is incomplete, failed replay, or violates the exact degree divisor.",
    );
  }
  stages.push(
    stage(
      "torsion-free-action",
      "passed",
      "Exact torsion-freeness replay is mandatory.",
      `A degree-${action.degree} action passed exact replay.`,
      action.certificateDigest,
    ),
  );

  const h1 = evidence?.h1Wall;
  if (h1 === undefined) {
    stages.push(
      stage(
        "integral-h1-wall-saturation",
        "ready",
        "Compute the complete integral cocycle lattice, coboundaries, wall sublattice, and Smith data.",
        "This runs immediately after action certification.",
      ),
      stage(
        "cheap-link-screen",
        "blocked",
        "Requires a passed H1 gate with b1>0.",
        "Full integral H1 is not available.",
      ),
      stage(
        "generalized-compression",
        "blocked",
        "Requires a cheap-screen survivor.",
        "Full integral H1 is not available.",
      ),
      stage(
        "exact-chamber-arrangement",
        "blocked",
        "Requires compression.",
        "Full integral H1 is not available.",
      ),
    );
    return { stages, disposition: "awaiting-full-integral-h1", nonClaims };
  }
  if (h1.actionDigest !== action.actionDigest) {
    throw new Error("H1 evidence is not bound to the accepted action digest.");
  }
  if (h1.status !== "passed") {
    stages.push(
      stage(
        "integral-h1-wall-saturation",
        h1.status,
        "Full integral H1 replay is mandatory.",
        h1.note ?? `H1 stage ended ${h1.status}.`,
        h1.certificateDigest,
      ),
      stage(
        "cheap-link-screen",
        "blocked",
        "Requires a passed H1 gate.",
        "H1 gate did not pass.",
      ),
      stage(
        "generalized-compression",
        "blocked",
        "Requires a cheap-screen survivor.",
        "H1 gate did not pass.",
      ),
      stage(
        "exact-chamber-arrangement",
        "blocked",
        "Requires compression.",
        "H1 gate did not pass.",
      ),
    );
    return {
      stages,
      disposition: h1.status === "failed" ? "stage-failed" : "stage-incomplete",
      nonClaims,
    };
  }
  if (
    h1.certificate.status !== "passed" ||
    h1.certificate.certificateDigest !== h1.certificateDigest ||
    h1.fullIntegralLatticeCertified !== true ||
    !Number.isSafeInteger(h1.h1Rank) ||
    (h1.h1Rank ?? -1) < 0 ||
    !Number.isSafeInteger(h1.wallRank) ||
    (h1.wallRank ?? -1) < 0 ||
    (h1.wallRank ?? 0) > (h1.h1Rank ?? 0) ||
    typeof h1.wallSaturationIndex !== "string" ||
    !/^[1-9][0-9]*$/u.test(h1.wallSaturationIndex) ||
    ((h1.wallRank ?? 0) === 0 && h1.wallSaturationIndex !== "1") ||
    typeof h1.h1ModuloWall !== "string" ||
    h1.h1ModuloWall.length === 0
  ) {
    throw new Error(
      "Passed H1 evidence must certify the full integral lattice and wall Smith data.",
    );
  }
  stages.push(
    stage(
      "integral-h1-wall-saturation",
      "passed",
      "Full integral H1 replay is mandatory.",
      `H1 is Z^${h1.h1Rank}; wall rank ${h1.wallRank}, saturation index ${h1.wallSaturationIndex}.`,
      h1.certificateDigest,
    ),
  );
  if (h1.h1Rank === 0) {
    stages.push(
      stage(
        "cheap-link-screen",
        "deprioritized",
        "Only b1>0 actions enter Morse-character screening.",
        "This action has b1=0.",
      ),
      stage(
        "generalized-compression",
        "deprioritized",
        "Requires a cheap-screen survivor.",
        "Stopped by the b1=0 gate.",
      ),
      stage(
        "exact-chamber-arrangement",
        "deprioritized",
        "Requires compression.",
        "Stopped by the b1=0 gate.",
      ),
    );
    return { stages, disposition: "deprioritized-b1-zero", nonClaims };
  }

  const screen = evidence?.cheapScreen;
  if (screen === undefined) {
    stages.push(
      stage(
        "cheap-link-screen",
        "ready",
        "Sample every configured gauge/order/subdivision family and replay all local links.",
        "The action has b1>0 and is ready for the bounded screen.",
      ),
      stage(
        "generalized-compression",
        "blocked",
        "Requires at least one screen survivor.",
        "No sampled survivor is recorded.",
      ),
      stage(
        "exact-chamber-arrangement",
        "blocked",
        "Requires compression.",
        "No sampled survivor is recorded.",
      ),
    );
    return { stages, disposition: "ready-for-cheap-screen", nonClaims };
  }
  if (
    screen.actionDigest !== action.actionDigest ||
    screen.h1CertificateDigest !== h1.certificateDigest
  ) {
    throw new Error(
      "Cheap-screen evidence is not bound to the action and H1 certificates.",
    );
  }
  if (screen.status !== "passed") {
    stages.push(
      stage(
        "cheap-link-screen",
        screen.status,
        "All configured bounded samples must replay.",
        screen.note ?? `Screen ended ${screen.status}.`,
        screen.certificateDigest,
      ),
      stage(
        "generalized-compression",
        "blocked",
        "Requires a passed screen with a survivor.",
        "Screen gate did not pass.",
      ),
      stage(
        "exact-chamber-arrangement",
        "blocked",
        "Requires compression.",
        "Screen gate did not pass.",
      ),
    );
    return {
      stages,
      disposition:
        screen.status === "failed" ? "stage-failed" : "stage-incomplete",
      nonClaims,
    };
  }
  if (
    screen.report.status !== "completed" ||
    screen.report.reportDigest !== screen.certificateDigest ||
    !Number.isSafeInteger(screen.completedExperimentCount) ||
    screen.requiredExperimentCount !==
      screen.report.declaredPortfolio.scheduledTrialCount ||
    screen.completedExperimentCount !== screen.report.trials.length ||
    screen.report.trials.some((trial) => trial.status !== "evaluated") ||
    !Number.isSafeInteger(screen.survivorCount) ||
    (screen.survivorCount ?? -1) < 0 ||
    screen.survivorCount !== screen.report.passingTrialIds.length ||
    (screen.survivorCount ?? 0) > screen.report.trials.length
  ) {
    throw new Error(
      "Passed cheap-screen evidence must be complete and replayed.",
    );
  }
  stages.push(
    stage(
      "cheap-link-screen",
      "passed",
      "Every configured bounded sample must replay.",
      `${screen.completedExperimentCount} experiments completed; ${screen.survivorCount} survivor(s).`,
      screen.certificateDigest,
    ),
  );
  if (screen.survivorCount === 0) {
    stages.push(
      stage(
        "generalized-compression",
        "deprioritized",
        "Requires a cheap-screen survivor.",
        "No sampled survivor exists; expensive construction is skipped.",
      ),
      stage(
        "exact-chamber-arrangement",
        "deprioritized",
        "Requires compression.",
        "No sampled survivor exists; expensive arrangement is skipped.",
      ),
    );
    return {
      stages,
      disposition: "deprioritized-no-cheap-survivor",
      nonClaims,
    };
  }

  const compression = evidence?.generalizedCompression;
  if (compression === undefined) {
    stages.push(
      stage(
        "generalized-compression",
        "ready",
        "Construct and replay rooted cells, full spherical fibres, and face compatibility.",
        "A cheap-screen survivor passed the promotion gate.",
      ),
      stage(
        "exact-chamber-arrangement",
        "blocked",
        "Requires a replayed generalized compression.",
        "Compression has not been built.",
      ),
    );
    return {
      stages,
      disposition: "ready-for-generalized-compression",
      nonClaims,
    };
  }
  if (
    compression.actionDigest !== action.actionDigest ||
    compression.h1CertificateDigest !== h1.certificateDigest ||
    compression.screenCertificateDigest !== screen.certificateDigest
  ) {
    throw new Error(
      "Compression evidence is not bound to the action, H1, and screen certificates.",
    );
  }
  if (
    compression.stageCertificate.certificateDigest !==
      compression.certificateDigest ||
    compression.stageCertificate.source.cheapScreenSurvivorTrialId !==
      compression.survivorTrialId
  ) {
    throw new Error(
      "Compression summary is not derived from its registered expensive-stage certificate.",
    );
  }
  if (compression.status !== "passed") {
    stages.push(
      stage(
        "generalized-compression",
        compression.status,
        "Exact generalized-compression replay is mandatory.",
        compression.note ?? `Compression ended ${compression.status}.`,
        compression.certificateDigest,
      ),
      stage(
        "exact-chamber-arrangement",
        "blocked",
        "Requires a passed compression.",
        "Compression gate did not pass.",
      ),
    );
    return {
      stages,
      disposition:
        compression.status === "failed" ? "stage-failed" : "stage-incomplete",
      nonClaims,
    };
  }
  if (!compression.replayPassed) {
    throw new Error("Passed generalized-compression evidence failed replay.");
  }
  stages.push(
    stage(
      "generalized-compression",
      "passed",
      "Exact generalized-compression replay is mandatory.",
      "Rooted cells, spherical fibres, and face maps replayed.",
      compression.certificateDigest,
    ),
  );

  const arrangement = evidence?.exactArrangement;
  if (arrangement === undefined) {
    stages.push(
      stage(
        "exact-chamber-arrangement",
        "ready",
        "Enumerate the full integral height-difference arrangement and all realizable faces.",
        "Compression passed; the expensive exact arrangement is now authorized.",
      ),
    );
    return { stages, disposition: "ready-for-exact-arrangement", nonClaims };
  }
  if (
    arrangement.compressionCertificateDigest !== compression.certificateDigest
  ) {
    throw new Error(
      "Arrangement evidence is not bound to the compression certificate.",
    );
  }
  if (arrangement.status !== "passed") {
    stages.push(
      stage(
        "exact-chamber-arrangement",
        arrangement.status,
        "The exact arrangement must replay completely.",
        arrangement.note ?? `Arrangement ended ${arrangement.status}.`,
        arrangement.certificateDigest,
      ),
    );
    return {
      stages,
      disposition:
        arrangement.status === "failed" ? "stage-failed" : "stage-incomplete",
      nonClaims,
    };
  }
  if (
    !arrangement.replayPassed ||
    !Number.isSafeInteger(arrangement.survivorCount) ||
    (arrangement.survivorCount ?? -1) < 0
  ) {
    throw new Error(
      "Passed arrangement evidence must replay and report an exact survivor count.",
    );
  }
  stages.push(
    stage(
      "exact-chamber-arrangement",
      "passed",
      "The exact arrangement must replay completely.",
      `Exact arrangement completed with ${arrangement.survivorCount} survivor(s).`,
      arrangement.certificateDigest,
    ),
  );
  return {
    stages,
    disposition:
      arrangement.survivorCount === 0
        ? "exact-arrangement-no-survivor"
        : "exact-arrangement-survivor",
    nonClaims,
  };
}

function recordForTarget(
  definition: CompactTargetDefinition,
  source: CompactTargetSourceInput,
  evidence: CompactTargetEvidence | undefined,
): CompactTargetRecord {
  const system = parseCoxeterSystemInput(source.input);
  requireSourceCertification(system, definition.id);
  if (
    source.id !== definition.id ||
    source.path.replaceAll("\\", "/") !== definition.sourcePath
  ) {
    throw new Error(
      `Source binding for ${definition.id} does not match the portfolio definition.`,
    );
  }
  if (
    source.bytesSha256 !== definition.expectedBytesSha256 ||
    canonicalSha256(system) !== definition.expectedCanonicalInputSha256
  ) {
    throw new Error(
      `${definition.id} differs from the exact reviewed source snapshot; rerun its source checker and explicitly update the portfolio binding before promotion.`,
    );
  }
  const compressionEvidence = evidence?.generalizedCompression;
  const arrangementEvidence = evidence?.exactArrangement;
  if (
    (compressionEvidence === undefined) !==
      (arrangementEvidence === undefined) ||
    (compressionEvidence !== undefined &&
      (compressionEvidence.stageCertificate?.kind !==
        "generic-compact-action-expensive-stage" ||
        compressionEvidence.stageCertificate.certificateDigest !==
          compressionEvidence.certificateDigest))
  ) {
    throw new Error(
      `${definition.id} contains compression or arrangement evidence without a registered exact artifact replayer.`,
    );
  }
  const actionEvidence = evidence?.torsionFree;
  if (evidence !== undefined && actionEvidence === undefined) {
    throw new Error(
      `${definition.id} evidence has no torsion-free stage outcome.`,
    );
  }
  if (
    actionEvidence?.status !== undefined &&
    actionEvidence.status !== "passed"
  ) {
    if (
      evidence?.h1Wall !== undefined ||
      evidence?.cheapScreen !== undefined ||
      evidence?.generalizedCompression !== undefined ||
      evidence?.exactArrangement !== undefined
    ) {
      throw new Error(
        `${definition.id} cannot attach post-action evidence to a non-passed discovery outcome.`,
      );
    }
    if (actionEvidence.discoveryOutcome === undefined) {
      throw new Error(
        `${definition.id} non-passed discovery evidence lacks its raw source-bound outcome.`,
      );
    }
    const rebuilt = nonPassedCompactDiscoveryEvidence(
      definition.id,
      source,
      actionEvidence.discoveryOutcome.rawArtifact,
    );
    if (
      canonicalSha256(actionEvidence) !== canonicalSha256(rebuilt.torsionFree)
    ) {
      throw new Error(
        `${definition.id} non-passed discovery evidence failed exact reconstruction.`,
      );
    }
  } else if (actionEvidence?.discoveryOutcome !== undefined) {
    throw new Error(
      `${definition.id} passed action evidence cannot contain a non-passed discovery outcome.`,
    );
  }
  const plan = planSphericalSpecialSubgroups(system, {
    maxRankForExhaustiveEnumeration: system.rank,
    maxSubsetsToCheck: 2 ** system.rank,
  });
  if (plan.status !== "complete") {
    throw new Error(`${definition.id} spherical planning was not exhaustive.`);
  }
  const capacityAudit = auditCompactExpensiveStageCapacity(
    system,
    definition.id,
  );
  if (capacityAudit.status !== "passed") {
    throw new Error(
      `${definition.id} exceeds the registered expensive-stage capacity: ${capacityAudit.errors.join(" ")}`,
    );
  }
  if (actionEvidence?.status === "passed") {
    if (
      actionEvidence.candidate === undefined ||
      actionEvidence.certificate === undefined ||
      actionEvidence.discoveryOutcome !== undefined
    ) {
      throw new Error(
        `${definition.id} passed action evidence lacks its materialized action and exact certificate.`,
      );
    }
    const replayedCertificate = certifyTorsionFreeAction(
      system,
      actionEvidence.candidate,
      plan,
      { maxSphericalSubgroupElements: 100_000, maxWitnesses: 8192 },
    );
    const rebuiltActionDigest = actionDigest(actionEvidence.candidate);
    if (
      replayedCertificate.status !== "passed" ||
      actionEvidence.degree !== actionEvidence.candidate.index ||
      actionEvidence.actionDigest !== rebuiltActionDigest ||
      actionEvidence.certificateDigest !==
        canonicalSha256(replayedCertificate) ||
      canonicalSha256(actionEvidence.certificate) !==
        canonicalSha256(replayedCertificate)
    ) {
      throw new Error(
        `${definition.id} torsion-free action failed exact action-rooted replay.`,
      );
    }
    const postActionReplay = replayCompactPostActionEvidence(
      system,
      {
        candidate: actionEvidence.candidate,
        certificate: replayedCertificate,
      },
      {
        h1Wall: evidence?.h1Wall,
        cheapScreen: evidence?.cheapScreen,
        generalizedCompression: evidence?.generalizedCompression,
        exactArrangement: evidence?.exactArrangement,
      },
    );
    if (postActionReplay.status !== "passed") {
      throw new Error(
        `${definition.id} post-action evidence failed action-rooted replay: ${postActionReplay.errors.join(" ")}`,
      );
    }
  }
  const lowerBound = computeTorsionFreeIndexLowerBound(plan);
  const divisor = exactIntegerToBigInt(lowerBound.value);
  const orders = plan.sphericalSubgroups.map((subgroup) =>
    exactIntegerToBigInt(subgroup.order),
  );
  const countsByRank: Record<string, number> = {};
  let maximumOrder = 1n;
  for (const subgroup of plan.sphericalSubgroups) {
    countsByRank[String(subgroup.rank)] =
      (countsByRank[String(subgroup.rank)] ?? 0) + 1;
    const order = exactIntegerToBigInt(subgroup.order);
    if (order > maximumOrder) maximumOrder = order;
  }
  const components = oddCoxeterComponents(system);
  const stages = evaluateStages(divisor, evidence);
  const screenExperimentCount = REQUIRED_CHEAP_SCREEN_EXPERIMENTS;

  return {
    id: definition.id,
    priority: definition.priority,
    role: definition.role,
    rationale: definition.rationale,
    source: {
      path: definition.sourcePath,
      bytesSha256: source.bytesSha256,
      canonicalInputSha256: canonicalSha256(system),
      name: system.name,
      rank: system.rank,
      dimension: system.geometry?.dimension ?? -1,
      dataStatus: system.dataStatus ?? "unspecified",
      certificateStatus: system.certificate?.status ?? "missing",
    },
    sphericalPlan: {
      status: "complete",
      nonemptyTypeCount: plan.sphericalSubgroups.length,
      countsByRank,
      torsionFreeDegreeDivisor: divisor.toString(),
      largestSphericalOrder: maximumOrder.toString(),
      conditionalMinimumQuotientCellCount: exactCellCount(
        divisor,
        orders,
      ).toString(),
    },
    oddCoxeterGraph: {
      components,
      componentCount: components.length,
      nonzeroMod2CharacterCount: (
        2n ** BigInt(components.length) -
        1n
      ).toString(),
    },
    discovery: {
      ...definition.discovery,
      command: commandForTarget(definition),
      ...(definition.id === "makarov-p1"
        ? { p0TransferEligible: true as const }
        : {}),
    },
    cheapScreenPlan: {
      gaugeFamilies: [...CHEAP_SCREEN.gauges],
      pullingOrderFamilies: [...CHEAP_SCREEN.pullingOrders],
      subdivisionFamilies: [...CHEAP_SCREEN.subdivisions],
      tiePolarities: [-1, 1],
      plannedConfigurationFamilyCount: screenExperimentCount,
      plannedDirectedRunCount: 2 * screenExperimentCount,
      executorStatus: "registered-exact-bounded-post-action",
      characterSamplingPolicy:
        "After full integral H1 exists, bind up to eight primitive standard-basis characters to exact lattice and character digests.",
      samplingPolicy:
        "The registered bounded executor materializes every listed potential, every distinct compatible global order, both supported subdivision families, both tie polarities, and exact full links at sampled original and introduced vertices.",
    },
    ...stages,
    ...(evidence ? { evidence } : {}),
  };
}

export function buildCompactActionPortfolio(
  sources: readonly CompactTargetSourceInput[],
  options: {
    generatedAt?: string;
    evidence?: Partial<Record<CompactTargetId, CompactTargetEvidence>>;
  } = {},
): CompactActionPortfolioArtifact {
  const byId = new Map(sources.map((source) => [source.id, source]));
  if (byId.size !== TARGETS.length || sources.length !== TARGETS.length) {
    throw new Error(
      "The compact portfolio requires exactly P0, P1, Tumarkin #15, and Tumarkin #04 sources.",
    );
  }
  const parsed = new Map<CompactTargetId, CoxeterSystemInput>();
  for (const definition of TARGETS) {
    const source = byId.get(definition.id);
    if (source === undefined)
      throw new Error(`Missing compact target ${definition.id}.`);
    parsed.set(definition.id, parseCoxeterSystemInput(source.input));
  }
  const double = p0P1DoubleCertificate(
    parsed.get("makarov-p0") as CoxeterSystemInput,
    parsed.get("makarov-p1") as CoxeterSystemInput,
  );
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: "compact-h5-fibering-action-portfolio" as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: "passed" as const,
    policy: {
      order: [...STAGE_ORDER],
      b1ZeroAction: "deprioritize" as const,
      expensiveConstructionRule:
        "Build neither the generalized compression nor the exact height chamber arrangement unless the preceding cheap multi-gauge/order/subdivision screen has a replayed survivor.",
      excludedTarget: "tumarkin-g12221" as const,
    },
    p0P1Double: double,
    targets: TARGETS.map((definition) =>
      recordForTarget(
        definition,
        byId.get(definition.id) as CompactTargetSourceInput,
        options.evidence?.[definition.id],
      ),
    ),
  };
  return { ...withoutHash, artifactHash: canonicalSha256(withoutHash) };
}

function assertPermutationAction(candidate: TorsionFreeActionCandidate): void {
  if (
    !Number.isSafeInteger(candidate.index) ||
    candidate.index <= 0 ||
    candidate.generatorImages.length !== 7
  ) {
    throw new Error(
      "P0 transfer requires a positive degree and exactly seven generator rows.",
    );
  }
  for (const row of candidate.generatorImages) {
    if (
      row.length !== candidate.index ||
      new Set(row).size !== candidate.index ||
      row.some(
        (value) =>
          !Number.isSafeInteger(value) || value < 0 || value >= candidate.index,
      )
    ) {
      throw new Error("P0 transfer input contains an invalid permutation row.");
    }
  }
  const reached = new Set([0]);
  const queue = [0];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const row of candidate.generatorImages) {
      const next = row[queue[cursor]];
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  if (reached.size !== candidate.index) {
    throw new Error("P0 transfer requires a transitive parent action.");
  }
}

/**
 * Restricts a P0 permutation action to the explicit index-two P1 kernel.
 * The restricted action has one or two orbits; each orbit is returned as a
 * transitive P1 candidate and must still pass the ordinary torsion-free replay.
 */
export function restrictP0ActionToP1(
  p0Action: TorsionFreeActionCandidate,
): TorsionFreeActionCandidate[] {
  assertPermutationAction(p0Action);
  const applyWord = (point: number, word: readonly number[]): number => {
    let current = point;
    for (const generator of word)
      current = p0Action.generatorImages[generator][current];
    return current;
  };
  const p1Words = [[0], [1], [2], [3], [4], [5], [6, 5, 6]] as const;
  const rows = p1Words.map((word) =>
    Array.from({ length: p0Action.index }, (_unused, point) =>
      applyWord(point, word),
    ),
  );
  const unseen = new Set(
    Array.from({ length: p0Action.index }, (_unused, point) => point),
  );
  const orbits: number[][] = [];
  while (unseen.size > 0) {
    const seed = Math.min(...unseen);
    const orbit: number[] = [];
    const queue = [seed];
    unseen.delete(seed);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const point = queue[cursor];
      orbit.push(point);
      for (const row of rows) {
        const next = row[point];
        if (unseen.delete(next)) queue.push(next);
      }
    }
    orbits.push(orbit.sort((a, b) => a - b));
  }
  if (orbits.length < 1 || orbits.length > 2) {
    throw new Error(
      `An index-two subgroup restriction produced ${orbits.length} orbits instead of one or two.`,
    );
  }
  return orbits.map((orbit, orbitIndex) => {
    const local = new Map(orbit.map((point, index) => [point, index]));
    return {
      id: `${p0Action.id}:p1-kernel-orbit-${orbitIndex}`,
      name: `P1 restriction of ${p0Action.name ?? p0Action.id}, orbit ${orbitIndex}`,
      index: orbit.length,
      generatorImages: rows.map((row) =>
        orbit.map((point) => {
          const image = local.get(row[point]);
          if (image === undefined)
            throw new Error("Restricted P1 orbit is not generator-closed.");
          return image;
        }),
      ),
      pointLabels: orbit.map(
        (point) => p0Action.pointLabels?.[point] ?? `p0:${point}`,
      ),
      backend: "exact-p0-index-two-restriction",
      backendVersion: "1.0.0",
      source: p0Action.source,
      notes: [
        `Parent action digest: ${canonicalSha256({ index: p0Action.index, generatorImages: p0Action.generatorImages })}.`,
        "P1 generators are p0,...,p5,p6*p5*p6. Exact torsion-freeness must be replayed on this orbit before acceptance.",
      ],
    };
  });
}

export const COMPACT_TARGET_DEFINITIONS = TARGETS;

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function compareUtf8(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const limit = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < limit; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) {
      return leftBytes[index] - rightBytes[index];
    }
  }
  return leftBytes.length - rightBytes.length;
}

function portableDiscoveryValue(value: unknown): unknown {
  if (value === null) return ["null"];
  if (typeof value === "boolean") return ["boolean", value];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Discovery artifacts cannot contain non-finite numbers.");
    }
    if (Number.isSafeInteger(value)) {
      return ["number", `safe-integer:${String(value === 0 ? 0 : value)}`];
    }
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, false);
    return [
      "number",
      `binary64:${[...bytes]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")}`,
    ];
  }
  if (Array.isArray(value)) {
    return ["array", value.map((entry) => portableDiscoveryValue(entry))];
  }
  const record = objectRecord(value, "Portable discovery-hash value");
  return [
    "object",
    Object.keys(record)
      .sort(compareUtf8)
      .map((key) => [key, portableDiscoveryValue(record[key])]),
  ];
}

/** Cross-language seal shared with torsion_free_discovery.py. */
export function compactDiscoveryPortableSha256(value: unknown): string {
  return canonicalSha256(portableDiscoveryValue(value));
}

function normalizedDiscoveryOutcomeStatus(
  rawStatus: unknown,
): "failed" | "incomplete" | "timed-out" {
  if (rawStatus === "failed") return "failed";
  if (rawStatus === "timeout" || rawStatus === "timed-out") {
    return "timed-out";
  }
  if (
    rawStatus === "incomplete" ||
    rawStatus === "cancelled" ||
    rawStatus === "skipped" ||
    rawStatus === "exhausted"
  ) {
    return "incomplete";
  }
  throw new Error(
    `Discovery status ${String(rawStatus)} is not a recognized non-passed outcome.`,
  );
}

/**
 * Archives a bounded discovery run that did not materialize a certified action.
 * The raw artifact remains embedded so replay can reconstruct every binding;
 * this record can only block the next stage, never promote it.
 */
export function nonPassedCompactDiscoveryEvidence(
  targetId: CompactTargetId,
  source: CompactTargetSourceInput,
  rawArtifactInput: unknown,
): CompactTargetEvidence {
  const definition = TARGETS.find((candidate) => candidate.id === targetId);
  if (definition === undefined) {
    throw new Error(`Unknown compact target ${targetId}.`);
  }
  if (
    source.id !== targetId ||
    source.path.replaceAll("\\", "/") !== definition.sourcePath ||
    source.bytesSha256 !== definition.expectedBytesSha256
  ) {
    throw new Error(`${targetId} discovery outcome has a stale target source.`);
  }
  const sourceSystem = parseCoxeterSystemInput(source.input);
  const canonicalInputSha256 = canonicalSha256(sourceSystem);
  if (canonicalInputSha256 !== definition.expectedCanonicalInputSha256) {
    throw new Error(`${targetId} discovery outcome has a stale target input.`);
  }

  const rawArtifact = objectRecord(
    rawArtifactInput,
    `${targetId} raw discovery artifact`,
  );
  if (
    rawArtifact.schemaVersion !== 1 ||
    rawArtifact.artifactType !== "coxeter-torsion-free-discovery"
  ) {
    throw new Error(
      `${targetId} discovery artifact envelope is not recognized.`,
    );
  }
  const rawStatus = rawArtifact.status;
  const normalizedStatus = normalizedDiscoveryOutcomeStatus(rawStatus);
  if (typeof rawStatus !== "string") {
    throw new Error(`${targetId} discovery artifact has no string status.`);
  }
  if (rawArtifact.inputHash !== source.bytesSha256) {
    throw new Error(
      `${targetId} discovery artifact is not bound to the exact source bytes.`,
    );
  }
  const rawSource = parseCoxeterSystemInput(rawArtifact.sourceSystem);
  if (canonicalSha256(rawSource) !== canonicalInputSha256) {
    throw new Error(
      `${targetId} discovery artifact names a different Coxeter system.`,
    );
  }

  const rawBounds = objectRecord(
    rawArtifact.bounds,
    `${targetId} discovery bounds`,
  );
  const requiredBounds: ReadonlyArray<readonly [string, number]> = [
    ["maxIndex", definition.discovery.maxIndex],
    ["maxCandidates", definition.discovery.maxCandidates],
    ["maxModuleCandidates", definition.discovery.maxModuleCandidates],
    ["maxCompositeModules", definition.discovery.maxCompositeModules],
    ["maxCompositeCombinations", definition.discovery.maxCompositeCombinations],
    ["maxCongruencePrime", definition.discovery.maxCongruencePrime],
    ["maxCongruenceImageOrder", definition.discovery.maxCongruenceImageOrder],
    ["maxWitnesses", definition.discovery.maxWitnesses],
    ["maxSphericalOrder", definition.discovery.maxSphericalOrder],
    ["maxSubsets", definition.discovery.maxSubsets],
    ["timeoutSeconds", definition.discovery.timeoutSeconds],
    ["maxLowIndexFallback", DISCOVERY_RUNTIME_BOUNDS.maxLowIndexFallback],
    ["maxMemoryBytes", DISCOVERY_RUNTIME_BOUNDS.maxMemoryBytes],
    ["lightWorkers", DISCOVERY_RUNTIME_BOUNDS.lightWorkers],
    ["heavyWorkers", DISCOVERY_RUNTIME_BOUNDS.heavyWorkers],
  ];
  for (const [key, expected] of requiredBounds) {
    if (rawBounds[key] !== expected) {
      throw new Error(
        `${targetId} discovery artifact changed configured bound ${key}.`,
      );
    }
  }

  const provenance = objectRecord(
    rawArtifact.provenance,
    `${targetId} discovery provenance`,
  );
  const producerArtifactHash = provenance.artifactHash;
  if (
    typeof producerArtifactHash !== "string" ||
    !/^[0-9a-f]{64}$/u.test(producerArtifactHash)
  ) {
    throw new Error(
      `${targetId} discovery artifact has no producer SHA-256 seal.`,
    );
  }
  const portableArtifactHash = provenance.portableArtifactHash;
  if (
    typeof portableArtifactHash !== "string" ||
    !/^[0-9a-f]{64}$/u.test(portableArtifactHash)
  ) {
    throw new Error(
      `${targetId} discovery artifact has no portable producer SHA-256 seal.`,
    );
  }
  const producerPayload = structuredClone(rawArtifact);
  const producerProvenance = objectRecord(
    producerPayload.provenance,
    `${targetId} discovery provenance copy`,
  );
  delete producerProvenance.portableArtifactHash;
  if (
    compactDiscoveryPortableSha256(producerPayload) !== portableArtifactHash
  ) {
    throw new Error(
      `${targetId} discovery artifact failed its producer SHA-256 seal.`,
    );
  }
  if (provenance.inputHash !== source.bytesSha256) {
    throw new Error(
      `${targetId} discovery provenance names different source bytes.`,
    );
  }
  if (
    typeof provenance.backend !== "string" ||
    !DISCOVERY_PRODUCER.backends.has(provenance.backend)
  ) {
    throw new Error(`${targetId} discovery provenance names another backend.`);
  }
  if (provenance.backendVersion !== DISCOVERY_PRODUCER.backendVersion) {
    throw new Error(
      `${targetId} discovery provenance has an unexpected backend version.`,
    );
  }
  if (
    typeof provenance.command !== "string" ||
    !DISCOVERY_PRODUCER.commands.has(provenance.command)
  ) {
    throw new Error(`${targetId} discovery provenance names another command.`);
  }
  if (
    typeof provenance.runtime !== "string" ||
    provenance.runtime.length === 0
  ) {
    throw new Error(`${targetId} discovery provenance has no runtime label.`);
  }

  const configuredCommandDigest = canonicalSha256(commandForTarget(definition));
  const targetBindingDigest = canonicalSha256({
    targetId,
    sourcePath: definition.sourcePath,
    sourceBytesSha256: source.bytesSha256,
    canonicalInputSha256,
    configuredCommandDigest,
  });
  const rawArtifactDigest = canonicalSha256(rawArtifact);
  const withoutOutcomeDigest = {
    schemaVersion: 1 as const,
    kind: "compact-torsion-free-discovery-outcome" as const,
    targetId,
    sourceBinding: {
      path: definition.sourcePath,
      bytesSha256: source.bytesSha256,
      canonicalInputSha256,
    },
    targetBindingDigest,
    configuredCommandDigest,
    rawStatus,
    normalizedStatus,
    materializedTorsionFreeActionCertified: false as const,
    rawArtifactDigest,
    rawArtifact,
  };
  const discoveryOutcome: CompactDiscoveryOutcomeEvidence = {
    ...withoutOutcomeDigest,
    outcomeDigest: canonicalSha256(withoutOutcomeDigest),
  };
  return {
    torsionFree: {
      status: normalizedStatus,
      replayPassed: false,
      certificateDigest: discoveryOutcome.outcomeDigest,
      discoveryOutcome,
      note: `Bounded discovery returned raw status ${rawStatus}; no materialized torsion-free action was certified.`,
    },
  };
}

/** Converts a passed Python discovery artifact into the shared exact action type. */
export function actionFromCompactDiscoveryArtifact(
  artifactInput: unknown,
  id: string,
): TorsionFreeActionCandidate {
  const artifact = objectRecord(artifactInput, "Discovery artifact");
  if (
    artifact.status !== "passed" ||
    objectRecord(artifact.certificate, "Discovery certificate").status !==
      "passed"
  ) {
    throw new Error(
      "Only a passed independently certified discovery artifact can be materialized.",
    );
  }
  const finiteAction = objectRecord(artifact.finiteAction, "finiteAction");
  const degree = finiteAction.degree;
  if (!Number.isSafeInteger(degree) || (degree as number) <= 0) {
    throw new Error("finiteAction.degree must be a positive safe integer.");
  }
  const vertices = finiteAction.vertices;
  const rawRows = finiteAction.generatorActions;
  if (
    !Array.isArray(vertices) ||
    vertices.length !== degree ||
    !Array.isArray(rawRows)
  ) {
    throw new Error("finiteAction vertices or generator rows are incomplete.");
  }
  const labels = vertices.map((value, index) => {
    const vertex = objectRecord(value, `finiteAction.vertices[${index}]`);
    if (typeof vertex.id !== "string")
      throw new Error(`Vertex ${index} has no string id.`);
    return vertex.id;
  });
  const labelToPoint = new Map(labels.map((label, point) => [label, point]));
  if (labelToPoint.size !== degree)
    throw new Error("finiteAction vertex ids are not unique.");
  const indexedRows = rawRows.map((value, index) => {
    const row = objectRecord(value, `finiteAction.generatorActions[${index}]`);
    if (
      !Number.isSafeInteger(row.generator) ||
      !Array.isArray(row.images) ||
      row.images.length !== degree
    ) {
      throw new Error(`Generator action row ${index} is malformed.`);
    }
    const images = row.images.map((image, point) => {
      if (typeof image !== "string")
        throw new Error(
          `Generator row ${index}, point ${point} has no vertex-id image.`,
        );
      const target = labelToPoint.get(image);
      if (target === undefined)
        throw new Error(
          `Generator row ${index} references unknown vertex ${image}.`,
        );
      return target;
    });
    return { generator: row.generator as number, images };
  });
  indexedRows.sort((left, right) => left.generator - right.generator);
  if (indexedRows.some((row, index) => row.generator !== index)) {
    throw new Error(
      "finiteAction generator rows are not indexed consecutively from zero.",
    );
  }
  const artifactHash =
    typeof artifact.artifactHash === "string"
      ? artifact.artifactHash
      : canonicalSha256(artifact);
  return {
    id,
    name: `Materialized compact action ${id}`,
    index: degree as number,
    generatorImages: indexedRows.map((row) => row.images),
    pointLabels: labels,
    representativeWords: vertices.map((value) => {
      const word = objectRecord(
        value,
        "finiteAction vertex",
      ).representativeWord;
      return Array.isArray(word) &&
        word.every((letter) => Number.isSafeInteger(letter))
        ? (word as number[])
        : [];
    }),
    backend: "torsion-free-discovery-artifact",
    backendVersion: "1.0.0",
    source: `Discovery artifact ${artifactHash}`,
  };
}

export function replayCompactActionPortfolio(
  storedInput: unknown,
  sources: readonly CompactTargetSourceInput[],
): CompactActionPortfolioReplay {
  const checks: CompactActionPortfolioReplay["checks"] = {
    envelopeRecognized: false,
    artifactHashValid: false,
    sourceBindingsValid: false,
    exactPreflightFactsMatch: false,
    stageOrderValid: false,
  };
  const errors: string[] = [];
  try {
    const stored = objectRecord(
      storedInput,
      "Compact portfolio",
    ) as unknown as CompactActionPortfolioArtifact;
    checks.envelopeRecognized =
      stored.schemaVersion === 1 &&
      stored.kind === "compact-h5-fibering-action-portfolio" &&
      stored.status === "passed" &&
      Array.isArray(stored.targets) &&
      stored.targets.length === TARGETS.length;
    if (!checks.envelopeRecognized)
      errors.push("The compact portfolio envelope is not recognized.");
    checks.artifactHashValid =
      typeof stored.artifactHash === "string" &&
      stored.artifactHash ===
        canonicalSha256(
          Object.fromEntries(
            Object.entries(stored).filter(([key]) => key !== "artifactHash"),
          ),
        );
    if (!checks.artifactHashValid)
      errors.push("The compact portfolio artifact hash is stale.");
    const legacyActionlessPreflight =
      checks.artifactHashValid &&
      stored.artifactHash === LEGACY_ACTIONLESS_PREFLIGHT_HASH &&
      stored.targets.every((target) => target.evidence === undefined);

    const sourceById = new Map(sources.map((source) => [source.id, source]));
    checks.sourceBindingsValid =
      sourceById.size === TARGETS.length &&
      stored.targets.every((target) => {
        const source = sourceById.get(target.id);
        if (source === undefined) return false;
        const system = parseCoxeterSystemInput(source.input);
        return (
          source.path.replaceAll("\\", "/") === target.source.path &&
          source.bytesSha256 === target.source.bytesSha256 &&
          canonicalSha256(system) === target.source.canonicalInputSha256
        );
      });
    if (!checks.sourceBindingsValid)
      errors.push("A compact target source binding is stale.");

    if (checks.sourceBindingsValid) {
      const fresh = buildCompactActionPortfolio(sources, {
        generatedAt: stored.generatedAt,
      });
      const invariant = (target: CompactTargetRecord) => ({
        id: target.id,
        priority: target.priority,
        role: target.role,
        rationale: target.rationale,
        source: target.source,
        sphericalPlan: target.sphericalPlan,
        oddCoxeterGraph: target.oddCoxeterGraph,
        discovery: target.discovery,
        cheapScreenPlan: target.cheapScreenPlan,
      });
      checks.exactPreflightFactsMatch =
        legacyActionlessPreflight ||
        (canonicalSha256(stored.policy) === canonicalSha256(fresh.policy) &&
          canonicalSha256(stored.p0P1Double) ===
            canonicalSha256(fresh.p0P1Double) &&
          canonicalSha256(stored.targets.map(invariant)) ===
            canonicalSha256(fresh.targets.map(invariant)));
      if (!checks.exactPreflightFactsMatch) {
        errors.push("The exact compact-target preflight facts changed.");
      }
      let stageStateValid = true;
      for (const target of stored.targets) {
        const definition = TARGETS.find(({ id }) => id === target.id);
        const source = sourceById.get(target.id);
        const freshTarget = fresh.targets.find(({ id }) => id === target.id);
        if (!definition || !source || !freshTarget) {
          stageStateValid = false;
          continue;
        }
        if (target.evidence === undefined) {
          if (
            !legacyActionlessPreflight &&
            canonicalSha256(target) !== canonicalSha256(freshTarget)
          ) {
            stageStateValid = false;
          }
          continue;
        }
        const evidence = target.evidence;
        try {
          const rebuilt = recordForTarget(definition, source, evidence);
          if (canonicalSha256(target) !== canonicalSha256(rebuilt)) {
            throw new Error("The stored promoted stage record is stale.");
          }
        } catch (error) {
          errors.push(
            `${target.id} evidence failed exact replay: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          stageStateValid = false;
        }
      }
      checks.stageOrderValid = stageStateValid;
    }
    if (!checks.stageOrderValid) {
      errors.push("A compact target stage order is invalid.");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const uniqueErrors = [...new Set(errors)].sort();
  const status =
    uniqueErrors.length === 0 && Object.values(checks).every(Boolean)
      ? "passed"
      : "failed";
  const withoutDigest = {
    status: status as "passed" | "failed",
    checks,
    errors: uniqueErrors,
  };
  return { ...withoutDigest, replayDigest: canonicalSha256(withoutDigest) };
}
