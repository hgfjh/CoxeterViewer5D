import { parseCoxeterSystemInput } from "../coxeter/validation";
import p0Input from "../examples/compact_5_prism_makarov.json";
import p1Input from "../examples/compact_5_polytope_p1_double_makarov.json";
import p2Input from "../examples/compact_5_prism_makarov_p2.json";
import tumarkin06Input from "../examples/tumarkin_5d_8facet_g11411_06.json";
import tumarkin15Input from "../examples/tumarkin_5d_8facet_g11411_15.json";
import tumarkinG12221Input from "../examples/tumarkin_5d_8facet_g12221_01.json";
import {
  exactIntegerToBigInt,
  planSphericalSpecialSubgroups,
} from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";
import { COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS } from "./compactActionPortfolio";

export type CompactResearchTargetId =
  | "makarov-p0"
  | "makarov-p1"
  | "tumarkin-g11411-06"
  | "tumarkin-g11411-15"
  | "makarov-p2"
  | "tumarkin-g12221"
  | "h5-p7-22";

export type CompactResearchCampaignId =
  | "makarov-p0-p1-primary"
  | "tumarkin-06-15-comparison"
  | "makarov-p2-coarse-experiment"
  | "tumarkin-g12221-deferred"
  | "h5-p7-22-source-import";

export type CompactResearchTargetStatus =
  | "active-primary"
  | "bounded-comparison"
  | "experimental-coarse-import"
  | "deferred"
  | "import-required";

export type CompactResearchCampaignStatus =
  | "active"
  | "bounded"
  | "experimental"
  | "deferred"
  | "blocked-on-source";

export type CompactResearchCampaignMode =
  | "paired-finite-action"
  | "paired-finite-action-comparison"
  | "coarse-right-angled-import"
  | "deferred-finite-action"
  | "source-import";

export type CompactResearchExecutionMode =
  | "active-finite-action-queue"
  | "coarse-only"
  | "registered-deferred"
  | "source-import-gated";

export interface CompactResearchExecutionPolicy {
  mode: CompactResearchExecutionMode;
  acceptsFiniteActionEvidence: boolean;
  queueStatus: "active" | "deferred" | "not-applicable" | "blocked-on-source";
  allowedDegreeTiers: number[];
  capacityRule:
    | "current-static-expensive-stage-preflight"
    | "coarse-cellulation-only"
    | "source-replay-required";
}

export type CompactResearchCapacityBound =
  | "maxActionEntries"
  | "maxSphericalTypes"
  | "maxSphericalRankForTemplates"
  | "maxSphericalSubgroupOrder"
  | "maxRootedSourceCells"
  | "maxCompressedCells"
  | "maxFaceTypeRelations"
  | "maxRootedFaceRecords"
  | "maxTemplates"
  | "maxTemplateGerms"
  | "maxTemplateAdjacencyEntries";

export interface CompactBundledTargetFacts {
  sourcePath: string;
  /** Hash of the runtime-validated CoxeterSystemInput, not the raw JSON bytes. */
  canonicalSystemSha256: string;
  name: string;
  rank: number;
  dimension: 5;
  nonemptySphericalTypeCount: number;
  torsionFreeDegreeDivisor: string;
  largestSphericalSubgroupOrder: string;
  conditionalDavisCellCountAtDivisor: string;
  oddCoxeterComponentCount: number;
  nonzeroAmbientMod2CharacterCount: string;
}

export interface CompactResearchDegreeCapacityAudit {
  degree: number;
  status:
    | "passes-current-static-preflight"
    | "exceeds-current-static-preflight";
  workload: {
    actionEntries: number;
    sphericalTypesIncludingEmpty: number;
    rootedSourceCells: number;
    compressedCells: number;
    strictFaceTypeRelations: number;
    rootedFaceRecords: number;
    templates: number;
    cubeScaledTemplateGerms: number;
    cubeScaledTemplateAdjacencyEntries: number;
  };
  failedBounds: CompactResearchCapacityBound[];
}

