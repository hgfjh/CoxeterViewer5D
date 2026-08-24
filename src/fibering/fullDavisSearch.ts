import { buildCoverCompression } from "../compression";
import { buildFullDavisQuotientCellPoset } from "../davis/fullQuotient";
import type { QuotientComplex } from "../quotient";
import type { TorsionFreeCandidateResult } from "../torsionFree";
import type { CollapsibilitySearchOptions } from "../topology/collapsibility";
import {
  createWallCoorientation,
  findWallSystem,
  type OrientationSign,
} from "../walls";
import {
  certifyFullDavisVirtualAlgebraicFibration,
  certifyFiniteActionFromQuotient,
  type FullDavisVirtualFiberingCertificate,
} from "./fullDavisCertificate";
import {
  buildFullDirectedLinkCertificate,
  buildPrimitiveMorseHeightCertificate,
} from "./fullDavisMorse";
import { buildCompatiblePullingTriangulation } from "./pullingTriangulation";
import { certifyPrimitiveSchreierHomomorphism } from "./schreierHomomorphism";
import { certifyWallHomomorphismFiniteData } from "./wallHomomorphism";

export interface FullDavisCoorientationSearchOptions {
  exactWallLimit?: number;
  maxCandidates?: number;
  timeBudgetMs?: number;
  /**
   * Ignore wall-clock time and stop only at deterministic candidate bounds.
   * Archival certificate jobs use this; their parent process may still impose
   * an execution timeout and report interruption as incomplete.
   */
  deterministicCandidateBudgetOnly?: boolean;
  collapsibilityOptions?: CollapsibilitySearchOptions;
}

export interface FullDavisCoorientationScore {
  primitiveEpimorphism: boolean;
  heightCertificatePassed: boolean;
  directedLinkCertificatePassed: boolean;
  nonemptyDirectedLinks: number;
  connectedDirectedLinks: number;
  collapsibleDirectedLinks: number;
  vertexOrbitCount: number;
  passed: boolean;
  scalar: number;
}

export interface FullDavisCoorientationSearchResult {
  schemaVersion: 1;
  kind: "full-davis-coorientation-search";
  status: "found" | "not-found" | "incomplete" | "invalid";
  method: "exhaustive-sign-search" | "deterministic-local-sign-search";
  optimalityProven: boolean;
  globalReversalSymmetryUsed: boolean;
  fixedWallId?: string;
  wallCount: number;
  candidatesEvaluated: number;
  elapsedMilliseconds: number;
  terminationReason:
    | "solution-found"
    | "sign-space-exhausted"
    | "wall-limit"
    | "candidate-budget"
    | "time-budget"
    | "invalid-input"
    | "runtime-error";
  bestWallSigns?: Record<string, OrientationSign>;
  bestScore?: FullDavisCoorientationScore;
  certificate?: FullDavisVirtualFiberingCertificate;
  errors: string[];
  warnings: string[];
}

interface EvaluatedSigns {
  signs: Record<string, OrientationSign>;
  score: FullDavisCoorientationScore;
}

class FullDavisSearchInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FullDavisSearchInputError";
  }
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareScores(
  left: FullDavisCoorientationScore,
  right: FullDavisCoorientationScore,
): number {
  return left.scalar - right.scalar;
}

function signKey(
  wallIds: readonly string[],
  signs: Readonly<Record<string, OrientationSign>>,
): string {
  return wallIds.map((wallId) => (signs[wallId] === -1 ? "-" : "+")).join("");
}

function resolvedPositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? (value as number)
    : fallback;
}

/**
 * Search wall signs against the full subdivided Davis quotient. The search is
 * exhaustive only below the stated wall limit; a budgeted search failure is
 * always reported as incomplete rather than as nonexistence.
 */
