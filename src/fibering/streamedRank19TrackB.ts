import type { GeneralizedCompressionCertificate } from "../davis/generalizedCompression";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  buildObstructionPrunedConeCoverAsync,
  deriveAntipodalObstructionPrunedConeCover,
  replayObstructionPrunedConeCover,
  type AsyncExactConeFeasibilityOracle,
  type ObstructionPrunedConeCover,
  type ObstructionPrunedConeNode,
  type ObstructionPrunedConeCoverReplay,
} from "./scalableHeightCone";
import {
  createScalableStreamedHeightConeEvaluator,
  type StreamedHeightLinkFailurePrune,
  type StreamedHeightPassingConeLeaf,
} from "./streamedHeightConeSearch";
import type { StreamedLawfulDavisOracle } from "./streamedLawfulDavis";
import type { StreamedH1CompleteLatticeCertificate } from "./streamedH1Completion";
import {
  streamStreamedTrackBLinearLinkTemplates,
  type StreamedTrackBIntegralCocycleBasis,
  type StreamedTrackBLinearLinkTemplate,
  type StreamedTrackBLinearTemplateStreamResult,
} from "./streamedTrackB";

type Rank19ConeCover = ObstructionPrunedConeCover<
  StreamedHeightLinkFailurePrune,
  StreamedHeightPassingConeLeaf
>;

export interface StreamedFullH1LatticeBinding {
  certificateDigest: string;
  preparationDigest: string;
  oracleStructureHash: string;
  actionRowsCanonicalSha256: string;
  fullLatticeBasisDigest: string;
  fullCocycleSectionDigest: string;
  h1Rank: 19;
  h1IsomorphicTo: "Z^19";
  integralBasisIds: string[];
  fullIntegralBasisCertified: true;
  wallSublatticeRank: 4;
  wallIndexInFullH1: "infinite";
  wallSaturationDefect: 2;
  h1ModuloWall: "Z^15 + Z/2";
}

export interface StreamedRank19NormalCatalogueEntry {
  normalKey: string;
  primitiveNormal: string[];
  occurrenceCount: number;
  firstOccurrence: { point: number; germId: string };
}

export interface StreamedRank19TerminalCensus {
  terminalCount: number;
  obstructionCount: number;
  survivorCount: number;
  zeroCharacterCount: number;
  lowerDimensionalCount: number;
  tieSensitiveCount: number;
  positiveDimensionalTieSensitiveCount: number;
  everyNonzeroTerminalHasPrimitiveRepresentative: boolean;
  byDimension: Array<{
    dimension: number;
    obstructionCount: number;
    survivorCount: number;
    zeroCharacterCount: number;
  }>;
  primitiveRepresentativeDigest: string;
}

export interface StreamedRank19PolaritySearch {
  sigma: -1 | 1;
  cover: Rank19ConeCover;
  replay: ObstructionPrunedConeCoverReplay;
  evaluatorStatistics: ReturnType<
    ReturnType<typeof createScalableStreamedHeightConeEvaluator>["statistics"]
  >;
  terminalCensus: StreamedRank19TerminalCensus;
  everyNonzeroConeObstructed: boolean;
}