interface CompactResearchAcquisitionScreenBase {
  status: "closed-within-modeled-classes";
  disposition: "custom-lane-closed-imported-actions-open";
  artifactPath: string;
  /** SHA-256 of the exact tracked JSON bytes, including formatting. */
  artifactBytesSha256: string;
  /** Canonical certificate seal stored inside the JSON artifact. */
  certificateSha256: string;
  sourcePath: string;
  sourceBytesSha256: string;
  sourceCanonicalSystemSha256: string;
  acceptsImportedFiniteActionEvidence: true;
  claimBoundary: string;
}

export interface MakarovH4ProjectionAcquisitionScreen extends CompactResearchAcquisitionScreenBase {
  id: "makarov-h4-projection-obstruction";
  artifactType: "makarov-h4-projection-obstruction";
  targetFamily: "W(H4) x SmallGroup(q,id)";
  canonicalFirstProjection: true;
  cofactorOrders: [2, 4, 6, 8];
  eliminatedTargetCount: 10;
}

export interface TumarkinShallowAcquisitionScreen extends CompactResearchAcquisitionScreenBase {
  id: "tumarkin-06-15-shallow-split-target";
  artifactType: "tumarkin-06-15-shallow-split-target-screen";
  targetFamily: "W(H4) x C2";
  modeledAnchorRecordCount: number;
  eliminatedAnchorRecordCount: number;
}

export type CompactResearchAcquisitionScreen =
  | MakarovH4ProjectionAcquisitionScreen
  | TumarkinShallowAcquisitionScreen;

type AcquisitionScreenWithoutCanonicalSource<T> = T extends unknown
  ? Omit<T, "sourceCanonicalSystemSha256">
  : never;

type CompactResearchAcquisitionScreenDefinition =
  AcquisitionScreenWithoutCanonicalSource<CompactResearchAcquisitionScreen>;

export interface CompactResearchTarget {
  id: CompactResearchTargetId;
  label: string;
  campaignId: CompactResearchCampaignId;
  status: CompactResearchTargetStatus;
  role:
    | "primary-presentation"
    | "index-two-companion"
    | "comparison-peer"
    | "coarse-structural-experiment"
    | "deferred-contrast"
    | "unverified-placeholder";
  sourceStatus: "bundled-certified" | "import-required";
  /** Duplicated at target level so proof consumers need not narrow facts first. */
  canonicalSystemSha256: string | null;
  executionPolicy: CompactResearchExecutionPolicy;
  facts: CompactBundledTargetFacts | null;
  /**
   * Tiers that pass the current static expensive-stage audit. They are runnable
   * only when executionPolicy.queueStatus is `active`.
   */
  actionDegreeTiers: number[];
  /** Candidate tiers are retained here even when a failed audit keeps them out of the queue. */
  degreeCapacityAudits: CompactResearchDegreeCapacityAudit[];
  acquisitionScreens: CompactResearchAcquisitionScreen[];
  notes: string[];
}

export interface CompactResearchCampaign {
  id: CompactResearchCampaignId;
  order: number;
  label: string;
  status: CompactResearchCampaignStatus;
  mode: CompactResearchCampaignMode;
  targetIds: CompactResearchTargetId[];
  notes: string[];
}

interface BundledTargetDefinition {
  id: Exclude<CompactResearchTargetId, "h5-p7-22">;
  label: string;
  campaignId: CompactResearchCampaignId;
  status: Exclude<CompactResearchTargetStatus, "import-required">;
  executionMode: Exclude<CompactResearchExecutionMode, "source-import-gated">;
  role: Exclude<CompactResearchTarget["role"], "unverified-placeholder">;
  sourcePath: string;
  input: unknown;
  degreeMultipliers: number[];
  acquisitionScreens?: CompactResearchAcquisitionScreenDefinition[];
  notes: string[];
}

interface BundledTargetAnalysis {
  system: CoxeterSystemInput;
  facts: CompactBundledTargetFacts;
  sphericalOrders: bigint[];
  strictFaceTypeRelations: number;
}

const CUBE_STREAM_CAPACITY_CALIBRATION = {
  degree: 34_560,
  germOccurrences: 4_467_168,
  adjacencyEntriesPerGerm: 10,
} as const;

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function lcm(left: bigint, right: bigint): bigint {
  if (left === 0n || right === 0n) return 0n;
  return (left / gcd(left, right)) * right;
}

