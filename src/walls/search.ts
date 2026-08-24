import type { BarXCompressedComplex } from "../compression/types";
import {
  createWallCoorientation,
  flipWallCoorientation,
} from "./coorientation";
import {
  compareIds,
  finiteNonnegativeWeight,
  multiplySigns,
  normalizeBoundary,
} from "./internal";
import { countCyclicTransitions, evaluateLawfulSubcomplex } from "./lawfulness";
import { deriveMorseLinks, satisfiesMorseLinkConstraint } from "./morseLinks";
import type {
  LawfulSubcomplexEvaluation,
  MaximumLawfulSearchCertificate,
  MaximumLawfulSearchOptions,
  MaximumLawfulSearchResult,
  MorseLinksResult,
  OrientationSign,
  WallCoorientation,
  WallSystem,
} from "./types";

interface SearchCell {
  id: string;
  weight: number;
  terms: Array<{
    wallId: string;
    fixedParity: OrientationSign;
  }>;
  wallIds: string[];
}

interface SearchState {
  depth: number;
  wallSigns: Record<string, OrientationSign>;
  upperBound: number;
}

interface Candidate {
  coorientation: WallCoorientation;
  lawful: LawfulSubcomplexEvaluation;
  links: MorseLinksResult;
  objective: number;
  constraintViolations: number;
}

/**
 * Maximize the weight of lawful relation cells over wall coorientations.
 * Small systems are exhausted exactly; larger systems use a deterministic
 * local search and are never reported as proven maxima.
 */
export function searchMaximumLawfulSubcomplex(
  barX: BarXCompressedComplex,
  wallSystem: WallSystem,
  options: MaximumLawfulSearchOptions = {},
): MaximumLawfulSearchResult {
  const startedAt = Date.now();
  const exactWallLimit = options.exactWallLimit ?? 20;
  const nodeBudget = Math.max(1, options.nodeBudget ?? 2_000_000);
  const timeBudgetMs = Math.max(1, options.timeBudgetMs ?? 10_000);
  const warnings: string[] = [];

  if (!wallSystem.diagnostics.twoSided) {
    const certificate = makeCertificate({
      method: "exact-branch-and-bound",
      status: "invalid-wall-system",
      optimalityProven: false,
      symmetryUsed: false,
      searchedNodes: 0,
      elapsedMs: Date.now() - startedAt,
      wallCount: wallSystem.walls.length,
      lowerBound: null,
      upperBound: totalCellWeight(barX, options.cellWeights),
      terminationReason: "invalid-wall-system",
    });
    return {
      status: "invalid-wall-system",
      objectiveValue: null,
      certificate,
      warnings: [
        "At least one wall is one-sided, so the complex has no global wall coorientation.",
      ],
    };
  }

  if (!wallSystem.diagnostics.embedded) {
    warnings.push(
      "Some walls do not embed. The optimization and direct link checks remain exact; the paper's random-orientation probability estimate does not apply unchanged.",
    );
  }
  if (!wallSystem.diagnostics.selfOsculationFree) {
    warnings.push(
      "Some walls self-osculate. The optimization and direct link checks remain exact, but the independence assumptions in the paper's random-orientation probability estimate fail.",
    );
  }

  const searchCells = buildSearchCells(barX, wallSystem, options.cellWeights);
  const wallOrder = orderWalls(wallSystem, searchCells);
  const symmetryUsed =
    isGlobalReversalSymmetric(options) && wallOrder.length > 0;
  if (wallOrder.length > exactWallLimit) {
    return heuristicSearch(
      barX,
      wallSystem,
      searchCells,
      wallOrder,
      options,
      startedAt,
      nodeBudget,
      timeBudgetMs,
      warnings,
      symmetryUsed,
    );
  }

  const initialSigns: Record<string, OrientationSign> = {};
  let initialDepth = 0;
  if (symmetryUsed) {
    initialSigns[wallOrder[0]] = 1;
    initialDepth = 1;
  }
  const stack: SearchState[] = [
    {
      depth: initialDepth,
      wallSigns: initialSigns,
      upperBound: partialUpperBound(searchCells, initialSigns),
    },
  ];
  let searchedNodes = 0;
  let best: Candidate | undefined;
  let terminationReason: MaximumLawfulSearchCertificate["terminationReason"] =
    "complete";

  while (stack.length > 0) {
    if (searchedNodes >= nodeBudget) {
      terminationReason = "node-budget";
      break;
    }
    if (Date.now() - startedAt >= timeBudgetMs) {
      terminationReason = "time-budget";
      break;
    }

    const state = stack.pop();
    if (!state) break;
    searchedNodes += 1;
    if (best && state.upperBound <= best.objective) continue;

    if (state.depth === wallOrder.length) {
      const candidate = evaluateCandidate(
        barX,
        wallSystem,
        state.wallSigns,
        options,
      );
      if (
        candidate.constraintViolations === 0 &&
        (!best || candidate.objective > best.objective)
      ) {
        best = candidate;
      }
      continue;
    }

    const wallId = wallOrder[state.depth];
    // Push - first so the LIFO traversal visits + first. This makes ties stable.
    for (const sign of [-1, 1] as const) {
      const wallSigns = { ...state.wallSigns, [wallId]: sign };
      const upperBound = partialUpperBound(searchCells, wallSigns);
      if (best && upperBound <= best.objective) continue;
      stack.push({
        depth: state.depth + 1,
        wallSigns,
        upperBound,
      });
    }
  }

  const complete = stack.length === 0 && terminationReason === "complete";
  if (complete && !best) {
    const certificate = makeCertificate({
      method: "exact-branch-and-bound",
      status: "infeasible",
      optimalityProven: true,
      symmetryUsed,
      fixedWallId: symmetryUsed ? wallOrder[0] : undefined,
      searchedNodes,
      elapsedMs: Date.now() - startedAt,
      wallCount: wallOrder.length,
      lowerBound: null,
      upperBound: 0,
      terminationReason: "complete",
    });
    return {
      status: "infeasible",
      objectiveValue: null,
      certificate,
      warnings: [
        ...warnings,
        "No wall coorientation satisfies the requested Morse-link constraint.",
      ],
    };
  }

  const remainingUpperBound = Math.max(
    best?.objective ?? 0,
    ...stack.map((state) => state.upperBound),
  );
  const status = complete ? "optimal" : "best-found";
  const lowerBound = best?.objective ?? null;
  const certificate = makeCertificate({
    method: "exact-branch-and-bound",
    status,
    optimalityProven: complete,
    symmetryUsed,
    fixedWallId: symmetryUsed ? wallOrder[0] : undefined,
    searchedNodes,
    elapsedMs: Date.now() - startedAt,
    wallCount: wallOrder.length,
    lowerBound,
    upperBound: complete ? (lowerBound ?? 0) : remainingUpperBound,
    terminationReason,
  });

  return {
    status,
    coorientation: best?.coorientation,
    lawfulSubcomplex: best?.lawful,
    morseLinks: best?.links,
    objectiveValue: lowerBound,
    certificate,
    warnings:
      complete || best
        ? warnings
        : [
            ...warnings,
            "The search budget ended before a feasible coorientation was found.",
          ],
  };
}

