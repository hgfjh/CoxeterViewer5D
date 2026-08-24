import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  replayHeightConeCertificate,
  type HeightConeContext,
  type HeightConeDecision,
} from "./streamedHeightArrangement";
import {
  replayExactConeOracleCertificate,
  type ObstructionPrunedConeContext,
  type ObstructionPrunedConeDecision,
} from "./scalableHeightCone";
import type {
  StreamedTrackBLinearLinkTemplate,
  StreamedTrackBLinkFailureKind,
} from "./streamedTrackB";

export interface StreamedHeightConeTemplateSource {
  coordinateCount: number;
  /** Number of templates tested by this evaluator. */
  pointCount: number;
  /** Actual quotient-point ids; defaults to `0,...,pointCount-1`. */
  pointIds?: readonly number[];
  /** Full quotient degree used by the global tie-break rule. */
  ambientPointCount?: number;
  sourceHash: string;
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  heightRuleDigest: string;
  templateAt(point: number): StreamedTrackBLinearLinkTemplate;
}

export interface StreamedHeightLinkFailurePrune {
  schemaVersion: 2;
  kind: "streamed-track-b-invariant-link-failure";
  sourceHash: string;
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  heightRuleDigest: string;
  sigma: -1 | 1;
  coneConstraintDigest: string;
  point: number;
  templateDigest: string;
  topologyDigest: string;
  pointNormalCount: number;
  pointNormalSetDigest: string;
  assignedPointNormalCount: number;
  assignedPointNormalSetDigest: string;
  failureKind: StreamedTrackBLinkFailureKind;
  direction: "ascending" | "descending";
  obstructionMethod:
    | "no-possible-link-vertices"
    | "forced-vertices-separated-in-possible-link";
  forcedGermCount: number;
  forcedGermDigest: string;
  possibleGermCount: number;
  possibleGermDigest: string;
  possibleComponentCount: number;
  possibleComponentsDigest: string;
  forcedComponentWitnessCount: number;
  forcedComponentWitnessDigest: string;
  /** The first two witnesses make a separated-components obstruction legible. */
  forcedComponentWitnessExcerpt: string[];
  obstructionDigest: string;
  /** Digests of the actual directed link at the stored cone witness. */
  actualComponentCount: number;
  actualGermCount: number;
  actualComponentsDigest: string;
  actualComponentSizesDigest: string;
  linkDigest: string;
  proofHash: string;
}

export interface StreamedHeightPassingConeLeaf {
  schemaVersion: 1;
  kind: "streamed-track-b-all-links-pass";
  sourceHash: string;
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  heightRuleDigest: string;
  sigma: -1 | 1;
  coneConstraintDigest: string;
  checkedPointCount: number;
  normalCount: number;
  normalCatalogueDigest: string;
  pointResultDigest: string;
  leafHash: string;
}

/** Exploratory witness only: it makes no cone-wide all-links-pass claim. */
export interface StreamedHeightProvisionalWitnessLeaf {
  schemaVersion: 1;
  kind: "streamed-track-b-provisional-passing-witness";
  sourceHash: string;
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  heightRuleDigest: string;
  sigma: -1 | 1;
  coneConstraintDigest: string;
  checkedPointIds: number[];
  primitiveWitness: string[];
  normalCount: number;
  assignedNormalCount: number;
  unresolvedNormalCount: number;
  normalCatalogueDigest: string;
  pointResultDigest: string;
  leafHash: string;
}

export interface StreamedHeightPrimitiveWitnessEvaluation {
  checkedPointCount: number;
  everyPointPasses: boolean;
  pointResultRecords: Array<[number, string, string]>;
  firstFailure: {
    point: number;
    failures: StreamedTrackBLinkFailureKind[];
    templateDigest: string;
    linkDigest: string;
  } | null;
  pointResultDigest: string;
}

export type StreamedHeightConeSearchDecision = HeightConeDecision<
  StreamedHeightLinkFailurePrune,
  StreamedHeightPassingConeLeaf
>;

export interface StreamedHeightConeEvaluator {
  decide(context: HeightConeContext): StreamedHeightConeSearchDecision;
  verifyPrune(
    context: HeightConeContext,
    proof: StreamedHeightLinkFailurePrune,
  ): boolean;
  verifyLeaf(
    context: HeightConeContext,
    leaf: StreamedHeightPassingConeLeaf,
  ): boolean;
  statistics(): {
    cachedPointCount: number;
    decisionCount: number;
    splitDecisionCount: number;
    pruneDecisionCount: number;
    passingLeafCount: number;
  };
}

export interface ScalableStreamedHeightConeEvaluator {
  decide(
    context: ObstructionPrunedConeContext,
  ): ObstructionPrunedConeDecision<
    StreamedHeightLinkFailurePrune,
    StreamedHeightPassingConeLeaf
  >;
  decideProvisional(
    context: ObstructionPrunedConeContext,
  ): ObstructionPrunedConeDecision<
    StreamedHeightLinkFailurePrune,
    StreamedHeightProvisionalWitnessLeaf
  >;
  verifyPrune(
    context: ObstructionPrunedConeContext,
    proof: StreamedHeightLinkFailurePrune,
  ): boolean;
  verifySurvivor(
    context: ObstructionPrunedConeContext,
    leaf: StreamedHeightPassingConeLeaf,
  ): boolean;
  verifyProvisional(
    context: ObstructionPrunedConeContext,
    leaf: StreamedHeightProvisionalWitnessLeaf,
  ): boolean;
  evaluatePrimitiveWitness(
    primitiveWitness: readonly string[],
  ): StreamedHeightPrimitiveWitnessEvaluation;
  statistics(): ReturnType<StreamedHeightConeEvaluator["statistics"]>;
}

export interface StreamedHeightConeEvaluatorOptions {
  source: StreamedHeightConeTemplateSource;
  /** One polarity suffices when all antipodal character cones are retained. */
  sigma: -1 | 1;
  /** Retaining all point templates is convenient for small fixtures only. */
  cacheTemplates?: boolean;
}

interface PreparedGerm {
  id: string;
  pointDifference: number;
  coefficients: bigint[];
  normalKey?: string;
  normalMultiplierSign?: -1 | 1;
}

