import type { GeneralizedCompressionCertificate } from "../davis/generalizedCompression";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  buildExactTernaryHeightConeCover,
  canonicalizeHeightNormal,
  replayExactTernaryHeightConeCover,
  type HeightConeCoverCertificate,
  type HeightConeCoverNode,
  type HeightConeCoverReplay,
} from "./streamedHeightArrangement";
import {
  createStreamedHeightConeEvaluator,
  type StreamedHeightLinkFailurePrune,
  type StreamedHeightPassingConeLeaf,
} from "./streamedHeightConeSearch";
import {
  prepareStreamedH1Lattice,
  type StreamedH1LatticePreparationCertificate,
} from "./streamedH1Lattice";
import type { StreamedLawfulDavisOracle } from "./streamedLawfulDavis";
import {
  streamStreamedTrackBLinearLinkTemplates,
  type StreamedTrackBLinearLinkTemplate,
  type StreamedTrackBLinearTemplateStreamResult,
} from "./streamedTrackB";

type PrefixConeCover = HeightConeCoverCertificate<
  StreamedHeightLinkFailurePrune,
  StreamedHeightPassingConeLeaf
>;

export interface StreamedRigorousTrackBNormalCatalogueEntry {
  normalKey: string;
  primitiveNormal: string[];
  occurrenceCount: number;
  firstOccurrence: {
    point: number;
    germId: string;
  };
}

export interface StreamedRigorousTrackBTerminalCensus {
  terminalCount: number;
  obstructionCount: number;
  passingCount: number;
  zeroCharacterCount: number;
  lowerDimensionalCount: number;
  tieSensitiveCount: number;
  byDimension: Array<{
    dimension: number;
    obstructionCount: number;
    passingCount: number;
    zeroCharacterCount: number;
  }>;
  primitiveRepresentativeDigest: string;
}

export interface StreamedRigorousTrackBReport {
  schemaVersion: 1;
  kind: "compact-5-cube-exploratory-wall-slice-prefix-report";
  status:
    | "all-nonzero-wall-slice-characters-obstructed"
    | "prefix-has-survivors"
    | "failed";
  method: "saturated-wall-slice-exact-ternary-prefix-link-obstruction-cover";
  source: {
    oracleStructureHash: string;
    actionRowsCanonicalSha256: string;
    generalizedCompressionArchiveHash: string;
    degree: number;
    prefixPoints: number[];
    prefixIsContiguousFromZero: boolean;
  };
  h1: {
    preparation: StreamedH1LatticePreparationCertificate;
    basisScope: "rank-four-saturated-wall-slice-full-h1-unresolved";
    fullIntegralCharacterLatticeCertified: false;
  };
  heightArrangement: {
    coordinateIds: string[];
    rank: number;
    sigma: 1;
    rule: StreamedTrackBLinearTemplateStreamResult["heightRule"];
    prefixTemplateStream: StreamedTrackBLinearTemplateStreamResult;
    germOccurrenceCount: number;
    identicallyZeroGermCount: number;
    normalCount: number;
    normalCatalogue: StreamedRigorousTrackBNormalCatalogueEntry[];
    normalCatalogueDigest: string;
    globalArrangementMaterialized: false;
  };
  coneSearch: {
    cover: PrefixConeCover;
    replay: HeightConeCoverReplay;
    evaluatorStatistics: ReturnType<
      ReturnType<typeof createStreamedHeightConeEvaluator>["statistics"]
    >;
    terminalCensus: StreamedRigorousTrackBTerminalCensus;
    everyNonzeroConeHasPrefixObstruction: boolean;
  };
  checks: {
    wallSaturationPrepared: boolean;
    prefixTemplatesComplete: boolean;
    sourceBindingsAgree: boolean;
    exactConeCoverReplayed: boolean;
    zeroCharacterSeparated: boolean;
    noPassingCone: boolean;
    everyNonzeroConeHasPrefixObstruction: boolean;
  };
  claims: string[];
  nonClaims: string[];
  reportDigest: string;
}