function oddCoxeterComponentCount(system: CoxeterSystemInput): number {
  const unseen = new Set(
    Array.from({ length: system.rank }, (_, generator) => generator),
  );
  let count = 0;
  while (unseen.size > 0) {
    count += 1;
    const queue = [Math.min(...unseen)];
    unseen.delete(queue[0]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const generator = queue[cursor];
      for (let other = 0; other < system.rank; other += 1) {
        const exponent = system.coxeterMatrix[generator][other];
        if (
          typeof exponent === "number" &&
          exponent >= 3 &&
          exponent % 2 === 1 &&
          unseen.has(other)
        ) {
          unseen.delete(other);
          queue.push(other);
        }
      }
    }
  }
  return count;
}

function analyzeBundledTarget(
  input: unknown,
  sourcePath: string,
): BundledTargetAnalysis {
  const system = parseCoxeterSystemInput(input);
  if (
    system.dataStatus !== "certified" ||
    system.certificate?.status !== "passed" ||
    system.geometry?.dimension !== 5
  ) {
    throw new Error(`${sourcePath} is not a certified compact H5 source.`);
  }
  const plan = planSphericalSpecialSubgroups(system, {
    maxRankForExhaustiveEnumeration: system.rank,
    maxSubsetsToCheck: 2 ** system.rank,
  });
  if (plan.status !== "complete") {
    throw new Error(`${sourcePath} has no complete spherical-subgroup plan.`);
  }
  const sphericalOrders = plan.sphericalSubgroups.map((subgroup) =>
    exactIntegerToBigInt(subgroup.order),
  );
  const divisor = sphericalOrders.reduce(lcm, 1n);
  const conditionalCells = sphericalOrders.reduce(
    (count, order) => count + divisor / order,
    divisor,
  );
  const sphericalSets = [
    [] as number[],
    ...plan.sphericalSubgroups.map((subgroup) => [...subgroup.generators]),
  ];
  const strictFaceTypeRelations = sphericalSets.reduce(
    (count, coface) =>
      count +
      sphericalSets.filter(
        (face) =>
          face.length < coface.length &&
          face.every((generator) => coface.includes(generator)),
      ).length,
    0,
  );
  const oddComponents = oddCoxeterComponentCount(system);
  return {
    system,
    sphericalOrders,
    strictFaceTypeRelations,
    facts: {
      sourcePath,
      canonicalSystemSha256: canonicalSha256(system),
      name: system.name,
      rank: system.rank,
      dimension: 5,
      nonemptySphericalTypeCount: plan.sphericalSubgroups.length,
      torsionFreeDegreeDivisor: divisor.toString(),
      largestSphericalSubgroupOrder: sphericalOrders
        .reduce((largest, order) => (order > largest ? order : largest), 1n)
        .toString(),
      conditionalDavisCellCountAtDivisor: conditionalCells.toString(),
      oddCoxeterComponentCount: oddComponents,
      nonzeroAmbientMod2CharacterCount: (
        (1n << BigInt(oddComponents)) -
        1n
      ).toString(),
    },
  };
}