function heuristicSearch(
  barX: BarXCompressedComplex,
  wallSystem: WallSystem,
  searchCells: SearchCell[],
  wallOrder: string[],
  options: MaximumLawfulSearchOptions,
  startedAt: number,
  nodeBudget: number,
  timeBudgetMs: number,
  warnings: string[],
  symmetryUsed: boolean,
): MaximumLawfulSearchResult {
  let searchedNodes = 0;
  let bestFeasible: Candidate | undefined;
  let bestAny: Candidate | undefined;
  let hitNodeBudget = false;
  let hitTimeBudget = false;
  const seeds = deterministicSeeds(wallOrder, symmetryUsed);

  const canContinue = (): boolean => {
    if (searchedNodes >= nodeBudget) {
      hitNodeBudget = true;
      return false;
    }
    if (Date.now() - startedAt >= timeBudgetMs) {
      hitTimeBudget = true;
      return false;
    }
    return true;
  };

  for (const seed of seeds) {
    if (!canContinue()) break;
    let current = evaluateCandidate(barX, wallSystem, seed, options);
    searchedNodes += 1;
    bestAny = betterHeuristicCandidate(bestAny, current);
    if (current.constraintViolations === 0) {
      bestFeasible = betterObjectiveCandidate(bestFeasible, current);
    }

    let improved = true;
    while (improved && canContinue()) {
      improved = false;
      let next = current;
      for (const wallId of wallOrder) {
        if (symmetryUsed && wallId === wallOrder[0]) continue;
        if (!canContinue()) break;
        const candidate = evaluateCandidate(
          barX,
          wallSystem,
          flipWallCoorientation(wallSystem, current.coorientation, wallId)
            .wallSigns,
          options,
        );
        searchedNodes += 1;
        bestAny = betterHeuristicCandidate(bestAny, candidate);
        if (candidate.constraintViolations === 0) {
          bestFeasible = betterObjectiveCandidate(bestFeasible, candidate);
        }
        if (isHeuristicImprovement(next, candidate)) next = candidate;
      }
      if (isHeuristicImprovement(current, next)) {
        current = next;
        improved = true;
      }
    }
  }

  const upperBound = searchCells.reduce((sum, cell) => sum + cell.weight, 0);
  const lowerBound = bestFeasible?.objective ?? null;
  const terminationReason = hitNodeBudget
    ? "node-budget"
    : hitTimeBudget
      ? "time-budget"
      : "wall-limit";
  const certificate = makeCertificate({
    method: "deterministic-local-search",
    status: "best-found",
    optimalityProven: false,
    symmetryUsed,
    fixedWallId: symmetryUsed ? wallOrder[0] : undefined,
    searchedNodes,
    elapsedMs: Date.now() - startedAt,
    wallCount: wallOrder.length,
    lowerBound,
    upperBound,
    terminationReason,
  });

  return {
    status: "best-found",
    coorientation: bestFeasible?.coorientation,
    lawfulSubcomplex: bestFeasible?.lawful,
    morseLinks: bestFeasible?.links,
    objectiveValue: lowerBound,
    certificate,
    warnings: [
      ...warnings,
      `The ${wallOrder.length}-wall system exceeds the exact-search limit ${options.exactWallLimit ?? 20}; this is a deterministic best-found result, not a maximum.`,
      ...(bestFeasible
        ? []
        : [
            `No feasible coorientation was found; the nearest candidate violates ${bestAny?.constraintViolations ?? "unknown"} requested link conditions.`,
          ]),
    ],
  };
}

