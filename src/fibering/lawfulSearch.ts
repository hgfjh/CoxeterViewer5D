import { buildCoverCompression } from "../compression";
import { buildFullDavisQuotientCellPoset } from "../davis/fullQuotient";
import type { QuotientComplex } from "../quotient";
import {
  acceptedActionToQuotientComplex,
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeCandidateResult,
} from "../torsionFree";
import type { CoxeterSystemInput } from "../types";
import { canonicalSha256 } from "../utils/canonicalSha256";
import {
  createWallCoorientation,
  findWallSystem,
  type OrientationSign,
} from "../walls";
import {
  certifyFiniteActionFromQuotient,
  type CertifiedFiniteActionEvidence,
} from "./fullDavisCertificate";
import {
  buildLawfulSubcomplexFiberingCertificate,
  type LawfulSubcomplexFiberingCertificate,
  type LawfulTrackApplicabilityEvidence,
} from "./lawfulTrack";
import type { GeneralizedLawfulCertificate } from "./generalizedLawfulCertificate";
import { buildStreamedLawfulDavisOracle } from "./streamedLawfulDavis";

export interface LawfulCoorientationSearchOptions {
  exactWallLimit?: number;
  maxCandidates?: number;
  timeBudgetMs?: number;
  deterministicCandidateBudgetOnly?: boolean;
  certificationComplex?: "rank-two-lawful" | "coface-closed-full";
  applicability?: LawfulTrackApplicabilityEvidence;
  /**
   * Full-cell certificates keyed by `lawfulCoorientationSignKey`. The key uses
   * sorted stable wall ids, so a bare legacy integer mask is never accepted.
   */
  generalizedCertificatesBySignKey?: Readonly<
    Record<string, GeneralizedLawfulCertificate>
  >;
  /** Build the generalized closure as supplemental evidence in the 2D track. */
  includeFullClosure?: boolean;
}

export interface LawfulCoorientationScore {
  certificationComplex: "rank-two-lawful" | "coface-closed-full";
  primitiveEpimorphism: boolean;
  npcAsphericity: boolean;
  morseDataPassed: boolean;
  connectedDirectedLinks: number;
  directedLinkCount: number;
  retainedTwoCells: number;
  generalizedCertificatePassed: boolean;
  passed: boolean;
  scalar: number;
}

export interface LawfulSubcomplexActionCertificate {
  schemaVersion: 1;
  kind: "action-rooted-lawful-subcomplex-fibering-certificate";
  method: "certified-action-lawful-first-reconstruction";
  status: "passed" | "failed" | "incomplete";
  source: {
    coxeterSystem: CoxeterSystemInput;
    quotientName: string;
    subgroupName: string;
    subgroupIndex: number;
  };
  subgroupAction: CertifiedFiniteActionEvidence;
  requestedWallSigns: Record<string, OrientationSign>;
  lawful: LawfulSubcomplexFiberingCertificate;
  hashes: {
    sourceSystemSha256: string;
    actionSha256: string;
    coverCompressionSha256: string;
    wallSystemSha256: string;
    coorientationSha256: string;
    lawfulCertificateSha256: string;
    artifactSha256: string;
  };
  errors: string[];
  warnings: string[];
  nonClaims: string[];
}

export interface LawfulSubcomplexCertificateVerification {
  schemaVersion: 1;
  kind: "lawful-subcomplex-certificate-replay";
  valid: boolean;
  mandatoryChecksPassed: boolean;
  errors: string[];
  checkedHashes: string[];
  reconstructedHashes: Record<string, string>;
  replayHashAlgorithm: "sha256";
  replayHash: string;
}

export interface LawfulCoorientationSearchResult {
  schemaVersion: 1;
  kind: "lawful-subcomplex-coorientation-search";
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
    | "missing-generalized-certificates"
    | "certificate-replay-failed"
    | "invalid-input"
    | "runtime-error";
  bestWallSigns?: Record<string, OrientationSign>;
  bestScore?: LawfulCoorientationScore;
  certificate?: LawfulSubcomplexActionCertificate;
  certificateReplay?: LawfulSubcomplexCertificateVerification;
  errors: string[];
  warnings: string[];
}