export interface BuildStreamedRigorousTrackBReportOptions {
  oracle: StreamedLawfulDavisOracle;
  generalizedCompression: GeneralizedCompressionCertificate;
  /** Defaults to q0,...,q7, the known compact-cube obstruction prefix. */
  prefixPoints?: readonly number[];
  maxConeNodes?: number;
  maxIntermediateInequalities?: number;
}

function compareIntegerVectors(
  left: readonly string[],
  right: readonly string[],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = BigInt(left[index]);
    const rightValue = BigInt(right[index]);
    if (leftValue < rightValue) return -1;
    if (leftValue > rightValue) return 1;
  }
  return 0;
}

function validatePrefixPoints(
  degree: number,
  supplied?: readonly number[],
): number[] {
  const points = supplied
    ? [...supplied]
    : Array.from({ length: 8 }, (_, i) => i);
  if (
    points.length === 0 ||
    points.some(
      (point, index) =>
        !Number.isInteger(point) ||
        point < 0 ||
        point >= degree ||
        point !== index,
    )
  ) {
    throw new Error(
      "The rigorous prefix must be the nonempty contiguous sequence q0,...,qN.",
    );
  }
  return points;
}

function buildNormalCatalogue(
  templates: readonly StreamedTrackBLinearLinkTemplate[],
  rank: number,
): {
  germOccurrenceCount: number;
  identicallyZeroGermCount: number;
  entries: StreamedRigorousTrackBNormalCatalogueEntry[];
  digest: string;
} {
  const byKey = new Map<string, StreamedRigorousTrackBNormalCatalogueEntry>();
  let germOccurrenceCount = 0;
  let identicallyZeroGermCount = 0;
  for (const template of templates) {
    for (const germ of template.germs) {
      germOccurrenceCount += 1;
      const dense = Array.from({ length: rank }, () => "0");
      for (const [coordinate, coefficient] of germ.coefficientPairs) {
        dense[coordinate] = coefficient;
      }
      const canonical = canonicalizeHeightNormal(dense);
      if (canonical.zero) {
        identicallyZeroGermCount += 1;
        continue;
      }
      const existing = byKey.get(canonical.key);
      if (existing) {
        existing.occurrenceCount += 1;
      } else {
        byKey.set(canonical.key, {
          normalKey: canonical.key,
          primitiveNormal: canonical.primitive,
          occurrenceCount: 1,
          firstOccurrence: { point: template.point, germId: germ.id },
        });
      }
    }
  }
  const entries = [...byKey.values()].sort((left, right) =>
    compareIntegerVectors(left.primitiveNormal, right.primitiveNormal),
  );
  return {
    germOccurrenceCount,
    identicallyZeroGermCount,
    entries,
    digest: canonicalSha256(entries),
  };
}

function terminalCensus(
  cover: PrefixConeCover,
): StreamedRigorousTrackBTerminalCensus {
  const byDimension = Array.from(
    { length: cover.rank + 1 },
    (_, dimension) => ({
      dimension,
      obstructionCount: 0,
      passingCount: 0,
      zeroCharacterCount: 0,
    }),
  );
  let obstructionCount = 0;
  let passingCount = 0;
  let zeroCharacterCount = 0;
  let lowerDimensionalCount = 0;
  let tieSensitiveCount = 0;
  const representatives: Array<{
    constraintDigest: string;
    dimension: number;
    primitiveWitness: string[] | null;
    outcome: "obstruction" | "passing" | "zero-character";
  }> = [];

  const visit = (
    node: HeightConeCoverNode<
      StreamedHeightLinkFailurePrune,
      StreamedHeightPassingConeLeaf
    >,
    hasZeroAssignment: boolean,
  ): void => {
    if (node.decision.kind === "split") {
      for (const branch of node.decision.branches) {
        if (branch.outcome === "feasible") {
          visit(branch.child, hasZeroAssignment || branch.sign === 0);
        }
      }
      return;
    }
    const dimension = node.feasibility.dimension;
    const row = byDimension[dimension];
    const outcome =
      node.decision.kind === "prune"
        ? "obstruction"
        : node.decision.kind === "leaf"
          ? "passing"
          : "zero-character";
    if (outcome === "obstruction") {
      obstructionCount += 1;
      row.obstructionCount += 1;
    } else if (outcome === "passing") {
      passingCount += 1;
      row.passingCount += 1;
    } else {
      zeroCharacterCount += 1;
      row.zeroCharacterCount += 1;
    }
    if (dimension < cover.rank) lowerDimensionalCount += 1;
    if (hasZeroAssignment) tieSensitiveCount += 1;
    representatives.push({
      constraintDigest: node.constraintDigest,
      dimension,
      primitiveWitness: node.feasibility.primitiveWitness,
      outcome,
    });
  };
  visit(cover.root, false);
  return {
    terminalCount: representatives.length,
    obstructionCount,
    passingCount,
    zeroCharacterCount,
    lowerDimensionalCount,
    tieSensitiveCount,
    byDimension,
    primitiveRepresentativeDigest: canonicalSha256(representatives),
  };
}