function buildSearchCells(
  barX: BarXCompressedComplex,
  wallSystem: WallSystem,
  weights: Record<string, number> | undefined,
): SearchCell[] {
  const wallById = new Map(
    wallSystem.walls.map((wall) => [wall.id, wall] as const),
  );
  return [...barX.relationCells]
    .sort((left, right) => compareIds(left.id, right.id))
    .map((cell) => {
      const boundary = normalizeBoundary(cell);
      const terms = boundary.map((occurrence) => {
        const wallId = wallSystem.edgeToWallId[occurrence.edgeId];
        const wall = wallById.get(wallId);
        const edgeParity = wall?.edgeOrientationParity[occurrence.edgeId];
        if (!wall || edgeParity === undefined) {
          throw new Error(
            `Wall system has no orientation data for edge ${occurrence.edgeId}.`,
          );
        }
        return {
          wallId,
          fixedParity: multiplySigns(edgeParity, occurrence.traversal),
        };
      });
      return {
        id: cell.id,
        weight: finiteNonnegativeWeight(cell.id, weights),
        terms,
        wallIds: [...new Set(terms.map((term) => term.wallId))].sort(
          compareIds,
        ),
      };
    });
}

function orderWalls(wallSystem: WallSystem, cells: SearchCell[]): string[] {
  const scores = new Map<string, number>();
  for (const wall of wallSystem.walls) scores.set(wall.id, 0);
  for (const cell of cells) {
    for (const wallId of cell.wallIds) {
      scores.set(wallId, (scores.get(wallId) ?? 0) + cell.weight);
    }
  }
  return wallSystem.walls
    .map((wall) => wall.id)
    .sort(
      (left, right) =>
        (scores.get(right) ?? 0) - (scores.get(left) ?? 0) ||
        compareIds(left, right),
    );
}

function partialUpperBound(
  cells: SearchCell[],
  wallSigns: Record<string, OrientationSign>,
): number {
  let upperBound = 0;
  for (const cell of cells) {
    const resolved = cell.wallIds.every(
      (wallId) => wallSigns[wallId] !== undefined,
    );
    if (!resolved) {
      upperBound += cell.weight;
      continue;
    }
    const signs = cell.terms.map((term) =>
      multiplySigns(wallSigns[term.wallId], term.fixedParity),
    );
    if (countCyclicTransitions(signs) === 2) upperBound += cell.weight;
  }
  return upperBound;
}

function evaluateCandidate(
  barX: BarXCompressedComplex,
  wallSystem: WallSystem,
  wallSigns: Record<string, OrientationSign>,
  options: MaximumLawfulSearchOptions,
): Candidate {
  const coorientation = createWallCoorientation(wallSystem, wallSigns);
  const lawful = evaluateLawfulSubcomplex(barX, coorientation);
  const links = deriveMorseLinks(barX, coorientation, lawful);
  const retained = new Set(lawful.retainedCellIds);
  const objective = barX.relationCells.reduce(
    (sum, cell) =>
      sum +
      (retained.has(cell.id)
        ? finiteNonnegativeWeight(cell.id, options.cellWeights)
        : 0),
    0,
  );
  return {
    coorientation,
    lawful,
    links,
    objective,
    constraintViolations: countConstraintViolations(
      links,
      options.morseConstraint,
    ),
  };
}