interface PreparedTemplate {
  source: StreamedTrackBLinearLinkTemplate;
  germs: PreparedGerm[];
  normalKeys: string[];
  primitiveNormalByKey: Map<string, string[]>;
}

interface DirectedLinkEvaluation {
  ascendingIndices: number[];
  descendingIndices: number[];
  ascendingComponents: number[][];
  descendingComponents: number[][];
  failures: StreamedTrackBLinkFailureKind[];
  linkDigest: string;
}

interface PartialLinkObstruction {
  failureKind: StreamedTrackBLinkFailureKind;
  direction: "ascending" | "descending";
  method:
    | "no-possible-link-vertices"
    | "forced-vertices-separated-in-possible-link";
  forcedIndices: number[];
  possibleIndices: number[];
  possibleComponents: number[][];
  forcedComponentWitnessIndices: number[];
}

interface SplitCandidate {
  normal: string[];
  occurrences: number;
  failingImpact: number;
}

/** The data used by the link calculation, independent of the cone backend. */
interface StreamedHeightEvaluationContext {
  rank: number;
  assignments: readonly {
    normal: string[];
    normalKey: string;
    sign: -1 | 0 | 1;
  }[];
  feasibility: {
    primitiveWitness: string[] | null;
  };
  depth: number;
  constraintDigest: string;
  backendCertificatePassed?: boolean;
}