export interface StreamedRank19TrackBReport {
  schemaVersion: 1;
  kind: "compact-5-cube-full-h1-exact-height-cone-cover";
  status:
    | "all-nonzero-integral-characters-obstructed"
    | "prefix-has-survivors"
    | "failed";
  method: "rank-19-exact-obstruction-pruned-ternary-cone-cover";
  source: {
    oracleStructureHash: string;
    actionRowsCanonicalSha256: string;
    generalizedCompressionArchiveHash: string;
    degree: number;
    prefixPoints: number[];
  };
  h1: {
    certificate: StreamedH1CompleteLatticeCertificate;
    binding: StreamedFullH1LatticeBinding;
  };
  heightArrangement: {
    coordinateIds: string[];
    rank: 19;
    rule: StreamedTrackBLinearTemplateStreamResult["heightRule"];
    prefixTemplateStream: StreamedTrackBLinearTemplateStreamResult;
    prefixGermOccurrenceCount: number;
    prefixIdenticallyZeroGermCount: number;
    prefixNormalCount: number;
    prefixNormalCatalogue: StreamedRank19NormalCatalogueEntry[];
    prefixNormalCatalogueDigest: string;
    globalNormalCatalogue:
      | { status: "not-materialized" }
      | {
          status: "materialized";
          templateStream: StreamedTrackBLinearTemplateStreamResult;
          germOccurrenceCount: number;
          identicallyZeroGermCount: number;
          normalCount: number;
          normalCatalogue: StreamedRank19NormalCatalogueEntry[];
          normalCatalogueDigest: string;
        };
    lowerDimensionalFacesIncluded: true;
    tiePolaritiesTested: [-1, 1];
  };
  coneSearch: {
    coverageSemantics: "exact-compressed-cone-cover";
    searches: [StreamedRank19PolaritySearch, StreamedRank19PolaritySearch];
    compressionEquivalence: string;
  };
  checks: {
    exactFullH1BasisBound: boolean;
    prefixTemplatesComplete: boolean;
    globalCatalogueCompleteWhenRequested: boolean;
    sourceBindingsAgree: boolean;
    bothPolaritiesReplayed: boolean;
    zeroCharacterSeparatedForBothPolarities: boolean;
    lowerDimensionalFacesCovered: boolean;
    everyNonzeroConeObstructedForBothPolarities: boolean;
  };
  claims: string[];
  nonClaims: string[];
  reportDigest: string;
}

export interface BuildStreamedRank19TrackBReportOptions {
  oracle: StreamedLawfulDavisOracle;
  generalizedCompression: GeneralizedCompressionCertificate;
  h1Certificate: StreamedH1CompleteLatticeCertificate;
  cocycleBasis: StreamedTrackBIntegralCocycleBasis;
  exactConeOracle: AsyncExactConeFeasibilityOracle;
  /** Defaults to q0,...,q7. Prefix obstructions persist under every later cut. */
  prefixPoints?: readonly number[];
  materializeGlobalNormalCatalogue?: boolean;
  maxConeNodes?: number;
  maxOracleQueries?: number;
  onProgress?: (event: {
    stage:
      | "prefix-template"
      | "prefix-normal-catalogue"
      | "global-normal-template"
      | "global-normal-catalogue"
      | "polarity-cover";
    completed: number;
    total: number;
    sigma?: -1 | 1;
    normalCount?: number;
    identicallyZeroGermCount?: number;
  }) => void;
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function canonicalNormal(input: readonly string[]): {
  zero: boolean;
  primitive: string[];
  key: string;
} {
  const values = input.map(BigInt);
  let divisor = 0n;
  for (const value of values) divisor = gcd(divisor, value);
  if (divisor === 0n) {
    const primitive = values.map(() => "0");
    return { zero: true, primitive, key: primitive.join(",") };
  }
  let primitive = values.map((value) => value / divisor);
  if (primitive.find((value) => value !== 0n)! < 0n) {
    primitive = primitive.map((value) => -value);
  }
  const serialized = primitive.map(String);
  return { zero: false, primitive: serialized, key: serialized.join(",") };
}

function compareNormals(
  left: readonly string[],
  right: readonly string[],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = BigInt(left[index]) - BigInt(right[index]);
    if (difference < 0n) return -1;
    if (difference > 0n) return 1;
  }
  return 0;
}

function createNormalCatalogueAccumulator(rank: number): {
  accept(template: StreamedTrackBLinearLinkTemplate): void;
  finish(): {
    germOccurrenceCount: number;
    identicallyZeroGermCount: number;
    entries: StreamedRank19NormalCatalogueEntry[];
    digest: string;
  };
} {
  const byKey = new Map<string, StreamedRank19NormalCatalogueEntry>();
  let germOccurrenceCount = 0;
  let identicallyZeroGermCount = 0;
  const accept = (template: StreamedTrackBLinearLinkTemplate): void => {
    for (const germ of template.germs) {
      germOccurrenceCount += 1;
      const dense = Array.from({ length: rank }, () => "0");
      for (const [coordinate, coefficient] of germ.coefficientPairs) {
        dense[coordinate] = coefficient;
      }
      const normal = canonicalNormal(dense);
      if (normal.zero) {
        identicallyZeroGermCount += 1;
        continue;
      }
      const stored = byKey.get(normal.key);
      if (stored) stored.occurrenceCount += 1;
      else {
        byKey.set(normal.key, {
          normalKey: normal.key,
          primitiveNormal: normal.primitive,
          occurrenceCount: 1,
          firstOccurrence: { point: template.point, germId: germ.id },
        });
      }
    }
  };
  return {
    accept,
    finish() {
      const entries = [...byKey.values()].sort((left, right) =>
        compareNormals(left.primitiveNormal, right.primitiveNormal),
      );
      return {
        germOccurrenceCount,
        identicallyZeroGermCount,
        entries,
        digest: canonicalSha256(entries),
      };
    },
  };
}