interface PreparedLawfulInput {
  system: CoxeterSystemInput;
  accepted: TorsionFreeCandidateResult;
  quotient: QuotientComplex;
  sourceQuotientVertexIds: string[];
}

interface EvaluatedSigns {
  signs: Record<string, OrientationSign>;
  score: LawfulCoorientationScore;
  eligibleForRanking: boolean;
}

class LawfulSearchInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LawfulSearchInputError";
  }
}

/** Build a self-contained lawful certificate whose replay root is the action. */
export function certifyLawfulSubcomplexVirtualAlgebraicFibration(input: {
  quotient: QuotientComplex;
  requestedWallSigns?: Partial<Record<string, OrientationSign>>;
  certificationComplex?: "rank-two-lawful" | "coface-closed-full";
  applicability?: LawfulTrackApplicabilityEvidence;
  generalizedCertificate?: GeneralizedLawfulCertificate;
  includeFullClosure?: boolean;
}): LawfulSubcomplexActionCertificate {
  const prepared = prepareCanonicalInput(input.quotient);
  return buildActionCertificate({
    prepared,
    requestedWallSigns: input.requestedWallSigns,
    certificationComplex: input.certificationComplex ?? "rank-two-lawful",
    applicability: input.applicability,
    generalizedCertificate: input.generalizedCertificate,
    includeFullClosure: input.includeFullClosure ?? false,
  });
}

/**
 * Rebuild every theorem-facing lawful object from the embedded finite action.
 * Stored incidence and pass/fail booleans are comparison targets, not roots.
 */