function auditDegreeCapacity(
  analysis: BundledTargetAnalysis,
  degree: number,
): CompactResearchDegreeCapacityAudit {
  const divisor = BigInt(analysis.facts.torsionFreeDegreeDivisor);
  const degreeBigInt = BigInt(degree);
  if (degreeBigInt % divisor !== 0n) {
    throw new Error(
      `Degree ${degree} is not divisible by the necessary divisor ${divisor}.`,
    );
  }
  const compressedCells = analysis.sphericalOrders.reduce(
    (count, order) => count + degreeBigInt / order,
    degreeBigInt,
  );
  const sphericalTypesIncludingEmpty =
    analysis.facts.nonemptySphericalTypeCount + 1;
  const cubeScaledTemplateGerms = Math.ceil(
    (CUBE_STREAM_CAPACITY_CALIBRATION.germOccurrences * degree) /
      CUBE_STREAM_CAPACITY_CALIBRATION.degree,
  );
  const workload: CompactResearchDegreeCapacityAudit["workload"] = {
    actionEntries: degree * analysis.system.rank,
    sphericalTypesIncludingEmpty,
    rootedSourceCells: degree * sphericalTypesIncludingEmpty,
    compressedCells: Number(compressedCells),
    strictFaceTypeRelations: analysis.strictFaceTypeRelations,
    rootedFaceRecords: degree * analysis.strictFaceTypeRelations,
    templates: degree,
    cubeScaledTemplateGerms,
    cubeScaledTemplateAdjacencyEntries:
      cubeScaledTemplateGerms *
      CUBE_STREAM_CAPACITY_CALIBRATION.adjacencyEntriesPerGerm,
  };
  const largestSphericalOrder = Number(
    analysis.facts.largestSphericalSubgroupOrder,
  );
  const checks: Array<
    [CompactResearchCapacityBound, number, number | undefined]
  > = [
    [
      "maxActionEntries",
      workload.actionEntries,
      COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS.maxActionEntries,
    ],
    [
      "maxSphericalTypes",
      workload.sphericalTypesIncludingEmpty,
      COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS.maxSphericalTypes,
    ],
    [
      "maxSphericalRankForTemplates",
      analysis.system.rank,
      COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS.maxSphericalRankForTemplates,
    ],
    [
      "maxSphericalSubgroupOrder",
      largestSphericalOrder,
      COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS.maxSphericalSubgroupOrder,
    ],
    [
      "maxRootedSourceCells",
      workload.rootedSourceCells,
      COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS.maxRootedSourceCells,
    ],
    [
      "maxCompressedCells",
      workload.compressedCells,
      COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS.maxCompressedCells,
    ],
    [
      "maxFaceTypeRelations",
      workload.strictFaceTypeRelations,
      COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS.maxFaceTypeRelations,
    ],
    [
      "maxRootedFaceRecords",
      workload.rootedFaceRecords,
      COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS.maxRootedFaceRecords,
    ],
    [
      "maxTemplates",
      workload.templates,
      COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS.maxTemplates,
    ],
    [
      "maxTemplateGerms",
      workload.cubeScaledTemplateGerms,
      COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS.maxTemplateGerms,
    ],
    [
      "maxTemplateAdjacencyEntries",
      workload.cubeScaledTemplateAdjacencyEntries,
      COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS.maxTemplateAdjacencyEntries,
    ],
  ];
  const failedBounds = checks
    .filter(
      ([, required, available]) =>
        available === undefined || required > available,
    )
    .map(([name]) => name);
  return {
    degree,
    status:
      failedBounds.length === 0
        ? "passes-current-static-preflight"
        : "exceeds-current-static-preflight",
    workload,
    failedBounds,
  };
}

function executionPolicyFor(
  mode: CompactResearchExecutionMode,
  capacityCompatibleTiers: number[],
): CompactResearchExecutionPolicy {
  switch (mode) {
    case "active-finite-action-queue":
      return {
        mode,
        acceptsFiniteActionEvidence: true,
        queueStatus: "active",
        allowedDegreeTiers: [...capacityCompatibleTiers],
        capacityRule: "current-static-expensive-stage-preflight",
      };
    case "registered-deferred":
      return {
        mode,
        acceptsFiniteActionEvidence: true,
        queueStatus: "deferred",
        allowedDegreeTiers: [...capacityCompatibleTiers],
        capacityRule: "current-static-expensive-stage-preflight",
      };
    case "coarse-only":
      return {
        mode,
        acceptsFiniteActionEvidence: false,
        queueStatus: "not-applicable",
        allowedDegreeTiers: [],
        capacityRule: "coarse-cellulation-only",
      };
    case "source-import-gated":
      return {
        mode,
        acceptsFiniteActionEvidence: false,
        queueStatus: "blocked-on-source",
        allowedDegreeTiers: [],
        capacityRule: "source-replay-required",
      };
  }
}

