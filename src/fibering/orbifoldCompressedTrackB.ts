import {
  buildGeneralizedCompressionCertificate,
  computeGeneralizedCompressionArchiveHash,
  type GeneralizedCompressionCertificate,
} from "../davis/generalizedCompression";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  buildOrbifoldIntersectionPromotionRuntime,
  type OrbifoldIntersectionPromotionInput,
  type OrbifoldIntersectionPromotionRuntime,
} from "./orbifoldIntersectionPromotion";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedLawfulDavisOracle,
} from "./streamedLawfulDavis";
import {
  computeStreamedTrackBIntegralCocycleSectionDigest,
  prepareStreamedTrackBLinearLinkTemplateStreamer,
  type StreamedTrackBIntegralCocycleBasis,
  type StreamedTrackBLinearLinkTemplate,
  type StreamedTrackBLinkFailureKind,
} from "./streamedTrackB";

const DEFAULT_MAX_POINTS = 256;
const MAX_POINT_CAP = 100_000;
const DEFAULT_MAX_DIAGONAL_PRODUCT = 1_000_000;
const MAX_DIAGONAL_PRODUCT_CAP = 100_000_000;

export interface OrbifoldCompressedTrackBOptions {
  promotion: OrbifoldIntersectionPromotionInput;
  /** Strictly increasing vertices of the torsion-free intersection quotient. */
  points: readonly number[];
  offsetPolarities?: readonly (1 | -1)[];
  maxPoints?: number;
  /** Guard the explicit W/(K intersection H) diagonal action before allocation. */
  maxDiagonalProduct?: number;
}

export interface OrbifoldCompressedTrackBFailure {
  point: number;
  kind: StreamedTrackBLinkFailureKind;
  componentCount: number;
  componentSizes: number[];
  sampledComponents: string[][];
  linkTemplateDigest: string;
  failureDigest: string;
}

export interface OrbifoldCompressedTrackBCertificate {
  schemaVersion: 1;
  kind: "orbifold-character-to-torsion-free-compressed-track-b-screen";
  status: "completed";
  method: "intersection-promotion-then-streamed-generalized-compression";
  source: {
    orbifoldPromotionCertificateDigest: string;
    normalizedCharacterDigest: string;
    intersectionActionRowsDigest: string;
    oracleStructureHash: string;
    generalizedCompressionArchiveHash: string;
    cocycleSectionDigest: string;
  };
  target: {
    subgroup: "K-intersection-H";
    quotientCellComplex: "(K-intersection-H)\\Sigma";
    universalCover: "Davis-complex-Sigma";
    torsionFreeIntersectionReplayed: true;
    generalizedCompressionUsesFreeFullWTFibers: true;
    sourceGermsRetainedBeforeCompression: true;
    foldedOrbifoldQuotientLinksUsed: false;
  };
  scan: {
    scope:
      | "selected-anchor-vertices"
      | "full-quotient-vertex-census"
      | "counterexample-terminated-prefix-of-full-census";
    requestedPoints: number[];
    requestedPointDigest: string;
    intersectionDegree: number;
    diagonalProductUpperBound: number;
    maxDiagonalProduct: number;
    checkedPointTemplateCount: number;
    offsetPolarities: Array<1 | -1>;
    heightRule: "integral-character-plus-fixed-global-point-order-offset";
    results: Array<{
      offsetPolarity: 1 | -1;
      checkedPointCount: number;
      passedEveryRequestedLink: boolean;
      firstFailure?: OrbifoldCompressedTrackBFailure;
      resultDigest: string;
    }>;
    survivorPolarities: Array<1 | -1>;
  };
  checks: {
    orbifoldArithmeticPromotionReplayed: true;
    torsionFreeIntersectionReplayed: true;
    normalizedCharacterPrimitive: true;
    generalizedCompressionReplayedByStreamer: true;
    directedEdgeCocycleReplayed: true;
    rootedLinksNotFolded: true;
    everyClassResolved: true;
  };
  claims: string[];
  nonClaims: string[];
  certificateDigest: string;
}

export interface OrbifoldCompressedTrackBRuntime {
  certificate: OrbifoldCompressedTrackBCertificate;
  promotion: OrbifoldIntersectionPromotionRuntime;
  oracle: StreamedLawfulDavisOracle;
  generalizedCompression: GeneralizedCompressionCertificate;
  cocycleCoordinate: StreamedTrackBIntegralCocycleBasis;
}

interface MutablePolarityResult {
  offsetPolarity: 1 | -1;
  checkedPointCount: number;
  firstFailure?: OrbifoldCompressedTrackBFailure;
}