export function verifyLawfulSubcomplexActionCertificate(
  certificate: LawfulSubcomplexActionCertificate,
): LawfulSubcomplexCertificateVerification {
  const errors: string[] = [];
  const checkedHashes: string[] = [];
  const reconstructedHashes: Record<string, string> = {};
  try {
    if (
      certificate.schemaVersion !== 1 ||
      certificate.kind !==
        "action-rooted-lawful-subcomplex-fibering-certificate" ||
      certificate.method !== "certified-action-lawful-first-reconstruction"
    ) {
      errors.push("The lawful action-certificate header is unsupported.");
    }
    const sourceSystemSha256 = canonicalSha256(
      jsonData(certificate.source.coxeterSystem),
    );
    reconstructedHashes["source-system"] = sourceSystemSha256;
    expectHash(
      "source-system",
      certificate.hashes.sourceSystemSha256,
      sourceSystemSha256,
      errors,
      checkedHashes,
    );
    const plan = planSphericalSpecialSubgroups(
      certificate.source.coxeterSystem,
    );
    const recertified = certifyTorsionFreeAction(
      certificate.source.coxeterSystem,
      certificate.subgroupAction.candidate,
      plan,
    );
    if (recertified.status !== "passed") {
      errors.push(
        `The embedded action fails independent spherical-freeness replay: ${recertified.errors.join(" ")}`,
      );
    }
    if (
      canonicalSha256(jsonData(recertified)) !==
      canonicalSha256(jsonData(certificate.subgroupAction.certificate))
    ) {
      errors.push("The embedded torsion-free action certificate is stale.");
    }
    const accepted = {
      candidate: certificate.subgroupAction.candidate,
      certificate: recertified,
    };
    const vertexIds = Array.from(
      { length: accepted.candidate.index },
      (_unused, point) => `q${point}`,
    );
    if (
      !sameIds(vertexIds, certificate.subgroupAction.sourceQuotientVertexIds)
    ) {
      errors.push(
        "The lawful certificate does not use canonical action vertices.",
      );
    }
    const actionSha256 = actionHash(
      certificate.source.coxeterSystem,
      accepted,
      vertexIds,
    );
    reconstructedHashes["finite-action"] = actionSha256;
    expectHash(
      "finite-action",
      certificate.hashes.actionSha256,
      actionSha256,
      errors,
      checkedHashes,
    );
    if (certificate.subgroupAction.actionHash !== actionSha256) {
      errors.push("The embedded finite-action evidence has a stale hash.");
    }
    const quotient = acceptedActionToQuotientComplex(
      certificate.source.coxeterSystem,
      accepted,
      {
        name: certificate.source.quotientName,
        subgroupName: certificate.source.subgroupName,
      },
    );
    const rebuilt = buildActionCertificate({
      prepared: {
        system: certificate.source.coxeterSystem,
        accepted,
        quotient,
        sourceQuotientVertexIds: vertexIds,
      },
      requestedWallSigns: certificate.requestedWallSigns,
      certificationComplex: certificate.lawful.certificationComplex,
      applicability:
        certificate.lawful.applicability.basis === "supplied-evidence"
          ? certificate.lawful.applicability.evidence
          : undefined,
      generalizedCertificate: certificate.lawful.generalizedCertificate,
      includeFullClosure:
        certificate.lawful.fullDavisClosure.status !== "not-supplied",
    });
    for (const [label, stored, replayed] of [
      [
        "cover-compression",
        certificate.hashes.coverCompressionSha256,
        rebuilt.hashes.coverCompressionSha256,
      ],
      [
        "wall-system",
        certificate.hashes.wallSystemSha256,
        rebuilt.hashes.wallSystemSha256,
      ],
      [
        "coorientation",
        certificate.hashes.coorientationSha256,
        rebuilt.hashes.coorientationSha256,
      ],
      [
        "lawful-certificate",
        certificate.hashes.lawfulCertificateSha256,
        rebuilt.hashes.lawfulCertificateSha256,
      ],
    ] as const) {
      reconstructedHashes[label] = replayed;
      expectHash(label, stored, replayed, errors, checkedHashes);
    }
    if (
      canonicalSha256(jsonData(certificate.lawful)) !==
      canonicalSha256(jsonData(rebuilt.lawful))
    ) {
      errors.push(
        "The lawful certificate does not match its action-rooted reconstruction.",
      );
    }
    const declaredArtifactHash = certificate.hashes.artifactSha256;
    const expectedArtifactHash = lawfulArtifactHash(certificate);
    reconstructedHashes["artifact"] = expectedArtifactHash;
    expectHash(
      "artifact",
      declaredArtifactHash,
      expectedArtifactHash,
      errors,
      checkedHashes,
    );
    if (certificate.status === "passed" && rebuilt.status !== "passed") {
      errors.push("A passed lawful certificate does not replay as passed.");
    }
    if (certificate.status === "passed" && certificate.errors.length > 0) {
      errors.push("A passed lawful certificate contains recorded errors.");
    }
  } catch (error) {
    errors.push(errorMessage(error));
  }
  const mandatoryChecksPassed =
    certificate.status === "passed" &&
    certificate.lawful.status === "passed" &&
    errors.length === 0;
  const payload = {
    schemaVersion: 1 as const,
    kind: "lawful-subcomplex-certificate-replay" as const,
    valid: errors.length === 0,
    mandatoryChecksPassed,
    errors: uniqueSorted(errors),
    checkedHashes: uniqueSorted(checkedHashes),
    reconstructedHashes: Object.fromEntries(
      Object.entries(reconstructedHashes).sort(([left], [right]) =>
        compareIds(left, right),
      ),
    ),
    replayHashAlgorithm: "sha256" as const,
  };
  return { ...payload, replayHash: canonicalSha256(payload) };
}

