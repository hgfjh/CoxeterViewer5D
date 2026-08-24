import { parseCoxeterSystemInput } from "../coxeter";
import { certifyTorsionFreeAction } from "./certification";
import { acceptedActionToQuotientComplex } from "./quotient";
import {
  computeTorsionFreeIndexLowerBound,
  planSphericalSpecialSubgroups,
} from "./sphericalPlanning";
import type {
  TorsionFreeCandidateResult,
  TorsionFreeDiscoveryProgress,
  TorsionFreeDiscoveryRequest,
  TorsionFreeDiscoveryResult,
} from "./types";

type ProgressReporter = (progress: TorsionFreeDiscoveryProgress) => void;

/**
 * Evaluates backend-supplied finite actions and returns the smallest passing one.
 * Candidate generation belongs to GAP/Sage adapters; this core owns exact checks,
 * completeness accounting, deterministic selection, and quotient construction.
 */
export function discoverTorsionFreeCover(
  request: TorsionFreeDiscoveryRequest,
  onProgress?: ProgressReporter,
): TorsionFreeDiscoveryResult {
  if (request.schemaVersion !== 1) {
    throw new Error("Torsion-free discovery request schemaVersion must be 1.");
  }
  const system = parseCoxeterSystemInput(request.system);
  onProgress?.({
    phase: "spherical-planning",
    completed: 0,
    total: 1,
    message: `Planning spherical special subgroups of ${system.name}.`,
  });
  const sphericalPlan = planSphericalSpecialSubgroups(system, request.limits);
  const indexLowerBound = computeTorsionFreeIndexLowerBound(sphericalPlan);
  onProgress?.({
    phase: "spherical-planning",
    completed: 1,
    total: 1,
    message: `Planned ${sphericalPlan.sphericalSubgroups.length} spherical special subgroups.`,
  });

  const orderedCandidates = [...request.candidates].sort(
    (left, right) =>
      left.index - right.index || left.id.localeCompare(right.id),
  );
  const candidates: TorsionFreeCandidateResult[] = orderedCandidates.map(
    (candidate, candidateIndex) => {
      onProgress?.({
        phase: "candidate-validation",
        completed: candidateIndex,
        total: orderedCandidates.length,
        candidateId: candidate.id,
        message: `Checking candidate ${candidate.id}.`,
      });
      const certificate = certifyTorsionFreeAction(
        system,
        candidate,
        sphericalPlan,
        {
          maxSphericalSubgroupElements:
            request.limits?.maxSphericalSubgroupElements,
          maxWitnesses: request.limits?.maxWitnesses,
          onProgress,
        },
      );
      onProgress?.({
        phase: "candidate-validation",
        completed: candidateIndex + 1,
        total: orderedCandidates.length,
        candidateId: candidate.id,
        message: `Candidate ${candidate.id}: ${certificate.status}.`,
      });
      return { candidate, certificate };
    },
  );
  const accepted = candidates.find(
    ({ certificate }) => certificate.status === "passed",
  );
  const warnings = [...sphericalPlan.warnings];
  if (!request.candidateEnumeration.complete) {
    warnings.push(
      `Candidate enumeration by ${request.candidateEnumeration.method} is incomplete; failure to find a cover would not be conclusive.`,
    );
  }

  let quotient;
  if (accepted !== undefined) {
    onProgress?.({
      phase: "quotient-construction",
      completed: 0,
      total: 1,
      candidateId: accepted.candidate.id,
      message: `Building quotient cells for ${accepted.candidate.id}.`,
    });
    quotient = acceptedActionToQuotientComplex(system, accepted);
    onProgress?.({
      phase: "quotient-construction",
      completed: 1,
      total: 1,
      candidateId: accepted.candidate.id,
      message: `Built quotient cells for ${accepted.candidate.id}.`,
    });
  }

  const hasIncompleteCandidate = candidates.some(
    ({ certificate }) => certificate.status === "incomplete",
  );
  const status =
    accepted !== undefined
      ? "found"
      : sphericalPlan.status === "incomplete" ||
          !request.candidateEnumeration.complete ||
          hasIncompleteCandidate
        ? "incomplete"
        : "not-found";
  if (accepted === undefined) {
    warnings.push(
      status === "incomplete"
        ? "No passing action was found, but at least one required enumeration is incomplete."
        : "The declared candidate enumeration completed without a passing action.",
    );
  }
  onProgress?.({
    phase: "complete",
    completed: 1,
    total: 1,
    candidateId: accepted?.candidate.id,
    message: `Torsion-free cover discovery ${status}.`,
  });

  return {
    status,
    sphericalPlan,
    indexLowerBound,
    candidates,
    accepted,
    quotient,
    errors: [],
    warnings,
  };
}