function checkedPoints(
  points: readonly number[],
  degree: number,
  maximum: number,
): number[] {
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > MAX_POINT_CAP
  ) {
    throw new RangeError(
      `The Track B point cap must lie in 1..${MAX_POINT_CAP}.`,
    );
  }
  if (points.length === 0 || points.length > maximum) {
    throw new RangeError(
      `The bounded Track B screen needs 1..${maximum} explicitly selected points.`,
    );
  }
  let previous = -1;
  return points.map((point) => {
    if (
      !Number.isSafeInteger(point) ||
      point <= previous ||
      point < 0 ||
      point >= degree
    ) {
      throw new Error(
        "Track B points must be strictly increasing in-range action-point ids.",
      );
    }
    previous = point;
    return point;
  });
}

function checkedPolarities(
  supplied: readonly (1 | -1)[] | undefined,
): Array<1 | -1> {
  const polarities = supplied === undefined ? ([-1, 1] as const) : supplied;
  if (
    polarities.length === 0 ||
    polarities.length > 2 ||
    polarities.some((value) => value !== -1 && value !== 1) ||
    new Set(polarities).size !== polarities.length
  ) {
    throw new Error("Offset polarities must be a nonempty subset of {-1,+1}.");
  }
  return [...polarities].sort((left, right) => left - right);
}