/** Search wall signs for a lawful certificate, not merely for many cells. */
export function searchLawfulSubcomplexCoorientations(input: {
  quotient: QuotientComplex;
  options?: LawfulCoorientationSearchOptions;
}): LawfulCoorientationSearchResult {
  const startedAt = now();
  const options = input.options ?? {};
  const exactWallLimit = positiveInteger(options.exactWallLimit, 16);
  const maxCandidates = positiveInteger(options.maxCandidates, 10_000);
  const timeBudgetMs = positiveInteger(options.timeBudgetMs, 30_000);
  const useTimeBudget = options.deterministicCandidateBudgetOnly !== true;
  const errors: string[] = [];
  const warnings: string[] = [];
  try {
    const prepared = prepareCanonicalInput(input.quotient);
    const cover = buildCoverCompression(prepared.quotient);
    const wallSystem = findWallSystem(cover.barX);
    if (!wallSystem.diagnostics.twoSided) {
      throw new LawfulSearchInputError(
        "At least one quotient wall is one-sided, so a global sign search is undefined.",
      );
    }
    // The streamed generalized certificate is itself the exact closure
    // calculation. Materialize the large strict poset only when requested as
    // an additional cross-check.
    const fullCellPoset = options.includeFullClosure
      ? buildFullDavisQuotientCellPoset(prepared.system, prepared.accepted, {
          sourceQuotientVertexIds: prepared.sourceQuotientVertexIds,
        })
      : undefined;
    const generalizedSourceOracle =
      options.certificationComplex === "coface-closed-full" &&
      options.generalizedCertificatesBySignKey !== undefined
        ? buildStreamedLawfulDavisOracle({
            system: prepared.system,
            generatorImages: prepared.accepted.candidate.generatorImages,
          })
        : undefined;
    const wallIds = wallSystem.walls.map((wall) => wall.id).sort(compareIds);
    const fixedWallId = wallIds[0];
    const cache = new Map<string, EvaluatedSigns>();
    let candidatesEvaluated = 0;
    let inconclusiveGeneralizedEvidenceSeen = false;
    let terminationReason: LawfulCoorientationSearchResult["terminationReason"] =
      "sign-space-exhausted";
    const budgetTerminated = (): boolean =>
      terminationReason === "candidate-budget" ||
      terminationReason === "time-budget";
    const evaluate = (
      signs: Record<string, OrientationSign>,
    ): EvaluatedSigns | undefined => {
      const key = lawfulCoorientationSignKey(wallIds, signs);
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
      const generalizedCertificate =
        options.generalizedCertificatesBySignKey?.[key];
      const core = buildLawfulSubcomplexFiberingCertificate({
        quotient: prepared.quotient,
        cover,
        wallSystem,
        coorientation: createWallCoorientation(wallSystem, signs),
        applicability: options.applicability,
        generalizedCertificate,
        generalizedSourceOracle,
        fullCellPoset,
        certificationComplex: options.certificationComplex ?? "rank-two-lawful",
      });
      if (
        core.certificationComplex === "coface-closed-full" &&
        core.generalized.status !== "passed"
      ) {
        inconclusiveGeneralizedEvidenceSeen = true;
      }
      const rankTwoDirectedLinks = core.morse.links.flatMap((entry) => [
        entry.ascending,
        entry.descending,
      ]);
      const usingGeneralized =
        core.certificationComplex === "coface-closed-full";
      const generalizedEvidenceValid =
        !usingGeneralized ||
        (core.generalized.status === "passed" &&
          core.generalized.checks.actionRootedReplayPassed);
      const generalizedSummaries = generalizedEvidenceValid
        ? (core.generalizedCertificate?.directedLinks.vertexSummaries ?? [])
        : [];
      const connectedDirectedLinks = usingGeneralized
        ? generalizedSummaries.reduce(
            (count, summary) =>
              count +
              (summary.ascendingNonempty && summary.ascendingConnected
                ? 1
                : 0) +
              (summary.descendingNonempty && summary.descendingConnected
                ? 1
                : 0),
            0,
          )
        : rankTwoDirectedLinks.filter((link) => link.nonempty && link.connected)
            .length;
      const directedLinkCount = usingGeneralized
        ? generalizedSummaries.length * 2
        : rankTwoDirectedLinks.length;
      const selectedAsphericityPassed = usingGeneralized
        ? generalizedEvidenceValid && core.generalized.checks.asphericityPassed
        : core.npcAsphericity.status === "passed";
      const selectedMorsePassed = usingGeneralized
        ? generalizedEvidenceValid &&
          core.generalized.checks.actualDirectedLinksPassed
        : core.morse.status === "passed";
      const score: LawfulCoorientationScore = {
        certificationComplex: core.certificationComplex,
        primitiveEpimorphism:
          core.primitiveHomomorphism.status === "passed" &&
          core.primitiveHomomorphism.primitiveImage,
        npcAsphericity: selectedAsphericityPassed,
        morseDataPassed: selectedMorsePassed,
        connectedDirectedLinks,
        directedLinkCount,
        retainedTwoCells: core.retainedCellIds.length,
        generalizedCertificatePassed: core.generalized.status === "passed",
        passed: core.status === "passed",
        scalar: generalizedEvidenceValid
          ? (core.status === "passed" ? 1_000_000_000_000 : 0) +
            (core.primitiveHomomorphism.primitiveImage ? 10_000_000_000 : 0) +
            (selectedAsphericityPassed ? 1_000_000_000 : 0) +
            (selectedMorsePassed ? 100_000_000 : 0) +
            connectedDirectedLinks * 10_000 +
            core.retainedCellIds.length
          : 0,
      };
      const evaluated = {
        signs: { ...signs },
        score,
        eligibleForRanking: generalizedEvidenceValid,
      };
      cache.set(key, evaluated);
      return evaluated;
    };

    let best: EvaluatedSigns | undefined;
    const record = (candidate: EvaluatedSigns | undefined): boolean => {
      if (!candidate || !candidate.eligibleForRanking) return false;
      if (!best || candidate.score.scalar > best.score.scalar) best = candidate;
      return candidate.score.passed;
    };
    const exact = wallIds.length <= exactWallLimit;
    let found = false;
    if (exact) {
      const variable = fixedWallId ? wallIds.slice(1) : [];
      const assignmentCount = 2 ** variable.length;
      for (let mask = 0; mask < assignmentCount; mask += 1) {
        const signs: Record<string, OrientationSign> = {};
        if (fixedWallId) signs[fixedWallId] = 1;
        variable.forEach((wallId, index) => {
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
      const seeds = deterministicSeeds(wallIds, fixedWallId);
      for (const seed of seeds) {
        let current = evaluate(seed);
        if (record(current)) {
          found = true;
          terminationReason = "solution-found";
          break;
        }
        let improved = true;
        while (current && improved && !budgetTerminated()) {
          improved = false;
          let next = current;
          for (const wallId of wallIds.slice(fixedWallId ? 1 : 0)) {
            const trial = evaluate({
              ...current.signs,
              [wallId]: current.signs[wallId] === 1 ? -1 : 1,
            });
            if (!trial) break;
            if (trial.score.scalar > next.score.scalar) next = trial;
            if (record(trial)) {
              current = trial;
              found = true;
              terminationReason = "solution-found";
              break;
            }
          }
          if (!found && next.score.scalar > current.score.scalar) {
            current = next;
            improved = true;
          }
          if (found) break;
        }
        if (found || budgetTerminated()) break;
      }
    }
    const exhaustive =
      exact && !found && terminationReason === "sign-space-exhausted";
    if (
      exhaustive &&
      options.certificationComplex === "coface-closed-full" &&
      inconclusiveGeneralizedEvidenceSeen
    ) {
      terminationReason = "missing-generalized-certificates";
      warnings.push(
        "At least one coorientation lacked a passing action-replayed generalized full-cell certificate, so failure of this search is inconclusive.",
      );
    }
    let status: LawfulCoorientationSearchResult["status"] = found
      ? "found"
      : exhaustive && terminationReason === "sign-space-exhausted"
        ? "not-found"
        : "incomplete";
    if (!exact) {
      warnings.push(
        `The wall count ${wallIds.length} exceeds the exact limit ${exactWallLimit}; failure of this deterministic search is inconclusive.`,
      );
    }
    const certificate =
      found && best
        ? buildActionCertificate({
            prepared,
            requestedWallSigns: best.signs,
            certificationComplex:
              options.certificationComplex ?? "rank-two-lawful",
            applicability: options.applicability,
            generalizedCertificate:
              options.generalizedCertificatesBySignKey?.[
                lawfulCoorientationSignKey(wallIds, best.signs)
              ],
            includeFullClosure: options.includeFullClosure ?? false,
          })
        : undefined;
    const certificateReplay = certificate
      ? verifyLawfulSubcomplexActionCertificate(certificate)
      : undefined;
    if (
      certificateReplay &&
      (!certificateReplay.valid || !certificateReplay.mandatoryChecksPassed)
    ) {
      errors.push(
        ...certificateReplay.errors.map((error) => `Lawful replay: ${error}`),
      );
      status = "incomplete";
      terminationReason = "certificate-replay-failed";
      warnings.push(
        "The selected action certificate did not pass mandatory action-rooted replay, so the search result is inconclusive.",
      );
    }
    return {
      schemaVersion: 1,
      kind: "lawful-subcomplex-coorientation-search",
      status,
      method: exact
        ? "exhaustive-sign-search"
        : "deterministic-local-sign-search",
      optimalityProven:
        exhaustive && terminationReason === "sign-space-exhausted",
      globalReversalSymmetryUsed: Boolean(fixedWallId),
      ...(fixedWallId ? { fixedWallId } : {}),
      wallCount: wallIds.length,
      candidatesEvaluated,
      elapsedMilliseconds: now() - startedAt,
      terminationReason,
      ...(best ? { bestWallSigns: best.signs, bestScore: best.score } : {}),
      ...(certificate ? { certificate } : {}),
      ...(certificateReplay ? { certificateReplay } : {}),
      errors,
      warnings,
    };
  } catch (error) {
    const invalid = error instanceof LawfulSearchInputError;
    return {
      schemaVersion: 1,
      kind: "lawful-subcomplex-coorientation-search",
      status: invalid ? "invalid" : "incomplete",
      method: "deterministic-local-sign-search",
      optimalityProven: false,
      globalReversalSymmetryUsed: false,
      wallCount: 0,
      candidatesEvaluated: 0,
      elapsedMilliseconds: now() - startedAt,
      terminationReason: invalid ? "invalid-input" : "runtime-error",
      errors: [errorMessage(error)],
      warnings: invalid
        ? []
        : [
            "The lawful search stopped after a runtime or resource failure. This is inconclusive.",
          ],
    };
  }
}

function buildActionCertificate(input: {
  prepared: PreparedLawfulInput;
  requestedWallSigns?: Partial<Record<string, OrientationSign>>;
  certificationComplex: "rank-two-lawful" | "coface-closed-full";
  applicability?: LawfulTrackApplicabilityEvidence;
  generalizedCertificate?: GeneralizedLawfulCertificate;
  includeFullClosure: boolean;
}): LawfulSubcomplexActionCertificate {
  const { prepared } = input;
  const cover = buildCoverCompression(prepared.quotient);
  const wallSystem = findWallSystem(cover.barX);
  const coorientation = createWallCoorientation(
    wallSystem,
    input.requestedWallSigns,
  );
  const fullCellPoset = input.includeFullClosure
    ? buildFullDavisQuotientCellPoset(prepared.system, prepared.accepted, {
        sourceQuotientVertexIds: prepared.sourceQuotientVertexIds,
      })
    : undefined;
  const generalizedSourceOracle = input.generalizedCertificate
    ? buildStreamedLawfulDavisOracle({
        system: prepared.system,
        generatorImages: prepared.accepted.candidate.generatorImages,
      })
    : undefined;
  const lawful = buildLawfulSubcomplexFiberingCertificate({
    quotient: prepared.quotient,
    cover,
    wallSystem,
    coorientation,
    applicability: input.applicability,
    generalizedCertificate: input.generalizedCertificate,
    generalizedSourceOracle,
    fullCellPoset,
    certificationComplex: input.certificationComplex,
  });
  const actionSha256 = actionHash(
    prepared.system,
    prepared.accepted,
    prepared.sourceQuotientVertexIds,
  );
  const subgroupAction: CertifiedFiniteActionEvidence = {
    sourceQuotientVertexIds: prepared.sourceQuotientVertexIds,
    candidate: prepared.accepted.candidate,
    certificate: prepared.accepted.certificate,
    actionHashAlgorithm: "sha256",
    actionHash: actionSha256,
  };
  const errors = lawful.status === "failed" ? [...lawful.errors] : [];
  const withoutArtifactHash = {
    schemaVersion: 1 as const,
    kind: "action-rooted-lawful-subcomplex-fibering-certificate" as const,
    method: "certified-action-lawful-first-reconstruction" as const,
    status: lawful.status,
    source: {
      coxeterSystem: prepared.system,
      quotientName: prepared.quotient.name,
      subgroupName: prepared.quotient.subgroup?.name ?? prepared.quotient.name,
      subgroupIndex: prepared.accepted.candidate.index,
    },
    subgroupAction,
    requestedWallSigns: { ...coorientation.wallSigns },
    lawful,
    hashes: {
      sourceSystemSha256: canonicalSha256(jsonData(prepared.system)),
      actionSha256,
      coverCompressionSha256: canonicalSha256(jsonData(cover)),
      wallSystemSha256: canonicalSha256(jsonData(wallSystem)),
      coorientationSha256: canonicalSha256(jsonData(coorientation)),
      lawfulCertificateSha256: canonicalSha256(jsonData(lawful)),
    },
    errors: uniqueSorted(errors),
    warnings: uniqueSorted(lawful.warnings),
    nonClaims: [
      "An exhausted sign search concerns only this finite action and this wall-coorientation profile.",
      "The higher coface closure is not a Morse certificate unless its separate higher-cell gates pass.",
      "No locally trivial topological bundle is asserted.",
    ],
  };
  return {
    ...withoutArtifactHash,
    hashes: {
      ...withoutArtifactHash.hashes,
      artifactSha256: canonicalSha256(jsonData(withoutArtifactHash)),
    },
  };
}

function prepareCanonicalInput(quotient: QuotientComplex): PreparedLawfulInput {
  if (!quotient.sourceSystem) {
    throw new LawfulSearchInputError(
      "The quotient omits its source Coxeter system.",
    );
  }
  const reconstructed = certifyFiniteActionFromQuotient(quotient);
  const sourceQuotientVertexIds = Array.from(
    { length: reconstructed.accepted.candidate.index },
    (_unused, point) => `q${point}`,
  );
  const subgroupName = quotient.subgroup?.name ?? quotient.name;
  return {
    system: quotient.sourceSystem,
    accepted: reconstructed.accepted,
    quotient: acceptedActionToQuotientComplex(
      quotient.sourceSystem,
      reconstructed.accepted,
      { name: quotient.name, subgroupName },
    ),
    sourceQuotientVertexIds,
  };
}

function actionHash(
  system: CoxeterSystemInput,
  accepted: TorsionFreeCandidateResult,
  sourceQuotientVertexIds: readonly string[],
): string {
  return canonicalSha256({
    system: jsonData(system),
    sourceQuotientVertexIds: [...sourceQuotientVertexIds],
    generatorImages: accepted.candidate.generatorImages,
    certificate: jsonData(accepted.certificate),
  });
}

function lawfulArtifactHash(
  certificate: LawfulSubcomplexActionCertificate,
): string {
  const clone = jsonData(certificate);
  const { artifactSha256: _discarded, ...hashes } = clone.hashes;
  void _discarded;
  return canonicalSha256({ ...clone, hashes });
}

function expectHash(
  label: string,
  stored: string | undefined,
  rebuilt: string | undefined,
  errors: string[],
  checked: string[],
): void {
  if (!stored || !rebuilt || stored !== rebuilt) {
    errors.push(`${label} hash is missing or stale.`);
  } else {
    checked.push(label);
  }
}

function deterministicSeeds(
  wallIds: readonly string[],
  fixedWallId: string | undefined,
): Array<Record<string, OrientationSign>> {
  const seeds = [
    Object.fromEntries(wallIds.map((wallId) => [wallId, 1])),
    Object.fromEntries(
      wallIds.map((wallId, index) => [wallId, index % 2 === 0 ? 1 : -1]),
    ),
    Object.fromEntries(
      wallIds.map((wallId, index) => [
        wallId,
        index < wallIds.length / 2 ? 1 : -1,
      ]),
    ),
  ] as Array<Record<string, OrientationSign>>;
  if (fixedWallId) {
    for (const seed of seeds) seed[fixedWallId] = 1;
  }
  return seeds;
}

/** Stable, wall-id-bound lookup key used by generalized certificate maps. */
export function lawfulCoorientationSignKey(
  wallIds: readonly string[],
  signs: Readonly<Record<string, OrientationSign>>,
): string {
  return wallIds.map((wallId) => (signs[wallId] === -1 ? "-" : "+")).join("");
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? (value as number)
    : fallback;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort(compareIds);
  const b = [...right].sort(compareIds);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function jsonData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareIds);
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