function buildBundledTarget(
  definition: BundledTargetDefinition,
): CompactResearchTarget {
  const analysis = analyzeBundledTarget(
    definition.input,
    definition.sourcePath,
  );
  const divisor = Number(analysis.facts.torsionFreeDegreeDivisor);
  const degreeCapacityAudits = definition.degreeMultipliers.map((multiplier) =>
    auditDegreeCapacity(analysis, divisor * multiplier),
  );
  const actionDegreeTiers = degreeCapacityAudits
    .filter((audit) => audit.status === "passes-current-static-preflight")
    .map((audit) => audit.degree);
  return {
    id: definition.id,
    label: definition.label,
    campaignId: definition.campaignId,
    status: definition.status,
    role: definition.role,
    sourceStatus: "bundled-certified",
    canonicalSystemSha256: analysis.facts.canonicalSystemSha256,
    executionPolicy: executionPolicyFor(
      definition.executionMode,
      actionDegreeTiers,
    ),
    facts: analysis.facts,
    actionDegreeTiers,
    degreeCapacityAudits,
    acquisitionScreens: (definition.acquisitionScreens ?? []).map(
      (screen): CompactResearchAcquisitionScreen =>
        ({
          ...screen,
          sourceCanonicalSystemSha256: analysis.facts.canonicalSystemSha256,
        }) as CompactResearchAcquisitionScreen,
    ),
    notes: [...definition.notes],
  };
}

