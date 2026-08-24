import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  evaluateCubeRescueLocalTemplate,
  searchCubeRescuePeriodicPotential,
  type CubeRescueLinkEvaluation,
  type CubeRescuePotential,
  type CubeRescuePotentialSearchBounds,
  type CubeRescuePotentialSearchResult,
  type CubeRescueSubdivisionFamily,
} from "./cubeRescue";
import {
  cubeRescueSubdivisionVertexLinksAreCertified,
  type CubeRescueLocalTemplateBuilder,
  type CubeRescueSubdivisionVertexLinkCertificate,
} from "./cubeRescueTopology";

export interface CubeRescueOriginalVertexCegarBounds {
  maxRounds: number;
  maxCounterexamplesPerRound: number;
  constraintSearchBounds: CubeRescuePotentialSearchBounds;
}

export interface CubeRescueOriginalVertexCegarRound {
  round: number;
  activePointIdsBefore: number[];
  activeTemplateDigests: string[];
  constraintSearch: CubeRescuePotentialSearchResult;
  scan:
    | { status: "not-run" }
    | {
        status: "counterexample-found" | "all-original-vertices-pass";
        checkedPointCount: number;
        checkedPointEvaluationDigest: string;
        counterexamplePointIds: number[];
        counterexampleEvaluations: CubeRescueLinkEvaluation[];
      };
  activePointIdsAfter: number[];
  roundDigest: string;
}

export interface CubeRescueOriginalVertexCegarResult {
  schemaVersion: 1;
  kind: "bounded-exact-original-vertex-link-cegar";
  status:
    | "all-original-vertices-pass"
    | "constraint-search-not-found-within-bounds"
    | "round-limit";
  method: "active-link-constraints-then-exhaustive-first-counterexample-scan";
  degree: number;
  primitiveWitness: string[];
  sigma: -1 | 1;
  orderId: string;
  orderDigest: string;
  subdivisionFamily: CubeRescueSubdivisionFamily;
  initialPointIds: number[];
  bounds: CubeRescueOriginalVertexCegarBounds;
  rounds: CubeRescueOriginalVertexCegarRound[];
  finalActivePointIds: number[];
  finalPotential: CubeRescuePotential;
  checkedAllOriginalVerticesInFinalRound: boolean;
  subdivisionVertexLinks: CubeRescueSubdivisionVertexLinkCertificate;
  cegarDigest: string;
  nonClaims: string[];
}

function sealRound(
  value: Omit<CubeRescueOriginalVertexCegarRound, "roundDigest">,
): CubeRescueOriginalVertexCegarRound {
  return { ...value, roundDigest: canonicalSha256(value) };
}

function validateBounds(bounds: CubeRescueOriginalVertexCegarBounds): void {
  if (
    !Number.isSafeInteger(bounds.maxRounds) ||
    bounds.maxRounds < 1 ||
    !Number.isSafeInteger(bounds.maxCounterexamplesPerRound) ||
    bounds.maxCounterexamplesPerRound < 1
  ) {
    throw new Error(
      "The original-vertex CEGAR bounds must be positive safe integers.",
    );
  }
}

/**
 * Bounded CEGAR on the finite quotient: solve the active exact link constraints,
 * then scan q0,...,q(degree-1) until the declared counterexample batch is full.
 */