function components(
  selected: Uint8Array,
  adjacency: readonly Uint32Array[],
): number[][] {
  const seen = new Uint8Array(selected.length);
  const result: number[][] = [];
  for (let start = 0; start < selected.length; start += 1) {
    if (selected[start] === 0 || seen[start] !== 0) continue;
    const component: number[] = [];
    const queue = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      component.push(current);
      for (const next of adjacency[current]) {
        if (selected[next] === 0 || seen[next] !== 0) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    result.push(component);
  }
  return result;
}

function failureAtTemplate(
  template: StreamedTrackBLinearLinkTemplate,
  degree: number,
  polarity: 1 | -1,
): OrbifoldCompressedTrackBFailure | undefined {
  if (
    !template.adjacencyIncluded ||
    template.adjacency.length !== template.germs.length
  ) {
    throw new Error(
      "The compressed Track B bridge requires exact link adjacency.",
    );
  }
  const ascending = new Uint8Array(template.germs.length);
  const descending = new Uint8Array(template.germs.length);
  for (let index = 0; index < template.germs.length; index += 1) {
    const germ = template.germs[index];
    let coefficient = 0n;
    for (const [coordinate, value] of germ.coefficientPairs) {
      if (coordinate !== 0) {
        throw new Error(
          "The promoted rank-one cocycle emitted an unexpected coordinate.",
        );
      }
      coefficient += BigInt(value);
    }
    const difference =
      4n * BigInt(degree) * coefficient +
      BigInt(polarity) * BigInt(germ.pointDifference);
    if (difference === 0n) {
      throw new Error(
        "The fixed global point-order offset left a flat link germ.",
      );
    }
    if (difference > 0n) ascending[index] = 1;
    else descending[index] = 1;
  }
  const ascendingComponents = components(ascending, template.adjacency);
  const descendingComponents = components(descending, template.adjacency);
  const kind: StreamedTrackBLinkFailureKind | undefined =
    ascendingComponents.length === 0
      ? "ascending-empty"
      : descendingComponents.length === 0
        ? "descending-empty"
        : ascendingComponents.length !== 1
          ? "ascending-disconnected"
          : descendingComponents.length !== 1
            ? "descending-disconnected"
            : undefined;
  if (kind === undefined) return undefined;
  const failed = kind.startsWith("ascending")
    ? ascendingComponents
    : descendingComponents;
  const withoutDigest = {
    point: template.point,
    kind,
    componentCount: failed.length,
    componentSizes: failed.map((component) => component.length),
    sampledComponents: failed
      .slice(0, 4)
      .map((component) =>
        component.slice(0, 8).map((index) => template.germs[index].id),
      ),
    linkTemplateDigest: template.templateDigest,
  };
  return { ...withoutDigest, failureDigest: canonicalSha256(withoutDigest) };
}

function actionRowsDigest(
  runtime: OrbifoldIntersectionPromotionRuntime,
): string {
  return canonicalSha256({
    index: runtime.diagonal.candidate.index,
    generatorImages: runtime.diagonal.candidate.generatorImages,
  });
}

/**
 * Promote an orbifold character to a torsion-free intersection before using
 * the ordinary generalized compression. This deliberately never treats the
 * folded cells of K\\Sigma as cells or links in the local development.
 */
export function screenPromotedOrbifoldCharacterOnCompressedTrackB(
  options: OrbifoldCompressedTrackBOptions,
): OrbifoldCompressedTrackBRuntime {
  if (
    options.promotion.developmentLinks?.localModel === "folded-quotient-links"
  ) {
    throw new Error(
      "Folded orbifold quotient links cannot be supplied to the compressed Track B bridge.",
    );
  }
  const maxDiagonalProduct =
    options.maxDiagonalProduct ?? DEFAULT_MAX_DIAGONAL_PRODUCT;
  if (
    !Number.isSafeInteger(maxDiagonalProduct) ||
    maxDiagonalProduct < 1 ||
    maxDiagonalProduct > MAX_DIAGONAL_PRODUCT_CAP
  ) {
    throw new RangeError(
      `The diagonal-action cap must lie in 1..${MAX_DIAGONAL_PRODUCT_CAP}.`,
    );
  }
  const diagonalProductUpperBound =
    options.promotion.orbifoldAction.index *
    options.promotion.torsionFreeCoverAction.index;
  if (
    !Number.isSafeInteger(diagonalProductUpperBound) ||
    diagonalProductUpperBound > maxDiagonalProduct
  ) {
    throw new RangeError(
      `The diagonal action has product bound ${diagonalProductUpperBound}, above the explicit cap ${maxDiagonalProduct}.`,
    );
  }
  const promotion = buildOrbifoldIntersectionPromotionRuntime(
    options.promotion,
  );
  const accepted = promotion.acceptedIntersection;
  const degree = accepted.candidate.index;
  if (degree > maxDiagonalProduct) {
    throw new RangeError(
      `The intersection action has degree ${degree}, above the explicit cap ${maxDiagonalProduct}.`,
    );
  }
  const points = checkedPoints(
    options.points,
    degree,
    options.maxPoints ?? DEFAULT_MAX_POINTS,
  );
  const polarities = checkedPolarities(options.offsetPolarities);
  const oracle = buildStreamedLawfulDavisOracle({
    system: options.promotion.system,
    generatorImages: accepted.candidate.generatorImages,
  });
  const generalizedCompression = buildGeneralizedCompressionCertificate(
    options.promotion.system,
    accepted,
  );
  const coordinateIds = [promotion.normalizedCharacter.id];
  const coordinateProvider = {
    coordinateIds,
    edgeCoordinatePairs(point: number, generator: number) {
      const value =
        promotion.normalizedCharacter.edgeIncrements[generator][point];
      return value === "0" ? [] : ([[0, value]] as const);
    },
  };
  const expectedCocycleSectionDigest =
    computeStreamedTrackBIntegralCocycleSectionDigest(
      oracle,
      coordinateProvider,
    );
  const latticeBasisDigest = canonicalSha256({
    schemaVersion: 1,
    method: "primitive-rank-one-promoted-character-coordinate",
    promotionCertificateDigest: promotion.certificate.certificateDigest,
    normalizedCharacterDigest:
      promotion.normalizedCharacter.sourceCertificateDigest,
    fullIntegralH1BasisClaimed: false,
  });
  const cocycleCoordinate: StreamedTrackBIntegralCocycleBasis = {
    ...coordinateProvider,
    latticeBasisDigest,
    expectedCocycleSectionDigest,
  };
  const streamer = prepareStreamedTrackBLinearLinkTemplateStreamer({
    oracle,
    generalizedCompression,
    cocycleBasis: cocycleCoordinate,
  });
  const mutable = polarities.map<MutablePolarityResult>((offsetPolarity) => ({
    offsetPolarity,
    checkedPointCount: 0,
  }));
  const streamResult = streamer.stream(
    { points, includeAdjacency: true },
    (template) => {
      for (const result of mutable) {
        if (result.firstFailure !== undefined) continue;
        result.checkedPointCount += 1;
        result.firstFailure = failureAtTemplate(
          template,
          degree,
          result.offsetPolarity,
        );
      }
      return mutable.every((result) => result.firstFailure !== undefined)
        ? "stop"
        : undefined;
    },
  );
  if (streamResult.status !== "completed") {
    throw new Error(
      streamResult.errors.join(" ") || "The Track B template stream failed.",
    );
  }
  const results = mutable.map((result) => {
    const passedEveryRequestedLink =
      result.firstFailure === undefined &&
      result.checkedPointCount === points.length;
    const withoutDigest = {
      offsetPolarity: result.offsetPolarity,
      checkedPointCount: result.checkedPointCount,
      passedEveryRequestedLink,
      ...(result.firstFailure ? { firstFailure: result.firstFailure } : {}),
    };
    return { ...withoutDigest, resultDigest: canonicalSha256(withoutDigest) };
  });
  const survivorPolarities = results
    .filter((result) => result.passedEveryRequestedLink)
    .map((result) => result.offsetPolarity);
  const fullCensus =
    points.length === degree && points.every((point, index) => point === index);
  const completedFullCensus =
    fullCensus && streamResult.checkedPointCount === degree;
  const generalizedCompressionArchiveHash =
    computeGeneralizedCompressionArchiveHash(generalizedCompression);
  const bridgeChecks = {
    generalizedCompressionReplayedByStreamer:
      streamResult.checks.sourceReplayed,
    directedEdgeCocycleReplayed:
      streamResult.checks.expectedCocycleSectionDigestMatches &&
      streamResult.checks.directedEdgesAntisymmetric &&
      streamResult.checks.rankTwoBoundariesClosed,
    everyClassResolved: results.every(
      (result) =>
        result.passedEveryRequestedLink || result.firstFailure !== undefined,
    ),
  };
  if (!Object.values(bridgeChecks).every(Boolean)) {
    throw new Error(
      "The promoted compressed Track B replay did not pass every guard.",
    );
  }
  const withoutDigest: Omit<
    OrbifoldCompressedTrackBCertificate,
    "certificateDigest"
  > = {
    schemaVersion: 1,
    kind: "orbifold-character-to-torsion-free-compressed-track-b-screen",
    status: "completed",
    method: "intersection-promotion-then-streamed-generalized-compression",
    source: {
      orbifoldPromotionCertificateDigest:
        promotion.certificate.certificateDigest,
      normalizedCharacterDigest:
        promotion.normalizedCharacter.sourceCertificateDigest,
      intersectionActionRowsDigest: actionRowsDigest(promotion),
      oracleStructureHash: oracle.structureHash,
      generalizedCompressionArchiveHash,
      cocycleSectionDigest: streamResult.cocycleSectionDigest,
    },
    target: {
      subgroup: "K-intersection-H",
      quotientCellComplex: "(K-intersection-H)\\Sigma",
      universalCover: "Davis-complex-Sigma",
      torsionFreeIntersectionReplayed: true,
      generalizedCompressionUsesFreeFullWTFibers: true,
      sourceGermsRetainedBeforeCompression: true,
      foldedOrbifoldQuotientLinksUsed: false,
    },
    scan: {
      scope: completedFullCensus
        ? "full-quotient-vertex-census"
        : fullCensus
          ? "counterexample-terminated-prefix-of-full-census"
          : "selected-anchor-vertices",
      requestedPoints: points,
      requestedPointDigest: canonicalSha256(points),
      intersectionDegree: degree,
      diagonalProductUpperBound,
      maxDiagonalProduct,
      checkedPointTemplateCount: streamResult.checkedPointCount,
      offsetPolarities: polarities,
      heightRule: "integral-character-plus-fixed-global-point-order-offset",
      results,
      survivorPolarities,
    },
    checks: {
      orbifoldArithmeticPromotionReplayed: true,
      torsionFreeIntersectionReplayed: true,
      normalizedCharacterPrimitive: true,
      generalizedCompressionReplayedByStreamer: true,
      directedEdgeCocycleReplayed: true,
      rootedLinksNotFolded: true,
      everyClassResolved: true,
    },
    claims: [
      "The scanned cell complex is the generalized compression of the torsion-free quotient (K intersection H)\\Sigma, not the folded orbifold quotient K\\Sigma.",
      "Every failed requested link is an exact counterexample for the normalized promoted character, offset polarity, and fixed global pulling rule.",
      ...(completedFullCensus && survivorPolarities.length > 0
        ? [
            "A surviving polarity passed every quotient-vertex directed link and is eligible for the separate finite-height-band theorem replay.",
          ]
        : []),
    ],
    nonClaims: [
      "Selected-anchor survival is local evidence only and makes no fibering claim.",
      "The rank-one coordinate is a primitive candidate character, not a claimed full integral H1 basis.",
      "This screen does not certify finite generation until a full census survivor receives the finite-height-band theorem replay.",
      "This bridge neither computes nor trusts links after folding by torsionful cell stabilizers.",
    ],
  };
  return {
    certificate: {
      ...withoutDigest,
      certificateDigest: canonicalSha256(withoutDigest),
    },
    promotion,
    oracle,
    generalizedCompression,
    cocycleCoordinate,
  };
}