const BUNDLED_TARGET_DEFINITIONS: BundledTargetDefinition[] = [
  {
    id: "makarov-p0",
    label: "Makarov P0",
    campaignId: "makarov-p0-p1-primary",
    status: "active-primary",
    executionMode: "active-finite-action-queue",
    role: "primary-presentation",
    sourcePath: "public/examples/compact_5_prism_makarov.json",
    input: p0Input,
    degreeMultipliers: [1, 2, 3, 4],
    acquisitionScreens: [
      {
        id: "makarov-h4-projection-obstruction",
        status: "closed-within-modeled-classes",
        disposition: "custom-lane-closed-imported-actions-open",
        artifactPath:
          "scripts/certificates/torsion-free/makarov_h4_projection_obstruction.json",
        artifactType: "makarov-h4-projection-obstruction",
        artifactBytesSha256:
          "c71da1799234078b8be01efcd5f917d6622ffd0a21772a288e4e37e9468c7025",
        certificateSha256:
          "1aa9561ed47767e7bd152f4899fa6716112ad98b2d810dc019f347fbebb61508",
        sourcePath: "public/examples/compact_5_prism_makarov.json",
        sourceBytesSha256:
          "6cb5c7bd535e654e83dc87d383fd9aba5db61fa491edaeff634f792aea5bc221",
        targetFamily: "W(H4) x SmallGroup(q,id)",
        canonicalFirstProjection: true,
        cofactorOrders: [2, 4, 6, 8],
        eliminatedTargetCount: 10,
        acceptsImportedFiniteActionEvidence: true,
        claimBoundary:
          "Closes only the canonical first H4 projection in the ten displayed split direct targets; noncanonical H4 embeddings, nonsplit targets, nonnormal actions, and imported finite actions remain open.",
      },
    ],
    notes: [
      "Treat P0 and its index-two P1 subgroup as one commensurability campaign.",
      "The canonical-first H4 direct-product lane is closed; externally supplied and nonnormal actions remain admissible.",
    ],
  },
  {
    id: "makarov-p1",
    label: "Makarov P1 (double of P0)",
    campaignId: "makarov-p0-p1-primary",
    status: "active-primary",
    executionMode: "active-finite-action-queue",
    role: "index-two-companion",
    sourcePath: "public/examples/compact_5_polytope_p1_double_makarov.json",
    input: p1Input,
    degreeMultipliers: [1, 2, 3, 4],
    acquisitionScreens: [
      {
        id: "makarov-h4-projection-obstruction",
        status: "closed-within-modeled-classes",
        disposition: "custom-lane-closed-imported-actions-open",
        artifactPath:
          "scripts/certificates/torsion-free/makarov_h4_projection_obstruction.json",
        artifactType: "makarov-h4-projection-obstruction",
        artifactBytesSha256:
          "c71da1799234078b8be01efcd5f917d6622ffd0a21772a288e4e37e9468c7025",
        certificateSha256:
          "1aa9561ed47767e7bd152f4899fa6716112ad98b2d810dc019f347fbebb61508",
        sourcePath: "public/examples/compact_5_polytope_p1_double_makarov.json",
        sourceBytesSha256:
          "2f5acbaef9bfa5423a38e6052eb1bd25929b41b9c8430c179e49e0993bdcaf31",
        targetFamily: "W(H4) x SmallGroup(q,id)",
        canonicalFirstProjection: true,
        cofactorOrders: [2, 4, 6, 8],
        eliminatedTargetCount: 10,
        acceptsImportedFiniteActionEvidence: true,
        claimBoundary:
          "Closes only the canonical first H4 projection in the ten displayed split direct targets; noncanonical H4 embeddings, nonsplit targets, nonnormal actions, and imported finite actions remain open.",
      },
    ],
    notes: [
      "Test every restricted P0 action on each P1 orbit and retain the alternative P1 cellulation.",
      "The canonical-first H4 direct-product lane is closed; externally supplied and nonnormal actions remain admissible.",
    ],
  },
  {
    id: "tumarkin-g11411-06",
    label: "Tumarkin G11411 #06",
    campaignId: "tumarkin-06-15-comparison",
    status: "bounded-comparison",
    executionMode: "active-finite-action-queue",
    role: "comparison-peer",
    sourcePath: "public/examples/tumarkin_5d_8facet_g11411_06.json",
    input: tumarkin06Input,
    degreeMultipliers: [1, 2],
    acquisitionScreens: [
      {
        id: "tumarkin-06-15-shallow-split-target",
        status: "closed-within-modeled-classes",
        disposition: "custom-lane-closed-imported-actions-open",
        artifactPath:
          "scripts/certificates/torsion-free/tumarkin_06_15_shallow_split_target_screen.json",
        artifactType: "tumarkin-06-15-shallow-split-target-screen",
        artifactBytesSha256:
          "bc1f85bfa236b884441fb32e5a98f4f10f16c576d0722448ad793ee5f46081c7",
        certificateSha256:
          "fc49bbfc0e42d65376f6a5a33958be8d9ffc8f60741fd6e7fcc1d78b1da77d8f",
        sourcePath: "public/examples/tumarkin_5d_8facet_g11411_06.json",
        sourceBytesSha256:
          "bf0653b04960a37d620d263b224c036e219fcfba81a9001d943232943267064b",
        targetFamily: "W(H4) x C2",
        modeledAnchorRecordCount: 32,
        eliminatedAnchorRecordCount: 32,
        acceptsImportedFiniteActionEvidence: true,
        claimBoundary:
          "Closes only the displayed split target and explicit H4 projection classes; it does not obstruct nonnormal actions, nonsplit targets, other H4 embeddings, or higher degrees.",
      },
    ],
    notes: [
      "Its slightly smaller conditional cell count is not action-level evidence of superiority over #15.",
      "The custom W(H4) x C2 shallow lane is closed; externally supplied finite actions remain admissible.",
    ],
  },
  {
    id: "tumarkin-g11411-15",
    label: "Tumarkin G11411 #15",
    campaignId: "tumarkin-06-15-comparison",
    status: "bounded-comparison",
    executionMode: "active-finite-action-queue",
    role: "comparison-peer",
    sourcePath: "public/examples/tumarkin_5d_8facet_g11411_15.json",
    input: tumarkin15Input,
    degreeMultipliers: [1, 2],
    acquisitionScreens: [
      {
        id: "tumarkin-06-15-shallow-split-target",
        status: "closed-within-modeled-classes",
        disposition: "custom-lane-closed-imported-actions-open",
        artifactPath:
          "scripts/certificates/torsion-free/tumarkin_06_15_shallow_split_target_screen.json",
        artifactType: "tumarkin-06-15-shallow-split-target-screen",
        artifactBytesSha256:
          "bc1f85bfa236b884441fb32e5a98f4f10f16c576d0722448ad793ee5f46081c7",
        certificateSha256:
          "fc49bbfc0e42d65376f6a5a33958be8d9ffc8f60741fd6e7fcc1d78b1da77d8f",
        sourcePath: "public/examples/tumarkin_5d_8facet_g11411_15.json",
        sourceBytesSha256:
          "8955e1c37c4993b9af271d84a796b0551e3e21aedfeed8341319f304cce7bdac",
        targetFamily: "W(H4) x C2",
        modeledAnchorRecordCount: 32,
        eliminatedAnchorRecordCount: 32,
        acceptsImportedFiniteActionEvidence: true,
        claimBoundary:
          "Closes only the displayed split target and explicit H4 projection classes; it does not obstruct nonnormal actions, nonsplit targets, other H4 embeddings, or higher degrees.",
      },
    ],
    notes: [
      "Its lower stored Coxeter growth and #06's lower cell count are competing weak priors.",
      "The custom W(H4) x C2 shallow lane is closed; externally supplied finite actions remain admissible.",
    ],
  },
  {
    id: "makarov-p2",
    label: "Makarov P2 coarse right-angled branch",
    campaignId: "makarov-p2-coarse-experiment",
    status: "experimental-coarse-import",
    executionMode: "coarse-only",
    role: "coarse-structural-experiment",
    sourcePath: "public/examples/compact_5_prism_makarov_p2.json",
    input: p2Input,
    degreeMultipliers: [],
    notes: [
      "The coarse incidence/coloring import is validated, its split b1>=144 gate is positive, and two exact primitive cocycles with Q-linearly independent classes are bound; this branch does not queue a raw P2 action.",
      "The same cheap identity-first factored Track B gauge rejects both primitive classes only at its anchor. The coarse order-complex calculation for the first class also fails only within its recorded perturbations and root check; neither is a global character obstruction.",
      "The primitive type-6 cocycle survives one identity-link polarity; exact chamber and maximal type-5 screens leave 24 candidates, then endpoint-hub and full-star certificates reduce them to six classes and eliminate all 24 at rank-four side-cell barycenters.",
      "This closes the declared 128-candidate primitive type-6/Fourier height family. For the bounded R2 extension, quick gates close all 72 pairs over the old frontier and 344 of the full 384-pair product, leaving 40 resurrected c=+1 pairs in ten classes.",
      "The compiled maximal-type-5 continuation eliminates all ten classes after 2,334 of 5,078 cell-orbit rows, with ten independent Python full-fiber replays. This closes only that R2 coordinate, coefficient set, action, primitive character, and canonical barycentric subdivision.",
      "The separate multi-cellulation batch gives exact bad-link witnesses for all 239 scheduled records and all 286 branches, with zero bounded-prefix survivors or unresolved records. Together with the preexisting selected obstruction, it archives the declared 240-record Track B portfolio. Other characters, potentials, subdivisions, P2 Track B families, and virtual fibering remain open.",
      "The current cover has one-sided type-5 walls, so strict wall Track A stops at the same two-sidedness gate used by the generic preflight. Its source-bound availability record does not manufacture a rank-two complex or local-feasibility result. Pure generator-5 color-class extensions also fail side-wall parity.",
      "On the rank-312 orientation cover, exact sheet-component formulas produce an unrestricted generalized-Davis radius-two frontier survivor; the compact radius-one seed fails at 96 radius-two vertices, and global compatibility plus higher-cell links remain open.",
      "In the Niblo-Reeves cubing, the canonical primitive coorientation passes every complete sheet-zero link through radius three but fails at an exact reachable all-sheet principal vertex. Sheet-independent projected-wall flips are closed.",
      "The exact component bridge binds 159 principal roots and 543 reduced-transversal images to 120 projected component classes. Common-family and key-specific affine residual CEGAR each reached a 32-round limit with exact bad-sheet cuts, finding neither an all-sheet principal survivor nor an infeasibility proof. The gated depth-one/radius-one frontier was skipped. This bounded-inconclusive result deprioritizes those affine ansatzes but does not close general component-resolved orientations or the P2 cubulation route.",
      "The F9 image is the spinor kernel of order 108051462804999168000. The current subgroup image has known divisor 40, but the exact cover degree and global component flips remain open; the stored root-line candidate fails explicit link gates.",
    ],
  },
  {
    id: "tumarkin-g12221",
    label: "Tumarkin G12221",
    campaignId: "tumarkin-g12221-deferred",
    status: "deferred",
    executionMode: "registered-deferred",
    role: "deferred-contrast",
    sourcePath: "public/examples/tumarkin_5d_8facet_g12221_01.json",
    input: tumarkinG12221Input,
    degreeMultipliers: [1, 2],
    notes: [
      "The one-divisor tier is capacity-admissible but remains deferred; the two-divisor tier stays visible as a rejected audit.",
      "Ambient mod-2 character count is a weak prior, not evidence of subgroup first Betti number or fibering.",
    ],
  },
];