interface StreamedHeightConeEvaluatorCore {
  decide(
    context: StreamedHeightEvaluationContext,
  ): StreamedHeightConeSearchDecision;
  verifyPrune(
    context: StreamedHeightEvaluationContext,
    proof: StreamedHeightLinkFailurePrune,
  ): boolean;
  verifyLeaf(
    context: StreamedHeightEvaluationContext,
    leaf: StreamedHeightPassingConeLeaf,
  ): boolean;
  decideProvisional(
    context: StreamedHeightEvaluationContext,
  ): HeightConeDecision<
    StreamedHeightLinkFailurePrune,
    StreamedHeightProvisionalWitnessLeaf
  >;
  verifyProvisional(
    context: StreamedHeightEvaluationContext,
    leaf: StreamedHeightProvisionalWitnessLeaf,
  ): boolean;
  evaluatePrimitiveWitness(
    primitiveWitness: readonly string[],
  ): StreamedHeightPrimitiveWitnessEvaluation;
  statistics(): ReturnType<StreamedHeightConeEvaluator["statistics"]>;
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

function canonicalCoefficient(value: string, context: string): bigint {
  if (!/^-?(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${context} is not a canonical decimal integer.`);
  }
  return BigInt(value);
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Canonical primitive normal with no rank-four implementation ceiling. */
function canonicalizeEvaluatorNormal(
  input: readonly bigint[] | readonly number[],
) {
  if (input.length < 1 || input.length > 256) {
    throw new RangeError("A streamed height normal must have rank in 1..256.");
  }
  const values = input.map(BigInt);
  let divisor = 0n;
  for (const value of values) divisor = greatestCommonDivisor(divisor, value);
  if (divisor === 0n) {
    const primitive = values.map(() => "0");
    return { zero: true, primitive, multiplier: "0", key: primitive.join(",") };
  }
  let primitive = values.map((value) => value / divisor);
  const orientation = primitive.find((value) => value !== 0n)! < 0n ? -1n : 1n;
  if (orientation < 0n) primitive = primitive.map((value) => -value);
  const serialized = primitive.map(String);
  return {
    zero: false,
    primitive: serialized,
    multiplier: (orientation * divisor).toString(),
    key: serialized.join(","),
  };
}

function dot(left: readonly bigint[], right: readonly bigint[]): bigint {
  let result = 0n;
  for (let index = 0; index < left.length; index += 1) {
    result += left[index] * right[index];
  }
  return result;
}

function selectedComponents(
  selected: readonly number[],
  adjacency: readonly Uint32Array[],
): number[][] {
  const unseen = new Uint8Array(adjacency.length);
  for (const index of selected) unseen[index] = 1;
  const components: number[][] = [];
  for (const root of selected) {
    if (unseen[root] === 0) continue;
    unseen[root] = 0;
    const component = [root];
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      for (const neighbor of adjacency[component[cursor]]) {
        if (unseen[neighbor] === 0) continue;
        unseen[neighbor] = 0;
        component.push(neighbor);
      }
    }
    component.sort((left, right) => left - right);
    components.push(component);
  }
  return components;
}

function proofHash<T extends { proofHash: string }>(proof: T): string {
  return canonicalSha256({ ...proof, proofHash: "" });
}

function leafHash<T extends { leafHash: string }>(leaf: T): string {
  return canonicalSha256({ ...leaf, leafHash: "" });
}

function sourceBindings(source: StreamedHeightConeTemplateSource): {
  sourceHash: string;
  latticeBasisDigest: string;
  cocycleSectionDigest: string;
  heightRuleDigest: string;
} {
  return {
    sourceHash: source.sourceHash,
    latticeBasisDigest: source.latticeBasisDigest,
    cocycleSectionDigest: source.cocycleSectionDigest,
    heightRuleDigest: source.heightRuleDigest,
  };
}

function bindingsMatch(
  source: StreamedHeightConeTemplateSource,
  stored: ReturnType<typeof sourceBindings>,
): boolean {
  return (
    canonicalSha256(sourceBindings(source)) ===
    canonicalSha256({
      sourceHash: stored.sourceHash,
      latticeBasisDigest: stored.latticeBasisDigest,
      cocycleSectionDigest: stored.cocycleSectionDigest,
      heightRuleDigest: stored.heightRuleDigest,
    })
  );
}

function expectedHeightRuleDigest(pointCount: number): string {
  return canonicalSha256({
    method: "integral-character-plus-fixed-global-point-order-offset",
    offsetDenominator: 4 * pointCount,
    offsetPolarities: [-1, 1],
    clearedDifferenceFormula:
      "4*degree*dot(coefficientForm,weight)+sigma*pointDifference",
    antipodalEquivalence: "(weight,sigma)~(-weight,-sigma)",
  });
}

/**
 * Adapt exact streamed pulling templates to the ternary cone-cover engine.
 *
 * A failure prunes a whole cone only after every nonzero germ normal at that
 * point has a fixed ternary sign. Before then the evaluator splits on the
 * first unresolved normal. Thus no link failure observed only at the chosen
 * primitive witness is promoted to a cone-wide claim.
 */
function createStreamedHeightConeEvaluatorCore(
  options: StreamedHeightConeEvaluatorOptions,
  certifyContext: (context: StreamedHeightEvaluationContext) => boolean,
): StreamedHeightConeEvaluatorCore {
  const { source, sigma, cacheTemplates = false } = options;
  const ambientPointCount = source.ambientPointCount ?? source.pointCount;
  const pointIds = source.pointIds
    ? [...source.pointIds]
    : Array.from({ length: source.pointCount }, (_unused, point) => point);
  if (
    !Number.isInteger(source.coordinateCount) ||
    source.coordinateCount < 1 ||
    source.coordinateCount > 256
  ) {
    throw new RangeError(
      "The streamed height evaluator supports ranks one through 256.",
    );
  }
  if (!Number.isInteger(source.pointCount) || source.pointCount < 1) {
    throw new RangeError(
      "A streamed height source needs a positive point count.",
    );
  }
  if (
    !Number.isInteger(ambientPointCount) ||
    ambientPointCount < source.pointCount
  ) {
    throw new RangeError(
      "The ambient quotient degree must be at least the tested point count.",
    );
  }
  if (
    pointIds.length !== source.pointCount ||
    pointIds.some(
      (point, index) =>
        !Number.isInteger(point) ||
        point < 0 ||
        point >= ambientPointCount ||
        (index > 0 && point <= pointIds[index - 1]),
    )
  ) {
    throw new Error(
      "The tested quotient-point ids must be distinct, increasing, and in range.",
    );
  }
  const pointIdSet = new Set(pointIds);
  if (sigma !== -1 && sigma !== 1) {
    throw new Error("The streamed height tie polarity must be +/-1.");
  }
  for (const [name, digest] of Object.entries(sourceBindings(source))) {
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new Error(`The streamed height source has an invalid ${name}.`);
    }
  }
  if (source.heightRuleDigest !== expectedHeightRuleDigest(ambientPointCount)) {
    throw new Error(
      "The streamed height source does not use the certified cleared height rule.",
    );
  }
  const cache = new Map<number, PreparedTemplate>();
  let decisionCount = 0;
  let splitDecisionCount = 0;
  let pruneDecisionCount = 0;
  let passingLeafCount = 0;

  const prepare = (point: number): PreparedTemplate => {
    const cached = cache.get(point);
    if (cached) return cached;
    if (!Number.isInteger(point) || !pointIdSet.has(point)) {
      throw new RangeError(`Template point ${point} is outside the source.`);
    }
    const template = source.templateAt(point);
    if (
      template.point !== point ||
      !template.adjacencyIncluded ||
      template.adjacency.length !== template.germs.length
    ) {
      throw new Error(
        `Template q${point} does not contain a complete adjacency graph.`,
      );
    }
    if (
      !/^[0-9a-f]{64}$/.test(template.templateDigest) ||
      !/^[0-9a-f]{64}$/.test(template.topologyDigest)
    ) {
      throw new Error(`Template q${point} has an invalid content digest.`);
    }
    const germIds = new Set<string>();
    const primitiveNormalByKey = new Map<string, string[]>();
    const germs: PreparedGerm[] = template.germs.map((germ, germIndex) => {
      if (germIds.has(germ.id)) {
        throw new Error(`Template q${point} repeats germ ${germ.id}.`);
      }
      if (germIndex > 0 && germ.id <= template.germs[germIndex - 1].id) {
        throw new Error(`Template q${point} has noncanonical germ order.`);
      }
      germIds.add(germ.id);
      if (
        !Number.isInteger(germ.otherPoint) ||
        germ.otherPoint < 0 ||
        germ.otherPoint >= ambientPointCount ||
        germ.otherPoint === point ||
        !Number.isSafeInteger(germ.pointDifference) ||
        germ.pointDifference !== germ.otherPoint - point
      ) {
        throw new Error(`${germ.id} has an invalid point-order difference.`);
      }
      const coefficients = Array.from(
        { length: source.coordinateCount },
        () => 0n,
      );
      let previousCoordinate = -1;
      for (const [coordinate, value] of germ.coefficientPairs) {
        if (
          !Number.isInteger(coordinate) ||
          coordinate <= previousCoordinate ||
          coordinate < 0 ||
          coordinate >= source.coordinateCount
        ) {
          throw new Error(`${germ.id} has noncanonical sparse coordinates.`);
        }
        previousCoordinate = coordinate;
        const coefficient = canonicalCoefficient(
          value,
          `${germ.id} coefficient ${coordinate}`,
        );
        if (coefficient === 0n) {
          throw new Error(`${germ.id} stores a zero sparse coefficient.`);
        }
        coefficients[coordinate] = coefficient;
      }
      const canonical = canonicalizeEvaluatorNormal(coefficients);
      if (canonical.zero) {
        return {
          id: germ.id,
          pointDifference: germ.pointDifference,
          coefficients,
        };
      }
      primitiveNormalByKey.set(canonical.key, canonical.primitive);
      return {
        id: germ.id,
        pointDifference: germ.pointDifference,
        coefficients,
        normalKey: canonical.key,
        normalMultiplierSign: BigInt(canonical.multiplier) < 0n ? -1 : 1,
      };
    });
    for (let left = 0; left < template.adjacency.length; left += 1) {
      const row = template.adjacency[left];
      let previous = -1;
      for (const right of row) {
        if (
          right <= previous ||
          right >= template.germs.length ||
          right === left ||
          !template.adjacency[right].includes(left)
        ) {
          throw new Error(
            `Template q${point} has invalid adjacency at germ ${left}.`,
          );
        }
        previous = right;
      }
    }
    const derivedEdges: Array<[string, string]> = [];
    for (let left = 0; left < template.adjacency.length; left += 1) {
      for (const right of template.adjacency[left]) {
        if (left < right) {
          derivedEdges.push([
            template.germs[left].id,
            template.germs[right].id,
          ]);
        }
      }
    }
    if (canonicalSha256(derivedEdges) !== canonicalSha256(template.edges)) {
      throw new Error(`Template q${point} edges disagree with its adjacency.`);
    }
    const recomputedTemplateDigest = canonicalSha256({
      schemaVersion: 1,
      method: "exact-integral-pulling-link-linear-template",
      sourceHash: source.sourceHash,
      point: template.point,
      maximalCellCount: template.maximalCellCount,
      germs: template.germs,
      adjacencyIncluded: template.adjacencyIncluded,
      edges: template.edges,
      topologyDigest: template.topologyDigest,
    });
    if (template.templateDigest !== recomputedTemplateDigest) {
      throw new Error(`Template q${point} content does not match its digest.`);
    }
    const normalKeys = [...primitiveNormalByKey.keys()].sort((left, right) =>
      compareIntegerVectors(
        primitiveNormalByKey.get(left)!,
        primitiveNormalByKey.get(right)!,
      ),
    );
    const prepared = {
      source: template,
      germs,
      normalKeys,
      primitiveNormalByKey,
    };
    if (cacheTemplates) cache.set(point, prepared);
    return prepared;
  };

  const evaluate = (
    prepared: PreparedTemplate,
    weight: readonly bigint[],
  ): DirectedLinkEvaluation => {
    const ascendingIndices: number[] = [];
    const descendingIndices: number[] = [];
    for (let germIndex = 0; germIndex < prepared.germs.length; germIndex += 1) {
      const germ = prepared.germs[germIndex];
      const raw = dot(germ.coefficients, weight);
      const sign =
        raw < 0n ? -1 : raw > 0n ? 1 : sigma * Math.sign(germ.pointDifference);
      if (sign > 0) ascendingIndices.push(germIndex);
      else descendingIndices.push(germIndex);
    }
    const ascendingComponents = selectedComponents(
      ascendingIndices,
      prepared.source.adjacency,
    );
    const descendingComponents = selectedComponents(
      descendingIndices,
      prepared.source.adjacency,
    );
    const failures: StreamedTrackBLinkFailureKind[] = [];
    if (ascendingIndices.length === 0) failures.push("ascending-empty");
    if (descendingIndices.length === 0) failures.push("descending-empty");
    if (ascendingIndices.length > 0 && ascendingComponents.length !== 1) {
      failures.push("ascending-disconnected");
    }
    if (descendingIndices.length > 0 && descendingComponents.length !== 1) {
      failures.push("descending-disconnected");
    }
    const germIds = prepared.germs.map((germ) => germ.id);
    const linkDigest = canonicalSha256({
      schemaVersion: 1,
      method: "fixed-polarity-integral-height-directed-link",
      templateDigest: prepared.source.templateDigest,
      sigma,
      ascending: ascendingIndices.map((index) => germIds[index]),
      descending: descendingIndices.map((index) => germIds[index]),
      ascendingComponents: ascendingComponents.map((component) =>
        component.map((index) => germIds[index]),
      ),
      descendingComponents: descendingComponents.map((component) =>
        component.map((index) => germIds[index]),
      ),
    });
    return {
      ascendingIndices,
      descendingIndices,
      ascendingComponents,
      descendingComponents,
      failures,
      linkDigest,
    };
  };

  const fixedGermDirection = (
    germ: PreparedGerm,
    assignmentByKey: ReadonlyMap<string, -1 | 0 | 1>,
  ): -1 | 1 | undefined => {
    if (!germ.normalKey) {
      return sigma * Math.sign(germ.pointDifference) < 0 ? -1 : 1;
    }
    const assignedSign = assignmentByKey.get(germ.normalKey);
    if (assignedSign === undefined) return undefined;
    if (assignedSign === 0) {
      return sigma * Math.sign(germ.pointDifference) < 0 ? -1 : 1;
    }
    return assignedSign * germ.normalMultiplierSign! < 0 ? -1 : 1;
  };

  /**
   * Unresolved germs are allowed on either side. The resulting possible graph
   * over-approximates every directed link in the cone. Consequently, forced
   * vertices in distinct possible-graph components can never be connected by
   * a later sign choice.
   */
  const partialObstruction = (
    prepared: PreparedTemplate,
    assignmentByKey: ReadonlyMap<string, -1 | 0 | 1>,
  ): PartialLinkObstruction | undefined => {
    const directions = prepared.germs.map((germ) =>
      fixedGermDirection(germ, assignmentByKey),
    );
    const inspect = (
      direction: "ascending" | "descending",
      sign: -1 | 1,
      emptyKind: StreamedTrackBLinkFailureKind,
      disconnectedKind: StreamedTrackBLinkFailureKind,
      allowDisconnected: boolean,
    ): PartialLinkObstruction | undefined => {
      const forcedIndices: number[] = [];
      const possibleIndices: number[] = [];
      for (let index = 0; index < directions.length; index += 1) {
        const fixed = directions[index];
        if (fixed === sign) forcedIndices.push(index);
        if (fixed === sign || fixed === undefined) possibleIndices.push(index);
      }
      if (possibleIndices.length === 0) {
        return {
          failureKind: emptyKind,
          direction,
          method: "no-possible-link-vertices",
          forcedIndices,
          possibleIndices,
          possibleComponents: [],
          forcedComponentWitnessIndices: [],
        };
      }
      if (!allowDisconnected) return undefined;
      const possibleComponents = selectedComponents(
        possibleIndices,
        prepared.source.adjacency,
      );
      const forced = new Set(forcedIndices);
      const forcedComponentWitnessIndices = possibleComponents.flatMap(
        (component) => {
          const witness = component.find((index) => forced.has(index));
          return witness === undefined ? [] : [witness];
        },
      );
      if (forcedComponentWitnessIndices.length < 2) return undefined;
      return {
        failureKind: disconnectedKind,
        direction,
        method: "forced-vertices-separated-in-possible-link",
        forcedIndices,
        possibleIndices,
        possibleComponents,
        forcedComponentWitnessIndices,
      };
    };

    // Match the public Track-B failure ordering: emptiness before connectivity.
    return (
      inspect(
        "ascending",
        1,
        "ascending-empty",
        "ascending-disconnected",
        false,
      ) ??
      inspect(
        "descending",
        -1,
        "descending-empty",
        "descending-disconnected",
        false,
      ) ??
      inspect(
        "ascending",
        1,
        "ascending-empty",
        "ascending-disconnected",
        true,
      ) ??
      inspect(
        "descending",
        -1,
        "descending-empty",
        "descending-disconnected",
        true,
      )
    );
  };

  const contextWeight = (
    context: StreamedHeightEvaluationContext,
  ): bigint[] => {
    if (
      context.rank !== source.coordinateCount ||
      context.feasibility.primitiveWitness === null ||
      context.feasibility.primitiveWitness.length !== source.coordinateCount
    ) {
      throw new Error(
        "The cone context has no primitive character of the declared rank.",
      );
    }
    return context.feasibility.primitiveWitness.map((value) => BigInt(value));
  };

  const contextIsCertified = (
    context: StreamedHeightEvaluationContext,
  ): boolean => {
    if (
      context.rank !== source.coordinateCount ||
      context.depth !== context.assignments.length ||
      context.constraintDigest !==
        canonicalSha256(
          context.assignments.map((assignment) => ({
            normal: assignment.normal,
            normalKey: assignment.normalKey,
            sign: assignment.sign,
          })),
        )
    ) {
      return false;
    }
    return certifyContext(context);
  };

  const makeFailureProof = (
    context: StreamedHeightEvaluationContext,
    prepared: PreparedTemplate,
    evaluation: DirectedLinkEvaluation,
    obstruction: PartialLinkObstruction,
    assignmentByKey: ReadonlyMap<string, -1 | 0 | 1>,
  ): StreamedHeightLinkFailurePrune => {
    const componentIndices =
      obstruction.direction === "ascending"
        ? evaluation.ascendingComponents
        : evaluation.descendingComponents;
    const components = componentIndices.map((component) =>
      component.map((index) => prepared.germs[index].id),
    );
    const pointNormalSetDigest = canonicalSha256(prepared.normalKeys);
    const assignedPointNormalKeys = prepared.normalKeys.filter((key) =>
      assignmentByKey.has(key),
    );
    const forcedGermIds = obstruction.forcedIndices.map(
      (index) => prepared.germs[index].id,
    );
    const possibleGermIds = obstruction.possibleIndices.map(
      (index) => prepared.germs[index].id,
    );
    const possibleComponents = obstruction.possibleComponents.map((component) =>
      component.map((index) => prepared.germs[index].id),
    );
    const forcedComponentWitnesses =
      obstruction.forcedComponentWitnessIndices.map(
        (index) => prepared.germs[index].id,
      );
    const obstructionRecord = {
      failureKind: obstruction.failureKind,
      direction: obstruction.direction,
      obstructionMethod: obstruction.method,
      forcedGermCount: forcedGermIds.length,
      forcedGermDigest: canonicalSha256(forcedGermIds),
      possibleGermCount: possibleGermIds.length,
      possibleGermDigest: canonicalSha256(possibleGermIds),
      possibleComponentCount: possibleComponents.length,
      possibleComponentsDigest: canonicalSha256(possibleComponents),
      forcedComponentWitnessCount: forcedComponentWitnesses.length,
      forcedComponentWitnessDigest: canonicalSha256(forcedComponentWitnesses),
      forcedComponentWitnessExcerpt: forcedComponentWitnesses.slice(0, 2),
    };
    const componentSizes = components.map((component) => component.length);
    const obstructionDigest = canonicalSha256(obstructionRecord);
    const withoutHash = {
      schemaVersion: 2 as const,
      kind: "streamed-track-b-invariant-link-failure" as const,
      ...sourceBindings(source),
      sigma,
      coneConstraintDigest: context.constraintDigest,
      point: prepared.source.point,
      templateDigest: prepared.source.templateDigest,
      topologyDigest: prepared.source.topologyDigest,
      pointNormalCount: prepared.normalKeys.length,
      pointNormalSetDigest,
      assignedPointNormalCount: assignedPointNormalKeys.length,
      assignedPointNormalSetDigest: canonicalSha256(assignedPointNormalKeys),
      ...obstructionRecord,
      obstructionDigest,
      actualComponentCount: components.length,
      actualGermCount: componentSizes.reduce(
        (total, componentSize) => total + componentSize,
        0,
      ),
      actualComponentsDigest: canonicalSha256(components),
      actualComponentSizesDigest: canonicalSha256(componentSizes),
      linkDigest: evaluation.linkDigest,
      proofHash: "",
    };
    return { ...withoutHash, proofHash: proofHash(withoutHash) };
  };

  const decideWithMode = (
    context: StreamedHeightEvaluationContext,
    allowProvisionalWitness: boolean,
  ): HeightConeDecision<
    StreamedHeightLinkFailurePrune,
    StreamedHeightPassingConeLeaf | StreamedHeightProvisionalWitnessLeaf
  > => {
    decisionCount += 1;
    if (!contextIsCertified(context)) {
      throw new Error(
        "The streamed height evaluator received an uncertified cone context.",
      );
    }
    const weight = contextWeight(context);
    const assignmentByKey = new Map(
      context.assignments.map(
        (assignment) => [assignment.normalKey, assignment.sign] as const,
      ),
    );
    const containsZero = context.assignments.every(
      (assignment) => assignment.sign === 0,
    );
    const splitCandidates = new Map<string, SplitCandidate>();
    const pointResultRecords: Array<[number, string, string]> = [];
    let everyPointPasses = true;
    for (const point of pointIds) {
      const prepared = prepare(point);
      for (const germ of prepared.germs) {
        if (!germ.normalKey) continue;
        const existing = splitCandidates.get(germ.normalKey);
        if (existing) {
          existing.occurrences += 1;
        } else {
          splitCandidates.set(germ.normalKey, {
            normal: prepared.primitiveNormalByKey.get(germ.normalKey)!,
            occurrences: 1,
            failingImpact: 0,
          });
        }
      }
      const evaluation = evaluate(prepared, weight);
      pointResultRecords.push([
        point,
        prepared.source.templateDigest,
        evaluation.linkDigest,
      ]);
      const obstruction = partialObstruction(prepared, assignmentByKey);
      if (obstruction && !containsZero) {
        pruneDecisionCount += 1;
        return {
          kind: "prune",
          proof: makeFailureProof(
            context,
            prepared,
            evaluation,
            obstruction,
            assignmentByKey,
          ),
        };
      }
      if (evaluation.failures.length === 0) continue;
      everyPointPasses = false;
      for (const germ of prepared.germs) {
        if (!germ.normalKey || assignmentByKey.has(germ.normalKey)) continue;
        splitCandidates.get(germ.normalKey)!.failingImpact +=
          evaluation.failures.length;
      }
    }
    const unresolved = [...splitCandidates.entries()]
      .filter(([key]) => !assignmentByKey.has(key))
      .sort((left, right) => {
        if (left[1].failingImpact !== right[1].failingImpact) {
          return right[1].failingImpact - left[1].failingImpact;
        }
        if (left[1].occurrences !== right[1].occurrences) {
          return right[1].occurrences - left[1].occurrences;
        }
        return compareIntegerVectors(left[1].normal, right[1].normal);
      });
    const normalKeys = [...splitCandidates.keys()].sort((left, right) =>
      compareIntegerVectors(
        splitCandidates.get(left)!.normal,
        splitCandidates.get(right)!.normal,
      ),
    );
    if (allowProvisionalWitness && everyPointPasses) {
      const assignedNormalCount = normalKeys.filter((key) =>
        assignmentByKey.has(key),
      ).length;
      const provisionalWithoutHash = {
        schemaVersion: 1 as const,
        kind: "streamed-track-b-provisional-passing-witness" as const,
        ...sourceBindings(source),
        sigma,
        coneConstraintDigest: context.constraintDigest,
        checkedPointIds: [...pointIds],
        primitiveWitness: context.feasibility.primitiveWitness!,
        normalCount: normalKeys.length,
        assignedNormalCount,
        unresolvedNormalCount: normalKeys.length - assignedNormalCount,
        normalCatalogueDigest: canonicalSha256(normalKeys),
        pointResultDigest: canonicalSha256(pointResultRecords),
        leafHash: "",
      };
      passingLeafCount += 1;
      return {
        kind: "leaf",
        value: {
          ...provisionalWithoutHash,
          leafHash: leafHash(provisionalWithoutHash),
        },
      };
    }
    if (unresolved.length > 0) {
      splitDecisionCount += 1;
      return { kind: "split", normal: unresolved[0][1].normal };
    }
    if (containsZero) {
      // Actual height normals need not span the full dual space. Supplemental
      // coordinate cuts isolate the zero character without changing a link.
      for (
        let coordinate = 0;
        coordinate < source.coordinateCount;
        coordinate += 1
      ) {
        const normal = Array.from(
          { length: source.coordinateCount },
          (_unused, index) => (index === coordinate ? 1 : 0),
        );
        const canonical = canonicalizeEvaluatorNormal(normal);
        if (!assignmentByKey.has(canonical.key)) {
          splitDecisionCount += 1;
          return { kind: "split", normal };
        }
      }
      throw new Error(
        "A positive-dimensional all-zero cone has full coordinate rank.",
      );
    }
    if (!everyPointPasses) {
      throw new Error(
        "A fully assigned failing link lacks its expected partial obstruction.",
      );
    }
    const withoutHash = {
      schemaVersion: 1 as const,
      kind: "streamed-track-b-all-links-pass" as const,
      ...sourceBindings(source),
      sigma,
      coneConstraintDigest: context.constraintDigest,
      checkedPointCount: source.pointCount,
      normalCount: normalKeys.length,
      normalCatalogueDigest: canonicalSha256(normalKeys),
      pointResultDigest: canonicalSha256(pointResultRecords),
      leafHash: "",
    };
    passingLeafCount += 1;
    return {
      kind: "leaf",
      value: { ...withoutHash, leafHash: leafHash(withoutHash) },
    };
  };

  const decide = (
    context: StreamedHeightEvaluationContext,
  ): StreamedHeightConeSearchDecision => {
    const decision = decideWithMode(context, false);
    if (
      decision.kind === "leaf" &&
      decision.value.kind !== "streamed-track-b-all-links-pass"
    ) {
      throw new Error(
        "The exhaustive cone evaluator emitted a provisional leaf.",
      );
    }
    return decision as StreamedHeightConeSearchDecision;
  };

  const decideProvisional = (
    context: StreamedHeightEvaluationContext,
  ): HeightConeDecision<
    StreamedHeightLinkFailurePrune,
    StreamedHeightProvisionalWitnessLeaf
  > => {
    const decision = decideWithMode(context, true);
    if (
      decision.kind === "leaf" &&
      decision.value.kind !== "streamed-track-b-provisional-passing-witness"
    ) {
      throw new Error("The exploratory cone evaluator emitted a final leaf.");
    }
    return decision as HeightConeDecision<
      StreamedHeightLinkFailurePrune,
      StreamedHeightProvisionalWitnessLeaf
    >;
  };

  const verifyPrune = (
    context: StreamedHeightEvaluationContext,
    proof: StreamedHeightLinkFailurePrune,
  ): boolean => {
    try {
      if (
        !contextIsCertified(context) ||
        proof.kind !== "streamed-track-b-invariant-link-failure" ||
        proof.schemaVersion !== 2 ||
        proof.sigma !== sigma ||
        proof.coneConstraintDigest !== context.constraintDigest ||
        proof.proofHash !== proofHash(proof) ||
        !bindingsMatch(source, proof) ||
        !Number.isInteger(proof.point) ||
        proof.point < 0 ||
        !pointIdSet.has(proof.point)
      ) {
        return false;
      }
      const prepared = prepare(proof.point);
      if (
        proof.templateDigest !== prepared.source.templateDigest ||
        proof.topologyDigest !== prepared.source.topologyDigest ||
        proof.pointNormalCount !== prepared.normalKeys.length ||
        canonicalSha256(prepared.normalKeys) !== proof.pointNormalSetDigest
      ) {
        return false;
      }
      if (context.assignments.every((assignment) => assignment.sign === 0)) {
        return false;
      }
      const assignmentByKey = new Map(
        context.assignments.map(
          (assignment) => [assignment.normalKey, assignment.sign] as const,
        ),
      );
      const assignedPointNormalKeys = prepared.normalKeys.filter((key) =>
        assignmentByKey.has(key),
      );
      if (
        assignedPointNormalKeys.length !== proof.assignedPointNormalCount ||
        canonicalSha256(assignedPointNormalKeys) !==
          proof.assignedPointNormalSetDigest
      ) {
        return false;
      }
      const obstruction = partialObstruction(prepared, assignmentByKey);
      if (!obstruction || obstruction.failureKind !== proof.failureKind)
        return false;
      const forcedGermIds = obstruction.forcedIndices.map(
        (index) => prepared.germs[index].id,
      );
      const possibleGermIds = obstruction.possibleIndices.map(
        (index) => prepared.germs[index].id,
      );
      const possibleComponents = obstruction.possibleComponents.map(
        (component) => component.map((index) => prepared.germs[index].id),
      );
      const forcedComponentWitnesses =
        obstruction.forcedComponentWitnessIndices.map(
          (index) => prepared.germs[index].id,
        );
      const obstructionRecord = {
        failureKind: obstruction.failureKind,
        direction: obstruction.direction,
        obstructionMethod: obstruction.method,
        forcedGermCount: forcedGermIds.length,
        forcedGermDigest: canonicalSha256(forcedGermIds),
        possibleGermCount: possibleGermIds.length,
        possibleGermDigest: canonicalSha256(possibleGermIds),
        possibleComponentCount: possibleComponents.length,
        possibleComponentsDigest: canonicalSha256(possibleComponents),
        forcedComponentWitnessCount: forcedComponentWitnesses.length,
        forcedComponentWitnessDigest: canonicalSha256(forcedComponentWitnesses),
        forcedComponentWitnessExcerpt: forcedComponentWitnesses.slice(0, 2),
      };
      if (
        proof.direction !== obstruction.direction ||
        proof.obstructionMethod !== obstruction.method ||
        proof.obstructionDigest !== canonicalSha256(obstructionRecord) ||
        canonicalSha256({
          failureKind: proof.failureKind,
          direction: proof.direction,
          obstructionMethod: proof.obstructionMethod,
          forcedGermCount: proof.forcedGermCount,
          forcedGermDigest: proof.forcedGermDigest,
          possibleGermCount: proof.possibleGermCount,
          possibleGermDigest: proof.possibleGermDigest,
          possibleComponentCount: proof.possibleComponentCount,
          possibleComponentsDigest: proof.possibleComponentsDigest,
          forcedComponentWitnessCount: proof.forcedComponentWitnessCount,
          forcedComponentWitnessDigest: proof.forcedComponentWitnessDigest,
          forcedComponentWitnessExcerpt: proof.forcedComponentWitnessExcerpt,
        }) !== proof.obstructionDigest ||
        canonicalSha256(obstructionRecord) !==
          canonicalSha256({
            failureKind: proof.failureKind,
            direction: proof.direction,
            obstructionMethod: proof.obstructionMethod,
            forcedGermCount: proof.forcedGermCount,
            forcedGermDigest: proof.forcedGermDigest,
            possibleGermCount: proof.possibleGermCount,
            possibleGermDigest: proof.possibleGermDigest,
            possibleComponentCount: proof.possibleComponentCount,
            possibleComponentsDigest: proof.possibleComponentsDigest,
            forcedComponentWitnessCount: proof.forcedComponentWitnessCount,
            forcedComponentWitnessDigest: proof.forcedComponentWitnessDigest,
            forcedComponentWitnessExcerpt: proof.forcedComponentWitnessExcerpt,
          })
      ) {
        return false;
      }
      const evaluation = evaluate(prepared, contextWeight(context));
      if (!evaluation.failures.includes(proof.failureKind)) return false;
      const componentIndices =
        obstruction.direction === "ascending"
          ? evaluation.ascendingComponents
          : evaluation.descendingComponents;
      const components = componentIndices.map((component) =>
        component.map((index) => prepared.germs[index].id),
      );
      const componentSizes = components.map((component) => component.length);
      return (
        evaluation.linkDigest === proof.linkDigest &&
        components.length === proof.actualComponentCount &&
        componentSizes.reduce(
          (total, componentSize) => total + componentSize,
          0,
        ) === proof.actualGermCount &&
        canonicalSha256(components) === proof.actualComponentsDigest &&
        canonicalSha256(componentSizes) === proof.actualComponentSizesDigest
      );
    } catch {
      return false;
    }
  };

  const verifyLeaf = (
    context: StreamedHeightEvaluationContext,
    leaf: StreamedHeightPassingConeLeaf,
  ): boolean => {
    try {
      if (
        !contextIsCertified(context) ||
        leaf.kind !== "streamed-track-b-all-links-pass" ||
        leaf.schemaVersion !== 1 ||
        leaf.sigma !== sigma ||
        leaf.coneConstraintDigest !== context.constraintDigest ||
        leaf.leafHash !== leafHash(leaf) ||
        !bindingsMatch(source, leaf) ||
        leaf.checkedPointCount !== source.pointCount ||
        context.assignments.every((assignment) => assignment.sign === 0)
      ) {
        return false;
      }
      const weight = contextWeight(context);
      const assignedKeys = new Set(
        context.assignments.map((assignment) => assignment.normalKey),
      );
      const globalNormals = new Map<string, string[]>();
      const pointResultRecords: Array<[number, string, string]> = [];
      for (const point of pointIds) {
        const prepared = prepare(point);
        for (const key of prepared.normalKeys) {
          globalNormals.set(key, prepared.primitiveNormalByKey.get(key)!);
        }
        const evaluation = evaluate(prepared, weight);
        if (evaluation.failures.length > 0) return false;
        pointResultRecords.push([
          point,
          prepared.source.templateDigest,
          evaluation.linkDigest,
        ]);
      }
      const normalKeys = [...globalNormals.keys()].sort((left, right) =>
        compareIntegerVectors(
          globalNormals.get(left)!,
          globalNormals.get(right)!,
        ),
      );
      return (
        normalKeys.every((key) => assignedKeys.has(key)) &&
        leaf.normalCount === normalKeys.length &&
        leaf.normalCatalogueDigest === canonicalSha256(normalKeys) &&
        leaf.pointResultDigest === canonicalSha256(pointResultRecords)
      );
    } catch {
      return false;
    }
  };

  const evaluatePrimitiveWitness = (
    primitiveWitness: readonly string[],
  ): StreamedHeightPrimitiveWitnessEvaluation => {
    if (primitiveWitness.length !== source.coordinateCount) {
      throw new Error("A primitive height witness has the wrong rank.");
    }
    const weight = primitiveWitness.map((value, coordinate) =>
      canonicalCoefficient(value, `primitive witness coordinate ${coordinate}`),
    );
    let divisor = 0n;
    for (const value of weight) {
      divisor = greatestCommonDivisor(divisor, value);
    }
    if (divisor !== 1n) {
      throw new Error("A height witness must be nonzero and primitive.");
    }
    const pointResultRecords: Array<[number, string, string]> = [];
    let firstFailure: StreamedHeightPrimitiveWitnessEvaluation["firstFailure"] =
      null;
    for (const point of pointIds) {
      const prepared = prepare(point);
      const evaluation = evaluate(prepared, weight);
      pointResultRecords.push([
        point,
        prepared.source.templateDigest,
        evaluation.linkDigest,
      ]);
      if (evaluation.failures.length > 0) {
        firstFailure = {
          point,
          failures: [...evaluation.failures],
          templateDigest: prepared.source.templateDigest,
          linkDigest: evaluation.linkDigest,
        };
        break;
      }
    }
    return {
      checkedPointCount: pointResultRecords.length,
      everyPointPasses:
        firstFailure === null && pointResultRecords.length === pointIds.length,
      firstFailure,
      pointResultRecords,
      pointResultDigest: canonicalSha256(pointResultRecords),
    };
  };

  const verifyProvisional = (
    context: StreamedHeightEvaluationContext,
    leaf: StreamedHeightProvisionalWitnessLeaf,
  ): boolean => {
    try {
      if (
        !contextIsCertified(context) ||
        leaf.kind !== "streamed-track-b-provisional-passing-witness" ||
        leaf.schemaVersion !== 1 ||
        leaf.sigma !== sigma ||
        leaf.coneConstraintDigest !== context.constraintDigest ||
        leaf.leafHash !== leafHash(leaf) ||
        !bindingsMatch(source, leaf) ||
        canonicalSha256(leaf.checkedPointIds) !== canonicalSha256(pointIds) ||
        context.feasibility.primitiveWitness === null ||
        canonicalSha256(leaf.primitiveWitness) !==
          canonicalSha256(context.feasibility.primitiveWitness)
      ) {
        return false;
      }
      const result = evaluatePrimitiveWitness(leaf.primitiveWitness);
      if (
        !result.everyPointPasses ||
        result.checkedPointCount !== pointIds.length ||
        result.pointResultDigest !== leaf.pointResultDigest
      ) {
        return false;
      }
      const assignedKeys = new Set(
        context.assignments.map((assignment) => assignment.normalKey),
      );
      const globalNormals = new Map<string, string[]>();
      for (const point of pointIds) {
        const prepared = prepare(point);
        for (const key of prepared.normalKeys) {
          globalNormals.set(key, prepared.primitiveNormalByKey.get(key)!);
        }
      }
      const normalKeys = [...globalNormals.keys()].sort((left, right) =>
        compareIntegerVectors(
          globalNormals.get(left)!,
          globalNormals.get(right)!,
        ),
      );
      const assignedNormalCount = normalKeys.filter((key) =>
        assignedKeys.has(key),
      ).length;
      return (
        leaf.normalCount === normalKeys.length &&
        leaf.assignedNormalCount === assignedNormalCount &&
        leaf.unresolvedNormalCount ===
          normalKeys.length - assignedNormalCount &&
        leaf.normalCatalogueDigest === canonicalSha256(normalKeys)
      );
    } catch {
      return false;
    }
  };

  return {
    decide,
    decideProvisional,
    verifyPrune,
    verifyLeaf,
    verifyProvisional,
    evaluatePrimitiveWitness,
    statistics: () => ({
      cachedPointCount: cache.size,
      decisionCount,
      splitDecisionCount,
      pruneDecisionCount,
      passingLeafCount,
    }),
  };
}

/** Rank-at-most-four adapter for the in-process Fourier--Motzkin engine. */
export function createStreamedHeightConeEvaluator(
  options: StreamedHeightConeEvaluatorOptions,
): StreamedHeightConeEvaluator {
  const core = createStreamedHeightConeEvaluatorCore(
    options,
    (context) =>
      replayHeightConeCertificate(
        context.rank,
        context.assignments,
        context.feasibility as HeightConeContext["feasibility"],
      ).passed,
  );
  return {
    decide: (context) => core.decide(context),
    verifyPrune: (context, proof) => core.verifyPrune(context, proof),
    verifyLeaf: (context, leaf) => core.verifyLeaf(context, leaf),
    statistics: core.statistics,
  };
}

function normalizeScalableContext(
  context: ObstructionPrunedConeContext,
): StreamedHeightEvaluationContext {
  const replay = replayExactConeOracleCertificate(
    context.request,
    context.certificate,
  );
  return {
    rank: context.request.rank,
    assignments: context.request.assignments,
    feasibility: context.feasibility,
    depth: context.depth,
    constraintDigest: context.request.constraintDigest,
    backendCertificatePassed:
      replay.passed && context.certificate.result === context.feasibility,
  };
}

/**
 * Scalable adapter for the external exact rational-cone backend.
 *
 * The link logic is the same as in the small-rank engine. Only cone
 * feasibility changes: every context carries the external certificate that
 * the adapter replays before it can emit a split, obstruction, or survivor.
 */
export function createScalableStreamedHeightConeEvaluator(
  options: StreamedHeightConeEvaluatorOptions,
): ScalableStreamedHeightConeEvaluator {
  const core = createStreamedHeightConeEvaluatorCore(
    options,
    (context) => context.backendCertificatePassed === true,
  );
  return {
    decide(context) {
      const decision = core.decide(normalizeScalableContext(context));
      return decision.kind === "leaf"
        ? { kind: "survivor", value: decision.value }
        : decision;
    },
    decideProvisional(context) {
      const decision = core.decideProvisional(
        normalizeScalableContext(context),
      );
      return decision.kind === "leaf"
        ? { kind: "survivor", value: decision.value }
        : decision;
    },
    verifyPrune(context, proof) {
      return core.verifyPrune(normalizeScalableContext(context), proof);
    },
    verifySurvivor(context, leaf) {
      return core.verifyLeaf(normalizeScalableContext(context), leaf);
    },
    verifyProvisional(context, leaf) {
      return core.verifyProvisional(normalizeScalableContext(context), leaf);
    },
    evaluatePrimitiveWitness: core.evaluatePrimitiveWitness,
    statistics: core.statistics,
  };
}