function catalogueFromTemplates(
  templates: readonly StreamedTrackBLinearLinkTemplate[],
  rank: number,
) {
  const accumulator = createNormalCatalogueAccumulator(rank);
  for (const template of templates) accumulator.accept(template);
  return accumulator.finish();
}

function validateObstructionPoints(
  degree: number,
  supplied?: readonly number[],
): number[] {
  const points = supplied
    ? [...supplied]
    : Array.from({ length: Math.min(8, degree) }, (_unused, point) => point);
  if (
    points.length === 0 ||
    points.some(
      (point, index) =>
        !Number.isInteger(point) ||
        point < 0 ||
        point >= degree ||
        (index > 0 && point <= points[index - 1]),
    )
  ) {
    throw new Error(
      "Track-B obstruction points must be distinct increasing quotient-point ids.",
    );
  }
  return points;
}

function terminalCensus(cover: Rank19ConeCover): StreamedRank19TerminalCensus {
  const byDimension = Array.from(
    { length: cover.rank + 1 },
    (_, dimension) => ({
      dimension,
      obstructionCount: 0,
      survivorCount: 0,
      zeroCharacterCount: 0,
    }),
  );
  let obstructionCount = 0;
  let survivorCount = 0;
  let zeroCharacterCount = 0;
  let lowerDimensionalCount = 0;
  let tieSensitiveCount = 0;
  let positiveDimensionalTieSensitiveCount = 0;
  let everyNonzeroTerminalHasPrimitiveRepresentative = true;
  const representatives: Array<{
    constraintDigest: string;
    dimension: number;
    primitiveWitness: string[] | null;
    outcome: "obstruction" | "survivor" | "zero-character";
  }> = [];

  const visit = (
    node: ObstructionPrunedConeNode<
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
    const result = node.feasibility.result;
    if (result.kind !== "feasible") {
      throw new Error("A terminal cone node carries an infeasible result.");
    }
    const dimension = result.dimension;
    const outcome =
      node.decision.kind === "prune"
        ? "obstruction"
        : node.decision.kind === "survivor"
          ? "survivor"
          : "zero-character";
    if (outcome === "obstruction") {
      obstructionCount += 1;
      byDimension[dimension].obstructionCount += 1;
    } else if (outcome === "survivor") {
      survivorCount += 1;
      byDimension[dimension].survivorCount += 1;
    } else {
      zeroCharacterCount += 1;
      byDimension[dimension].zeroCharacterCount += 1;
    }
    if (dimension < cover.rank) lowerDimensionalCount += 1;
    if (hasZeroAssignment) {
      tieSensitiveCount += 1;
      if (dimension > 0) positiveDimensionalTieSensitiveCount += 1;
    }
    if (dimension > 0 && result.primitiveWitness === null) {
      everyNonzeroTerminalHasPrimitiveRepresentative = false;
    }
    representatives.push({
      constraintDigest: node.constraintDigest,
      dimension,
      primitiveWitness: result.primitiveWitness,
      outcome,
    });
  };
  visit(cover.root, false);
  return {
    terminalCount: representatives.length,
    obstructionCount,
    survivorCount,
    zeroCharacterCount,
    lowerDimensionalCount,
    tieSensitiveCount,
    positiveDimensionalTieSensitiveCount,
    everyNonzeroTerminalHasPrimitiveRepresentative,
    byDimension,
    primitiveRepresentativeDigest: canonicalSha256(representatives),
  };
}

function validDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export function bindStreamedFullH1Lattice(
  certificate: StreamedH1CompleteLatticeCertificate,
): StreamedFullH1LatticeBinding {
  const { certificateDigest: storedCertificateDigest, ...certificatePayload } =
    certificate;
  const failedChecks = Object.entries(certificate.checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (
    certificate.schemaVersion !== 1 ||
    certificate.kind !== "streamed-h1-complete-integral-lattice-certificate" ||
    certificate.method !==
      "tree-gauge-split-kernel-plus-integral-core-frame-and-modular-rank" ||
    certificate.status !== "passed" ||
    certificate.result.h1Rank !== 19 ||
    certificate.result.h1IsomorphicTo !== "Z^19" ||
    certificate.result.integralBasisIds.length !== 19 ||
    certificate.result.wallSublatticeRank !== 4 ||
    certificate.result.wallSublatticeIndexInSaturation !== 2 ||
    certificate.result.wallSublatticeIndexInFullH1 !== "infinite" ||
    certificate.result.quotientByWallLattice !== "Z^15 + Z/2" ||
    !Object.values(certificate.checks).every(Boolean) ||
    !validDigest(certificate.certificateDigest) ||
    canonicalSha256(certificatePayload) !== storedCertificateDigest ||
    !validDigest(certificate.preparationDigest) ||
    !validDigest(certificate.oracleStructureHash) ||
    !validDigest(certificate.actionRowsCanonicalSha256) ||
    !validDigest(certificate.fullLatticeBasisDigest) ||
    !validDigest(certificate.fullCocycleSectionDigest)
  ) {
    throw new Error(
      [
        "The complete H^1 certificate did not pass every binding check.",
        failedChecks.length === 0
          ? "No Boolean check failed; inspect the result fields and digests."
          : `Failed checks: ${failedChecks.join(", ")}.`,
        ...certificate.errors,
      ].join(" "),
    );
  }
  return {
    certificateDigest: certificate.certificateDigest,
    preparationDigest: certificate.preparationDigest,
    oracleStructureHash: certificate.oracleStructureHash,
    actionRowsCanonicalSha256: certificate.actionRowsCanonicalSha256,
    fullLatticeBasisDigest: certificate.fullLatticeBasisDigest,
    fullCocycleSectionDigest: certificate.fullCocycleSectionDigest,
    h1Rank: 19,
    h1IsomorphicTo: "Z^19",
    integralBasisIds: [...certificate.result.integralBasisIds],
    fullIntegralBasisCertified: true,
    wallSublatticeRank: 4,
    wallIndexInFullH1: "infinite",
    wallSaturationDefect: 2,
    h1ModuloWall: "Z^15 + Z/2",
  };
}

export async function buildStreamedRank19TrackBReport(
  options: BuildStreamedRank19TrackBReportOptions,
): Promise<StreamedRank19TrackBReport> {
  const prefixPoints = validateObstructionPoints(
    options.oracle.degree,
    options.prefixPoints,
  );
  const h1 = bindStreamedFullH1Lattice(options.h1Certificate);
  if (
    h1.h1Rank !== 19 ||
    h1.h1IsomorphicTo !== "Z^19" ||
    !h1.fullIntegralBasisCertified ||
    h1.oracleStructureHash !== options.oracle.structureHash ||
    h1.actionRowsCanonicalSha256 !== options.oracle.actionRowsCanonicalSha256 ||
    h1.integralBasisIds.length !== 19 ||
    canonicalSha256(h1.integralBasisIds) !==
      canonicalSha256(options.cocycleBasis.coordinateIds) ||
    h1.fullLatticeBasisDigest !== options.cocycleBasis.latticeBasisDigest ||
    h1.fullCocycleSectionDigest !==
      options.cocycleBasis.expectedCocycleSectionDigest ||
    !validDigest(h1.certificateDigest) ||
    !validDigest(h1.preparationDigest) ||
    !validDigest(h1.oracleStructureHash) ||
    !validDigest(h1.actionRowsCanonicalSha256) ||
    !validDigest(h1.fullLatticeBasisDigest) ||
    !validDigest(h1.fullCocycleSectionDigest)
  ) {
    throw new Error(
      "The Track-B search requires the certified ordered Z^19 basis.",
    );
  }

  const prefixTemplates: StreamedTrackBLinearLinkTemplate[] = [];
  const prefixTemplateStream = streamStreamedTrackBLinearLinkTemplates(
    {
      oracle: options.oracle,
      generalizedCompression: options.generalizedCompression,
      cocycleBasis: options.cocycleBasis,
      points: prefixPoints,
      includeAdjacency: true,
    },
    (template) => {
      prefixTemplates.push(template);
      options.onProgress?.({
        stage: "prefix-template",
        completed: prefixTemplates.length,
        total: prefixPoints.length,
      });
    },
  );
  if (
    prefixTemplateStream.status !== "completed" ||
    prefixTemplateStream.checkedPointCount !== prefixPoints.length ||
    prefixTemplates.length !== prefixPoints.length
  ) {
    throw new Error(
      `The rank-19 prefix template stream failed: ${prefixTemplateStream.errors.join(" ")}`,
    );
  }
  const prefixCatalogue = catalogueFromTemplates(prefixTemplates, 19);
  options.onProgress?.({
    stage: "prefix-normal-catalogue",
    completed: prefixPoints.length,
    total: prefixPoints.length,
    normalCount: prefixCatalogue.entries.length,
    identicallyZeroGermCount: prefixCatalogue.identicallyZeroGermCount,
  });

  let globalNormalCatalogue: StreamedRank19TrackBReport["heightArrangement"]["globalNormalCatalogue"] =
    {
      status: "not-materialized",
    };
  if (options.materializeGlobalNormalCatalogue) {
    const accumulator = createNormalCatalogueAccumulator(19);
    let completed = 0;
    const templateStream = streamStreamedTrackBLinearLinkTemplates(
      {
        oracle: options.oracle,
        generalizedCompression: options.generalizedCompression,
        cocycleBasis: options.cocycleBasis,
        includeAdjacency: false,
      },
      (template) => {
        accumulator.accept(template);
        completed += 1;
        options.onProgress?.({
          stage: "global-normal-template",
          completed,
          total: options.oracle.degree,
        });
      },
    );
    const catalogue = accumulator.finish();
    options.onProgress?.({
      stage: "global-normal-catalogue",
      completed,
      total: options.oracle.degree,
      normalCount: catalogue.entries.length,
      identicallyZeroGermCount: catalogue.identicallyZeroGermCount,
    });
    globalNormalCatalogue = {
      status: "materialized",
      templateStream,
      germOccurrenceCount: catalogue.germOccurrenceCount,
      identicallyZeroGermCount: catalogue.identicallyZeroGermCount,
      normalCount: catalogue.entries.length,
      normalCatalogue: catalogue.entries,
      normalCatalogueDigest: catalogue.digest,
    };
  }

  const templateByPoint = new Map(
    prefixTemplates.map((template) => [template.point, template]),
  );
  const source = {
    coordinateCount: 19,
    pointCount: prefixPoints.length,
    pointIds: prefixPoints,
    ambientPointCount: options.oracle.degree,
    sourceHash: prefixTemplateStream.sourceHash,
    latticeBasisDigest: prefixTemplateStream.latticeBasisDigest,
    cocycleSectionDigest: prefixTemplateStream.cocycleSectionDigest,
    heightRuleDigest: prefixTemplateStream.heightRule.heightRuleDigest,
    templateAt(point: number): StreamedTrackBLinearLinkTemplate {
      const template = templateByPoint.get(point);
      if (!template)
        throw new Error(`Missing rank-19 prefix template q${point}.`);
      return template;
    },
  };

  const searches: StreamedRank19PolaritySearch[] = [];
  const finishSearch = (
    sigma: -1 | 1,
    cover: Rank19ConeCover,
    evaluator: ReturnType<typeof createScalableStreamedHeightConeEvaluator>,
  ): void => {
    const replay = replayObstructionPrunedConeCover(cover, {
      verifyPrune: evaluator.verifyPrune,
      verifySurvivor: evaluator.verifySurvivor,
    });
    const census = terminalCensus(cover);
    searches.push({
      sigma,
      cover,
      replay,
      evaluatorStatistics: evaluator.statistics(),
      terminalCensus: census,
      everyNonzeroConeObstructed:
        replay.status === "passed" &&
        cover.survivorLeafCount === 0 &&
        cover.pruneLeafCount > 0 &&
        cover.zeroCharacterLeafCount === 1,
    });
  };

  options.onProgress?.({
    stage: "polarity-cover",
    completed: 0,
    total: 2,
    sigma: -1,
  });
  const negativeEvaluator = createScalableStreamedHeightConeEvaluator({
    source,
    sigma: -1,
    cacheTemplates: true,
  });
  const negativeCover = await buildObstructionPrunedConeCoverAsync({
    sourceHash: prefixTemplateStream.sourceHash,
    rank: 19,
    oracle: options.exactConeOracle,
    decide: negativeEvaluator.decide,
    ...(options.maxConeNodes === undefined
      ? {}
      : { maxNodes: options.maxConeNodes }),
    ...(options.maxOracleQueries === undefined
      ? {}
      : { maxOracleQueries: options.maxOracleQueries }),
  });
  finishSearch(-1, negativeCover, negativeEvaluator);
  options.onProgress?.({
    stage: "polarity-cover",
    completed: 1,
    total: 2,
    sigma: -1,
  });

  options.onProgress?.({
    stage: "polarity-cover",
    completed: 1,
    total: 2,
    sigma: 1,
  });
  const positiveEvaluator = createScalableStreamedHeightConeEvaluator({
    source,
    sigma: 1,
    cacheTemplates: true,
  });
  const positiveCover = deriveAntipodalObstructionPrunedConeCover({
    source: negativeCover,
    decide: positiveEvaluator.decide,
  });
  finishSearch(1, positiveCover, positiveEvaluator);
  options.onProgress?.({
    stage: "polarity-cover",
    completed: 2,
    total: 2,
    sigma: 1,
  });

  const typedSearches = searches as [
    StreamedRank19PolaritySearch,
    StreamedRank19PolaritySearch,
  ];
  const exactFullH1BasisBound =
    prefixTemplateStream.coordinateCount === 19 &&
    prefixTemplateStream.latticeBasisDigest ===
      options.cocycleBasis.latticeBasisDigest &&
    prefixTemplateStream.latticeBasisDigest === h1.fullLatticeBasisDigest &&
    prefixTemplateStream.cocycleSectionDigest === h1.fullCocycleSectionDigest &&
    canonicalSha256(prefixTemplateStream.coordinateIds) ===
      canonicalSha256(h1.integralBasisIds);
  const prefixTemplatesComplete =
    prefixTemplateStream.status === "completed" &&
    prefixTemplateStream.checks.everyRequestedPointStreamed &&
    prefixTemplateStream.adjacencyIncluded;
  const globalCatalogueCompleteWhenRequested =
    !options.materializeGlobalNormalCatalogue ||
    (globalNormalCatalogue.status === "materialized" &&
      globalNormalCatalogue.templateStream.status === "completed" &&
      globalNormalCatalogue.templateStream.exhaustiveAllPoints &&
      globalNormalCatalogue.templateStream.checks.everyQuotientPointStreamed &&
      globalNormalCatalogue.templateStream.checkedPointCount ===
        options.oracle.degree &&
      globalNormalCatalogue.templateStream.sourceHash ===
        prefixTemplateStream.sourceHash &&
      globalNormalCatalogue.templateStream.latticeBasisDigest ===
        prefixTemplateStream.latticeBasisDigest &&
      globalNormalCatalogue.templateStream.cocycleSectionDigest ===
        prefixTemplateStream.cocycleSectionDigest &&
      globalNormalCatalogue.templateStream.heightRule.heightRuleDigest ===
        prefixTemplateStream.heightRule.heightRuleDigest);
  const sourceBindingsAgree =
    prefixTemplateStream.oracleStructureHash === options.oracle.structureHash &&
    prefixTemplateStream.generalizedCompressionArchiveHash ===
      options.generalizedCompression.archiveHash &&
    prefixTemplateStream.cocycleSectionDigest ===
      options.cocycleBasis.expectedCocycleSectionDigest;
  const bothPolaritiesReplayed = typedSearches.every(
    (search) => search.replay.status === "passed",
  );
  const zeroCharacterSeparatedForBothPolarities = typedSearches.every(
    (search) => search.cover.zeroCharacterLeafCount === 1,
  );
  const lowerDimensionalFacesCovered = typedSearches.every(
    (search) =>
      search.terminalCensus.everyNonzeroTerminalHasPrimitiveRepresentative &&
      search.terminalCensus.positiveDimensionalTieSensitiveCount > 0,
  );
  const everyNonzeroConeObstructedForBothPolarities = typedSearches.every(
    (search) => search.everyNonzeroConeObstructed,
  );
  const checks = {
    exactFullH1BasisBound,
    prefixTemplatesComplete,
    globalCatalogueCompleteWhenRequested,
    sourceBindingsAgree,
    bothPolaritiesReplayed,
    zeroCharacterSeparatedForBothPolarities,
    lowerDimensionalFacesCovered,
    everyNonzeroConeObstructedForBothPolarities,
  };
  const essentialChecks = [
    exactFullH1BasisBound,
    prefixTemplatesComplete,
    globalCatalogueCompleteWhenRequested,
    sourceBindingsAgree,
    bothPolaritiesReplayed,
    zeroCharacterSeparatedForBothPolarities,
    lowerDimensionalFacesCovered,
  ];
  const status: StreamedRank19TrackBReport["status"] = essentialChecks.some(
    (passed) => !passed,
  )
    ? "failed"
    : everyNonzeroConeObstructedForBothPolarities
      ? "all-nonzero-integral-characters-obstructed"
      : "prefix-has-survivors";
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "compact-5-cube-full-h1-exact-height-cone-cover" as const,
    status,
    method: "rank-19-exact-obstruction-pruned-ternary-cone-cover" as const,
    source: {
      oracleStructureHash: options.oracle.structureHash,
      actionRowsCanonicalSha256: options.oracle.actionRowsCanonicalSha256,
      generalizedCompressionArchiveHash:
        options.generalizedCompression.archiveHash,
      degree: options.oracle.degree,
      prefixPoints,
    },
    h1: {
      certificate: options.h1Certificate,
      binding: h1,
    },
    heightArrangement: {
      coordinateIds: [...prefixTemplateStream.coordinateIds],
      rank: 19 as const,
      rule: prefixTemplateStream.heightRule,
      prefixTemplateStream,
      prefixGermOccurrenceCount: prefixCatalogue.germOccurrenceCount,
      prefixIdenticallyZeroGermCount: prefixCatalogue.identicallyZeroGermCount,
      prefixNormalCount: prefixCatalogue.entries.length,
      prefixNormalCatalogue: prefixCatalogue.entries,
      prefixNormalCatalogueDigest: prefixCatalogue.digest,
      globalNormalCatalogue,
      lowerDimensionalFacesIncluded: true as const,
      tiePolaritiesTested: [-1, 1] as [-1, 1],
    },
    coneSearch: {
      coverageSemantics: "exact-compressed-cone-cover" as const,
      searches: typedSearches,
      compressionEquivalence:
        "Each terminal cone has an exact primitive integral witness. A pruned terminal may contain several literal arrangement faces, but its stored forced/possible-link obstruction is invariant under every unmade sign refinement, so it certifies all of them. The + tie-polarity cover is transported from the - cover by (weight,sigma)->(-weight,-sigma); every primal/Farkas certificate and every target-polarity link proof is regenerated and replayed.",
    },
    checks,
    claims:
      status === "all-nonzero-integral-characters-obstructed"
        ? [
            "For both tie polarities, every nonzero primitive integral character in the certified Z^19 lattice lies in a replayed obstruction cone.",
            "Zero-sign branches are retained, so lower-dimensional height faces are included rather than treated as generic chambers.",
            "Every unmade hyperplane cut only refines a cone that already has an invariant local-link obstruction.",
          ]
        : status === "prefix-has-survivors"
          ? [
              "The report exactly covers the tested rank-19 prefix arrangement; recorded survivor cones require more quotient points.",
            ]
          : [
              "No Track-B obstruction theorem is claimed because at least one required replay or source-binding check failed.",
            ],
    nonClaims: [
      "An obstruction-pruned terminal cone is not a literal enumeration record for every finer global face; the invariant obstruction proves all of its refinements at once.",
      "Unless the optional global catalogue is materialized, hyperplanes that occur only after the obstruction prefix are not listed individually.",
      "The zero character is isolated and is not a fibering candidate.",
      "Failure for this fixed cocycle section, pulling subdivision, and tie rule does not rule out another subdivision, height representative, finite cover, or algebraic fibration.",
    ],
  };
  return {
    ...withoutDigest,
    reportDigest: canonicalSha256(withoutDigest),
  };
}