const h5P722Placeholder: CompactResearchTarget = {
  id: "h5-p7-22",
  label: "H5-P7-22",
  campaignId: "h5-p7-22-source-import",
  status: "import-required",
  role: "unverified-placeholder",
  sourceStatus: "import-required",
  canonicalSystemSha256: null,
  executionPolicy: executionPolicyFor("source-import-gated", []),
  facts: null,
  actionDegreeTiers: [],
  degreeCapacityAudits: [],
  acquisitionScreens: [],
  notes: [
    "No source matrix, source certificate, or materialized action is bundled under this identifier.",
    "Do not attach a degree divisor, cell count, action degree, or search queue until an imported source replays.",
  ],
};

export const compactResearchTargets: readonly CompactResearchTarget[] = [
  ...BUNDLED_TARGET_DEFINITIONS.map(buildBundledTarget),
  h5P722Placeholder,
];

export const compactResearchCampaigns: readonly CompactResearchCampaign[] = [
  {
    id: "makarov-p0-p1-primary",
    order: 1,
    label: "Makarov P0/P1 primary campaign",
    status: "active",
    mode: "paired-finite-action",
    targetIds: ["makarov-p0", "makarov-p1"],
    notes: [
      "One commensurability campaign, evaluated through both certified Coxeter cellulations.",
      "The canonical-first H4 direct-product family is closed; imported, nonnormal, nonsplit, and noncanonical-H4 action routes remain open.",
    ],
  },
  {
    id: "tumarkin-06-15-comparison",
    order: 2,
    label: "Tumarkin #06/#15 bounded comparison",
    status: "bounded",
    mode: "paired-finite-action-comparison",
    targetIds: ["tumarkin-g11411-06", "tumarkin-g11411-15"],
    notes: [
      "The identical shallow W(H4) x C2 lane is closed for both peers; keep them paired for imported finite-action evidence only.",
    ],
  },
  {
    id: "makarov-p2-coarse-experiment",
    order: 3,
    label: "Makarov P2 coarse right-angled experiment",
    status: "experimental",
    mode: "coarse-right-angled-import",
    targetIds: ["makarov-p2"],
    notes: [
      "The coarse import, two Q-independent primitive-class anchor screens, exact obstruction of the declared 128-candidate type-6/Fourier family, scoped 384-pair R2-product closure, sheet-resolved generalized-Davis frontier, and exact F9 image remain recorded.",
      "The separately sealed 240-record multi-cellulation Track B portfolio is archived after exact obstructions for every branch. The first component-resolved P2 Niblo-Reeves affine-residual CEGAR is bounded-inconclusive after 64 exact-counterexample rounds; it has no principal survivor or family obstruction, and its gated frontier did not run. Broader component rules remain open, while this affine ansatz is deprioritized.",
    ],
  },
  {
    id: "tumarkin-g12221-deferred",
    order: 4,
    label: "Tumarkin G12221 deferred contrast",
    status: "deferred",
    mode: "deferred-finite-action",
    targetIds: ["tumarkin-g12221"],
    notes: [
      "Registered rather than hard-excluded, but restricted to current capacity-compatible action tiers.",
    ],
  },
  {
    id: "h5-p7-22-source-import",
    order: 5,
    label: "H5-P7-22 source import",
    status: "blocked-on-source",
    mode: "source-import",
    targetIds: ["h5-p7-22"],
    notes: [
      "This is an intake placeholder, not a ranked mathematical prospect.",
    ],
  },
];

export function getCompactResearchTarget(
  id: CompactResearchTargetId,
): CompactResearchTarget {
  const target = compactResearchTargets.find(
    (candidate) => candidate.id === id,
  );
  if (target === undefined)
    throw new Error(`Unknown compact research target ${id}.`);
  return target;
}

export function getCompactResearchCampaign(
  id: CompactResearchCampaignId,
): CompactResearchCampaign {
  const campaign = compactResearchCampaigns.find(
    (candidate) => candidate.id === id,
  );
  if (campaign === undefined) {
    throw new Error(`Unknown compact research campaign ${id}.`);
  }
  return campaign;
}