export function searchFullDavisWallCoorientations(input: {
  quotient: QuotientComplex;
  acceptedAction?: TorsionFreeCandidateResult;
  sourceQuotientVertexIds?: readonly string[];
  options?: FullDavisCoorientationSearchOptions;
}): FullDavisCoorientationSearchResult {
  const startedAt = now();
  const options = input.options ?? {};
  const exactWallLimit = resolvedPositiveInteger(options.exactWallLimit, 16);
  const maxCandidates = resolvedPositiveInteger(options.maxCandidates, 10_000);
  const timeBudgetMs = resolvedPositiveInteger(options.timeBudgetMs, 30_000);
  const useTimeBudget = options.deterministicCandidateBudgetOnly !== true;
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    if (!input.quotient.sourceSystem)
      throw new FullDavisSearchInputError(
        "The quotient omits its source Coxeter system.",
      );
    const reconstructed = certifyFiniteActionFromQuotient(input.quotient);
    if (
      input.acceptedAction &&
      JSON.stringify(reconstructed.accepted.candidate.generatorImages) !==
        JSON.stringify(input.acceptedAction.candidate.generatorImages)
    ) {
      throw new FullDavisSearchInputError(
        "The supplied accepted action does not match the quotient permutation action.",
      );
    }
    if (
      input.sourceQuotientVertexIds &&
      JSON.stringify(input.sourceQuotientVertexIds) !==
        JSON.stringify(reconstructed.sourceQuotientVertexIds)
    ) {
      throw new FullDavisSearchInputError(
        "The supplied quotient vertex order does not match the canonical quotient action order.",
      );
    }
    const cover = buildCoverCompression(input.quotient);
    const wallSystem = findWallSystem(cover.barX);
    const wallIds = wallSystem.walls.map((wall) => wall.id).sort(compareIds);
    if (!wallSystem.diagnostics.twoSided) {
      throw new Error(
        "At least one quotient wall is one-sided, so the sign search is undefined.",
      );
    }
    const poset = buildFullDavisQuotientCellPoset(
      input.quotient.sourceSystem,
      reconstructed.accepted,
      { sourceQuotientVertexIds: reconstructed.sourceQuotientVertexIds },
    );
    const triangulation = buildCompatiblePullingTriangulation(poset);
    if (triangulation.status !== "passed") {
      throw new Error(
        `The compatible pulling triangulation failed: ${triangulation.errors.join(" ")}`,
      );
    }
    const cache = new Map<string, EvaluatedSigns>();
    let candidatesEvaluated = 0;
    let terminationReason: FullDavisCoorientationSearchResult["terminationReason"] =
      "sign-space-exhausted";
    const budgetTerminated = (): boolean =>
      terminationReason === "candidate-budget" ||
      terminationReason === "time-budget";

    const evaluate = (
      signs: Record<string, OrientationSign>,
    ): EvaluatedSigns | undefined => {
      const key = signKey(wallIds, signs);
      const cached = cache.get(key);
      if (cached) return cached;
      if (candidatesEvaluated >= maxCandidates) {
        terminationReason = "candidate-budget";
        return undefined;
      }
      if (useTimeBudget && now() - startedAt >= timeBudgetMs) {
        terminationReason = "time-budget";
        return undefined;
      }
      candidatesEvaluated += 1;
      const coorientation = createWallCoorientation(wallSystem, signs);
      const finite = certifyWallHomomorphismFiniteData(
        cover.barX,
        wallSystem,
        coorientation,
      );
      const primitive = certifyPrimitiveSchreierHomomorphism({
        quotient: input.quotient,
        cover,
        finiteWallCertificate: finite,
      });
      let nonemptyDirectedLinks = 0;
      let connectedDirectedLinks = 0;
      let collapsibleDirectedLinks = 0;
      let heightCertificatePassed = false;
      let directedLinkCertificatePassed = false;
      const vertexOrbitCount = poset.vertices.length;
      if (primitive.status === "passed" && finite.cocycle.closed) {
        const height = buildPrimitiveMorseHeightCertificate({
          poset,
          triangulation,
          cover,
          finiteWallCertificate: finite,
          primitiveHomomorphism: primitive,
        });
        heightCertificatePassed =
          height.status === "passed" &&
          Object.values(height.checks).every(Boolean);
        const links = buildFullDirectedLinkCertificate({
          poset,
          triangulation,
          height,
          collapsibilityOptions: {
            ...options.collapsibilityOptions,
            ...(options.deterministicCandidateBudgetOnly
              ? { deterministicStateBudgetOnly: true }
              : {}),
          },
        });
        directedLinkCertificatePassed =
          links.status === "passed" &&
          Object.values(links.checks).every(Boolean);
        for (const vertex of links.vertices) {
          for (const link of [vertex.ascending, vertex.descending]) {
            if (link.nonempty) nonemptyDirectedLinks += 1;
            if (link.connected) connectedDirectedLinks += 1;
            if (link.collapsibility.status === "collapsible")
              collapsibleDirectedLinks += 1;
          }
        }
      }
      const targetCount = 2 * vertexOrbitCount;
      const primitiveEpimorphism =
        primitive.status === "passed" && primitive.primitiveImage;
      const passed =
        primitiveEpimorphism &&
        heightCertificatePassed &&
        directedLinkCertificatePassed &&
        nonemptyDirectedLinks === targetCount &&
        connectedDirectedLinks === targetCount;
      const score: FullDavisCoorientationScore = {
        primitiveEpimorphism,
        heightCertificatePassed,
        directedLinkCertificatePassed,
        nonemptyDirectedLinks,
        connectedDirectedLinks,
        collapsibleDirectedLinks,
        vertexOrbitCount,
        passed,
        scalar:
          (primitiveEpimorphism ? 1_000_000_000 : 0) +
          connectedDirectedLinks * 1_000_000 +
          nonemptyDirectedLinks * 1_000 +
          collapsibleDirectedLinks,
      };
      const evaluated = { signs: { ...signs }, score };
      cache.set(key, evaluated);
      return evaluated;
    };

    const fixedWallId = wallIds[0];
    let best: EvaluatedSigns | undefined;
    const record = (evaluated: EvaluatedSigns | undefined): boolean => {
      if (!evaluated) return false;
      if (!best || compareScores(evaluated.score, best.score) > 0)
        best = evaluated;
      return evaluated.score.passed;
    };
    const exact = wallIds.length <= exactWallLimit;
    let found = false;

    if (exact) {
      // Reversing every wall exchanges ascending and descending links, so one
      // wall may be fixed without changing the existence question.
      const variableWallIds = fixedWallId ? wallIds.slice(1) : [];
      const assignmentCount = 2 ** variableWallIds.length;
      for (let mask = 0; mask < assignmentCount; mask += 1) {
        const signs: Record<string, OrientationSign> = {};
        if (fixedWallId) signs[fixedWallId] = 1;
        variableWallIds.forEach((wallId, index) => {
          signs[wallId] = (mask & (2 ** index)) === 0 ? 1 : -1;
        });
        if (record(evaluate(signs))) {
          found = true;
          terminationReason = "solution-found";
          break;
        }
        if (budgetTerminated()) break;
      }
    } else {
      terminationReason = "wall-limit";
      const seeds: Record<string, OrientationSign>[] = [
        Object.fromEntries(wallIds.map((wallId) => [wallId, 1])) as Record<
          string,
          OrientationSign
        >,
        Object.fromEntries(
          wallIds.map((wallId, index) => [wallId, index % 2 === 0 ? 1 : -1]),
        ) as Record<string, OrientationSign>,
        Object.fromEntries(
          wallIds.map((wallId, index) => [
            wallId,
            index < wallIds.length / 2 ? 1 : -1,
          ]),
        ) as Record<string, OrientationSign>,
      ];
      for (const seed of seeds) {
        if (fixedWallId) seed[fixedWallId] = 1;
        let current = evaluate(seed);
        if (record(current)) {
          found = true;
          terminationReason = "solution-found";
          break;
        }
        let improved = true;
        while (current && improved && !found) {
          improved = false;
          let next = current;
          for (const wallId of wallIds.slice(fixedWallId ? 1 : 0)) {
            const trialSigns = {
              ...current.signs,
              [wallId]: current.signs[wallId] === 1 ? -1 : 1,
            } as Record<string, OrientationSign>;
            const trial = evaluate(trialSigns);
            if (!trial) break;
            if (compareScores(trial.score, next.score) > 0) next = trial;
            if (record(trial)) {
              current = trial;
              found = true;
              terminationReason = "solution-found";
              break;
            }
          }
          if (!found && compareScores(next.score, current.score) > 0) {
            current = next;
            improved = true;
          }
          if (budgetTerminated()) break;
        }
        if (found || budgetTerminated()) break;
      }
    }

    const exhaustive =
      exact && !found && terminationReason === "sign-space-exhausted";
    const status: FullDavisCoorientationSearchResult["status"] = found
      ? "found"
      : exhaustive
        ? "not-found"
        : "incomplete";
    if (!exact) {
      warnings.push(
        `The wall count ${wallIds.length} exceeds the exact limit ${exactWallLimit}; failure of the deterministic search is not a nonexistence proof.`,
      );
    }
    const certificate = best
      ? certifyFullDavisVirtualAlgebraicFibration({
          quotient: input.quotient,
          acceptedAction: reconstructed.accepted,
          sourceQuotientVertexIds: reconstructed.sourceQuotientVertexIds,
          requestedWallSigns: best.signs,
          collapsibilityOptions: {
            ...options.collapsibilityOptions,
            ...(options.deterministicCandidateBudgetOnly
              ? { deterministicStateBudgetOnly: true }
              : {}),
          },
        })
      : undefined;
    return {
      schemaVersion: 1,
      kind: "full-davis-coorientation-search",
      status,
      method: exact
        ? "exhaustive-sign-search"
        : "deterministic-local-sign-search",
      optimalityProven: exhaustive,
      globalReversalSymmetryUsed: Boolean(fixedWallId),
      ...(fixedWallId ? { fixedWallId } : {}),
      wallCount: wallIds.length,
      candidatesEvaluated,
      elapsedMilliseconds: now() - startedAt,
      terminationReason,
      ...(best ? { bestWallSigns: best.signs, bestScore: best.score } : {}),
      ...(certificate ? { certificate } : {}),
      errors,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const invalidInput = error instanceof FullDavisSearchInputError;
    return {
      schemaVersion: 1,
      kind: "full-davis-coorientation-search",
      status: invalidInput ? "invalid" : "incomplete",
      method: "deterministic-local-sign-search",
      optimalityProven: false,
      globalReversalSymmetryUsed: false,
      wallCount: 0,
      candidatesEvaluated: 0,
      elapsedMilliseconds: now() - startedAt,
      terminationReason: invalidInput ? "invalid-input" : "runtime-error",
      errors: [message],
      warnings: [
        ...warnings,
        ...(invalidInput
          ? []
          : [
              "The search stopped after an unexpected runtime or resource failure; this is inconclusive and is not a mathematical rejection.",
            ]),
      ],
    };
  }
}
