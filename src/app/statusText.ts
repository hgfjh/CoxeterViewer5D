// Readable phrases for the raw status enums carried by search results and
// certificates. The raw values stay in exported JSON and in CSS class names
// (`status-${raw}`); only the visible text goes through these helpers.

const STATUS_PHRASES: Record<string, string> = {
  // Automatic cover search (AutomaticCoverSearchStatus).
  ready: "ready",
  searching: "searching",
  found: "found",
  exhausted: "bounds exhausted",
  skipped: "skipped",
  timeout: "timed out",
  failed: "failed",
  // Certificates, stages, and lawful-track checks.
  passed: "passed",
  incomplete: "incomplete",
  "not-run": "not run",
  "not-established": "not established",
  // Coorientation searches.
  "not-found": "none found",
  invalid: "invalid input",
};

/**
 * Visible text for a raw status value. Unknown values fall back to the raw
 * string with hyphens replaced by spaces, so a new enum member still reads
 * sensibly before it is added here.
 */
export function describeStatus(status: string): string {
  return STATUS_PHRASES[status] ?? status.replaceAll("-", " ");
}

const TERMINATION_PHRASES: Record<string, string> = {
  "solution-found": "a passing coorientation was found",
  "sign-space-exhausted": "every wall-sign assignment was checked",
  "wall-limit": "too many walls for an exhaustive sign search",
  "candidate-budget": "the candidate budget ran out",
  "time-budget": "the time budget ran out",
  "missing-generalized-certificates":
    "the generalized lawful certificates were not available",
  "certificate-replay-failed": "the certificate did not replay",
  "invalid-input": "the input was invalid",
  "runtime-error": "the search stopped with an error",
};

/**
 * Why a lawful (Track A) or full-Davis (Track B) coorientation search
 * stopped, as a clause that can follow "because" or a semicolon.
 */
export function describeTerminationReason(reason: string): string {
  return TERMINATION_PHRASES[reason] ?? reason.replaceAll("-", " ");
}

const STRATEGY_PHRASES: Record<string, string> = {
  "gap-low-index": "GAP low-index search",
  "sage-congruence-kernel": "Sage congruence kernel",
  "sage-finite-image-coset": "Sage finite-image coset search",
  "everitt-composite": "Everitt composite action",
};

/** Name of a torsion-free cover discovery strategy. */
export function describeStrategy(strategy: string): string {
  return STRATEGY_PHRASES[strategy] ?? strategy.replaceAll("-", " ");
}

const DEGREE_OUTCOME_PHRASES: Record<string, string> = {
  impossible: "impossible",
  "ruled-out": "ruled out",
  admissible: "admissible",
  unknown: "unknown",
  "witness-contaminated": "every candidate contains a torsion witness",
  "materialized-and-rejected": "built and rejected",
  "certified-torsion-free": "certified torsion-free",
  "unresolved-family-coverage": "some subgroup families unresolved",
};

/** Outcome of one degree in a bounded finite-image classification. */
export function describeDegreeOutcome(outcome: string): string {
  return DEGREE_OUTCOME_PHRASES[outcome] ?? outcome.replaceAll("-", " ");
}

/** "1 cell", "2 cells"; `plural` defaults to the singular plus "s". */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}