export function runCubeRescueOriginalVertexCegar(options: {
  builder: CubeRescueLocalTemplateBuilder;
  subdivisionFamily: CubeRescueSubdivisionFamily;
  primitiveWitness: readonly string[];
  sigma: -1 | 1;
  initialPointIds: readonly number[];
  initialPotential: CubeRescuePotential;
  bounds: CubeRescueOriginalVertexCegarBounds;
}): CubeRescueOriginalVertexCegarResult {
  validateBounds(options.bounds);
  const degree = options.builder.order.degree;
  const subdivisionVertexLinks =
    options.builder.subdivisionVertexLinks[options.subdivisionFamily];
  if (
    subdivisionVertexLinks.orderId !== options.builder.order.id ||
    subdivisionVertexLinks.orderDigest !== options.builder.order.orderDigest ||
    subdivisionVertexLinks.sourceDigest !== options.builder.sourceDigest ||
    !cubeRescueSubdivisionVertexLinksAreCertified(subdivisionVertexLinks)
  ) {
    throw new Error(
      "The original-vertex CEGAR lacks a compatible subdivision-vertex link certificate.",
    );
  }
  let activePointIds = [...new Set(options.initialPointIds)].sort(
    (left, right) => left - right,
  );
  if (
    activePointIds.length === 0 ||
    activePointIds.some(
      (point) => !Number.isSafeInteger(point) || point < 0 || point >= degree,
    )
  ) {
    throw new Error(
      "The original-vertex CEGAR needs canonical in-range seed points.",
    );
  }
  const initialPointIds = [...activePointIds];
  const buildTemplate = (point: number, cache = true) => {
    const template = options.builder.build(
      point,
      options.subdivisionFamily,
      cache,
    );
    if (
      template.point !== point ||
      template.degree !== degree ||
      template.orderId !== options.builder.order.id ||
      template.orderDigest !== options.builder.order.orderDigest ||
      template.subdivisionFamily !== options.subdivisionFamily
    ) {
      throw new Error(
        `The CEGAR template at q${point} is not bound to its global portfolio.`,
      );
    }
    return template;
  };
  let potential = options.initialPotential;
  const rounds: CubeRescueOriginalVertexCegarRound[] = [];
  let status: CubeRescueOriginalVertexCegarResult["status"] = "round-limit";
  let checkedAllOriginalVerticesInFinalRound = false;
  for (let round = 0; round < options.bounds.maxRounds; round += 1) {
    const activePointIdsBefore = [...activePointIds];
    const templates = activePointIds.map((point) => buildTemplate(point));
    const constraintSearch = searchCubeRescuePeriodicPotential({
      templates,
      primitiveWitness: options.primitiveWitness,
      sigma: options.sigma,
      initialPotential: potential,
      bounds: options.bounds.constraintSearchBounds,
    });
    potential = constraintSearch.potential;
    if (constraintSearch.status !== "connector-found") {
      rounds.push(
        sealRound({
          round,
          activePointIdsBefore,
          activeTemplateDigests: templates.map(
            ({ templateDigest }) => templateDigest,
          ),
          constraintSearch,
          scan: { status: "not-run" },
          activePointIdsAfter: [...activePointIds],
        }),
      );
      status = "constraint-search-not-found-within-bounds";
      break;
    }
    const evaluationRecords: Array<[number, string]> = [];
    const counterexamplePointIds: number[] = [];
    const counterexampleEvaluations: CubeRescueLinkEvaluation[] = [];
    let checkedPointCount = 0;
    const activeSet = new Set(activePointIds);
    for (let point = 0; point < degree; point += 1) {
      const template = buildTemplate(point, activeSet.has(point));
      const evaluation = evaluateCubeRescueLocalTemplate({
        template,
        primitiveWitness: options.primitiveWitness,
        potential,
        sigma: options.sigma,
      });
      evaluationRecords.push([point, evaluation.evaluationDigest]);
      checkedPointCount += 1;
      if (evaluation.failures.length > 0) {
        counterexamplePointIds.push(point);
        counterexampleEvaluations.push(evaluation);
        if (
          counterexamplePointIds.length >=
          options.bounds.maxCounterexamplesPerRound
        ) {
          break;
        }
      }
    }
    const exhaustive =
      checkedPointCount === degree && counterexamplePointIds.length === 0;
    const scan = {
      status: exhaustive
        ? ("all-original-vertices-pass" as const)
        : ("counterexample-found" as const),
      checkedPointCount,
      checkedPointEvaluationDigest: canonicalSha256(evaluationRecords),
      counterexamplePointIds,
      counterexampleEvaluations,
    };
    if (exhaustive) {
      checkedAllOriginalVerticesInFinalRound = true;
      status = "all-original-vertices-pass";
    } else {
      activePointIds = [
        ...new Set([...activePointIds, ...counterexamplePointIds]),
      ].sort((left, right) => left - right);
    }
    rounds.push(
      sealRound({
        round,
        activePointIdsBefore,
        activeTemplateDigests: templates.map(
          ({ templateDigest }) => templateDigest,
        ),
        constraintSearch,
        scan,
        activePointIdsAfter: [...activePointIds],
      }),
    );
    if (exhaustive) break;
  }
  const withoutDigest = {
    schemaVersion: 1 as const,
    kind: "bounded-exact-original-vertex-link-cegar" as const,
    status,
    method:
      "active-link-constraints-then-exhaustive-first-counterexample-scan" as const,
    degree,
    primitiveWitness: [...options.primitiveWitness],
    sigma: options.sigma,
    orderId: options.builder.order.id,
    orderDigest: options.builder.order.orderDigest,
    subdivisionFamily: options.subdivisionFamily,
    initialPointIds,
    bounds: {
      ...options.bounds,
      constraintSearchBounds: { ...options.bounds.constraintSearchBounds },
    },
    rounds,
    finalActivePointIds: [...activePointIds],
    finalPotential: potential,
    checkedAllOriginalVerticesInFinalRound,
    subdivisionVertexLinks,
    nonClaims: [
      "Round-limit and constraint-search failures are bounded-search outcomes, not global infeasibility certificates.",
      "Only an exhaustive original-vertex scan, together with the recorded subdivision-vertex link certificate, covers all vertices of the declared subdivided quotient.",
    ],
  };
  return { ...withoutDigest, cegarDigest: canonicalSha256(withoutDigest) };
}