function countConstraintViolations(
  links: MorseLinksResult,
  constraint: MaximumLawfulSearchOptions["morseConstraint"],
): number {
  if (!constraint) return 0;
  let violations = 0;
  for (const vertex of links.vertices) {
    if (constraint.requireAscendingNonempty && !vertex.ascending.nonempty) {
      violations += 1;
    }
    if (constraint.requireDescendingNonempty && !vertex.descending.nonempty) {
      violations += 1;
    }
    if (constraint.requireAscendingConnected && !vertex.ascending.connected) {
      violations += 1;
    }
    if (constraint.requireDescendingConnected && !vertex.descending.connected) {
      violations += 1;
    }
  }
  // Keep the aggregate helper in the loop: it guards future additions to the
  // constraint type from silently diverging from the per-vertex count above.
  if (violations === 0 && !satisfiesMorseLinkConstraint(links, constraint)) {
    return 1;
  }
  return violations;
}

function deterministicSeeds(
  wallOrder: string[],
  symmetryUsed: boolean,
): Array<Record<string, OrientationSign>> {
  const patterns = [
    (): OrientationSign => 1,
    (index: number): OrientationSign => (index % 2 === 0 ? 1 : -1),
    (index: number): OrientationSign => (index % 3 === 0 ? -1 : 1),
    (index: number): OrientationSign =>
      (((index * 1103515245 + 12345) >>> 8) & 1) === 0 ? 1 : -1,
  ];
  return patterns.map(
    (pattern) =>
      Object.fromEntries(
        wallOrder.map((wallId, index) => [
          wallId,
          symmetryUsed && index === 0 ? 1 : pattern(index),
        ]),
      ) as Record<string, OrientationSign>,
  );
}

function isHeuristicImprovement(
  current: Candidate,
  candidate: Candidate,
): boolean {
  return (
    candidate.constraintViolations < current.constraintViolations ||
    (candidate.constraintViolations === current.constraintViolations &&
      candidate.objective > current.objective)
  );
}

function betterHeuristicCandidate(
  current: Candidate | undefined,
  candidate: Candidate,
): Candidate {
  if (!current || isHeuristicImprovement(current, candidate)) return candidate;
  return current;
}

function betterObjectiveCandidate(
  current: Candidate | undefined,
  candidate: Candidate,
): Candidate {
  if (!current || candidate.objective > current.objective) return candidate;
  return current;
}

function isGlobalReversalSymmetric(
  options: MaximumLawfulSearchOptions,
): boolean {
  const constraint = options.morseConstraint;
  if (!constraint) return true;
  return (
    Boolean(constraint.requireAscendingNonempty) ===
      Boolean(constraint.requireDescendingNonempty) &&
    Boolean(constraint.requireAscendingConnected) ===
      Boolean(constraint.requireDescendingConnected)
  );
}

function totalCellWeight(
  barX: BarXCompressedComplex,
  weights: Record<string, number> | undefined,
): number {
  return barX.relationCells.reduce(
    (sum, cell) => sum + finiteNonnegativeWeight(cell.id, weights),
    0,
  );
}

function makeCertificate(input: {
  method: MaximumLawfulSearchCertificate["method"];
  status: MaximumLawfulSearchCertificate["status"];
  optimalityProven: boolean;
  symmetryUsed: boolean;
  fixedWallId?: string;
  searchedNodes: number;
  elapsedMs: number;
  wallCount: number;
  lowerBound: number | null;
  upperBound: number;
  terminationReason: MaximumLawfulSearchCertificate["terminationReason"];
}): MaximumLawfulSearchCertificate {
  const absoluteGap =
    input.lowerBound === null ? null : input.upperBound - input.lowerBound;
  const relativeGap =
    absoluteGap === null
      ? null
      : input.upperBound === 0
        ? 0
        : absoluteGap / input.upperBound;
  return {
    method: input.method,
    status: input.status,
    optimalityProven: input.optimalityProven,
    globalReversalSymmetryUsed: input.symmetryUsed,
    fixedWallId: input.fixedWallId,
    searchedNodes: input.searchedNodes,
    elapsedMs: input.elapsedMs,
    wallCount: input.wallCount,
    lowerBound: input.lowerBound,
    upperBound: input.upperBound,
    absoluteGap,
    relativeGap,
    terminationReason: input.terminationReason,
    deterministicStrategy:
      input.method === "exact-branch-and-bound"
        ? "weighted-incidence wall order; + branch first; optimistic unresolved-cell bound"
        : "four fixed seeds; first-improving deterministic wall-flip sweeps",
  };
}