/**
 * Explore the certified rank-four saturated wall slice with an exact
 * obstruction prefix. This deliberately does not identify the slice with
 * full H^1: the complete calculation has rank nineteen, so this legacy path
 * intentionally searches only the proper rank-four wall slice.
 */
export function buildStreamedRigorousTrackBReport(
  options: BuildStreamedRigorousTrackBReportOptions,
): StreamedRigorousTrackBReport {
  const prefixPoints = validatePrefixPoints(
    options.oracle.degree,
    options.prefixPoints,
  );
  const preparation = prepareStreamedH1Lattice(options.oracle);
  const templates: StreamedTrackBLinearLinkTemplate[] = [];
  const templateStream = streamStreamedTrackBLinearLinkTemplates(
    {
      oracle: options.oracle,
      generalizedCompression: options.generalizedCompression,
      cocycleBasis: preparation.wallSaturationCocycleBasis,
      points: prefixPoints,
      includeAdjacency: true,
    },
    (template) => {
      templates.push(template);
    },
  );
  if (
    templateStream.status !== "completed" ||
    templateStream.checkedPointCount !== prefixPoints.length ||
    templates.length !== prefixPoints.length
  ) {
    throw new Error(
      `The exact prefix template stream failed: ${templateStream.errors.join(" ")}`,
    );
  }
  const templateByPoint = new Map(
    templates.map((template) => [template.point, template]),
  );
  const source = {
    coordinateCount: templateStream.coordinateCount,
    pointCount: prefixPoints.length,
    sourceHash: templateStream.sourceHash,
    latticeBasisDigest: templateStream.latticeBasisDigest,
    cocycleSectionDigest: templateStream.cocycleSectionDigest,
    heightRuleDigest: templateStream.heightRule.heightRuleDigest,
    templateAt(point: number): StreamedTrackBLinearLinkTemplate {
      const template = templateByPoint.get(point);
      if (!template)
        throw new Error(`Missing exact prefix template q${point}.`);
      return template;
    },
  };
  const evaluator = createStreamedHeightConeEvaluator({ source, sigma: 1 });
  const cover = buildExactTernaryHeightConeCover({
    rank: templateStream.coordinateCount,
    decide: evaluator.decide,
    ...(options.maxConeNodes === undefined
      ? {}
      : { maxNodes: options.maxConeNodes }),
    ...(options.maxIntermediateInequalities === undefined
      ? {}
      : {
          maxIntermediateInequalities: options.maxIntermediateInequalities,
        }),
  });
  const replay = replayExactTernaryHeightConeCover(cover, {
    verifyPrune: evaluator.verifyPrune,
    verifyLeaf: evaluator.verifyLeaf,
    ...(options.maxIntermediateInequalities === undefined
      ? {}
      : {
          maxIntermediateInequalities: options.maxIntermediateInequalities,
        }),
  });
  const normals = buildNormalCatalogue(
    templates,
    templateStream.coordinateCount,
  );
  const census = terminalCensus(cover);
  const sourceBindingsAgree =
    templateStream.oracleStructureHash === options.oracle.structureHash &&
    templateStream.generalizedCompressionArchiveHash ===
      options.generalizedCompression.archiveHash &&
    templateStream.latticeBasisDigest ===
      preparation.certificate.latticeBasisDigest &&
    templateStream.cocycleSectionDigest ===
      preparation.certificate.cocycleSectionDigest;
  const exactConeCoverReplayed =
    replay.status === "passed" && Object.values(replay.checks).every(Boolean);
  const noPassingCone = cover.ordinaryLeafCount === 0;
  const everyNonzeroConeHasPrefixObstruction =
    exactConeCoverReplayed &&
    noPassingCone &&
    cover.pruneLeafCount > 0 &&
    cover.zeroCharacterLeafCount === 1 &&
    census.obstructionCount === cover.pruneLeafCount;
  const checks = {
    wallSaturationPrepared:
      preparation.certificate.status === "prepared" &&
      preparation.certificate.checks.wallSaturationCertified,
    prefixTemplatesComplete:
      templateStream.status === "completed" &&
      templateStream.checks.everyRequestedPointStreamed &&
      templateStream.adjacencyIncluded,
    sourceBindingsAgree,
    exactConeCoverReplayed,
    zeroCharacterSeparated: cover.zeroCharacterLeafCount === 1,
    noPassingCone,
    everyNonzeroConeHasPrefixObstruction,
  };
  const failed = Object.entries(checks)
    .filter(
      ([name, passed]) =>
        name !== "noPassingCone" &&
        name !== "everyNonzeroConeHasPrefixObstruction" &&
        !passed,
    )
    .map(([name]) => name);
  const status: StreamedRigorousTrackBReport["status"] =
    failed.length > 0
      ? "failed"
      : everyNonzeroConeHasPrefixObstruction
        ? "all-nonzero-wall-slice-characters-obstructed"
        : "prefix-has-survivors";
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "compact-5-cube-exploratory-wall-slice-prefix-report" as const,
    status,
    method:
      "saturated-wall-slice-exact-ternary-prefix-link-obstruction-cover" as const,
    source: {
      oracleStructureHash: options.oracle.structureHash,
      actionRowsCanonicalSha256: options.oracle.actionRowsCanonicalSha256,
      generalizedCompressionArchiveHash:
        options.generalizedCompression.archiveHash,
      degree: options.oracle.degree,
      prefixPoints,
      prefixIsContiguousFromZero: true,
    },
    h1: {
      preparation: preparation.certificate,
      basisScope: "rank-four-saturated-wall-slice-full-h1-unresolved" as const,
      fullIntegralCharacterLatticeCertified: false as const,
    },
    heightArrangement: {
      coordinateIds: [...templateStream.coordinateIds],
      rank: templateStream.coordinateCount,
      sigma: 1 as const,
      rule: templateStream.heightRule,
      prefixTemplateStream: templateStream,
      germOccurrenceCount: normals.germOccurrenceCount,
      identicallyZeroGermCount: normals.identicallyZeroGermCount,
      normalCount: normals.entries.length,
      normalCatalogue: normals.entries,
      normalCatalogueDigest: normals.digest,
      globalArrangementMaterialized: false as const,
    },
    coneSearch: {
      cover,
      replay,
      evaluatorStatistics: evaluator.statistics(),
      terminalCensus: census,
      everyNonzeroConeHasPrefixObstruction,
    },
    checks,
    claims: everyNonzeroConeHasPrefixObstruction
      ? [
          "Every nonzero cone in the certified rank-four saturated wall slice, including each realizable lower-dimensional zero-sign face, has a replayed link obstruction at a recorded prefix vertex.",
          "Every primitive integral character in that wall slice therefore fails this Track B link gate for the fixed global pulling rule.",
        ]
      : [
          "The report exactly records the tested prefix cones; surviving cones require a longer prefix before a global conclusion is possible.",
        ],
    nonClaims: [
      "This report searches only the proper rank-four saturated wall slice, not the certified rank-nineteen integral character lattice H^1(G;Z).",
      "The full global height-hyperplane arrangement was not materialized: every unmaterialized refinement is covered only because it inherits a prefix obstruction.",
      "The zero character is separated from the nonzero cone cover and is not a fibering candidate.",
      "Failure for this fixed global pulling and tie-break rule does not rule out another subdivision, Morse function, finite cover, or algebraic fibration.",
      "The calculation does not assert that every literal chamber of the unmaterialized global arrangement was individually listed.",
    ],
  };
  return {
    ...withoutDigest,
    reportDigest: canonicalSha256(withoutDigest),
  };
}
