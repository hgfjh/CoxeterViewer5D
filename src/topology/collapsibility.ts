/**
 * Minimal input for a finite abstract simplicial complex.
 *
 * Maximal simplices are sufficient: the checker inserts every nonempty face.
 * Isolated vertices may be supplied separately through `vertices`.
 */
export interface SimplicialCollapsibilityInput {
  vertices?: readonly string[];
  simplices: readonly (readonly string[])[];
}

export interface CollapsibilitySearchOptions {
  /** Maximum number of distinct, nonterminal states expanded by the search. */
  maxStates?: number;
  /** Maximum number of elementary-collapse transitions examined. */
  maxTransitions?: number;
  /** Wall-clock guard for this synchronous checker. */
  maxMilliseconds?: number;
  /** Ignore wall time and stop only at deterministic state/transition bounds. */
  deterministicStateBudgetOnly?: boolean;
}

export interface ResolvedCollapsibilityBudget {
  maxStates: number;
  maxTransitions: number;
  maxMilliseconds: number;
}

export interface ElementaryCollapseCertificateStep {
  freeFaceId: string;
  cofaceId: string;
}

export interface CollapseSequenceCertificate {
  schemaVersion: 1;
  kind: "collapse-sequence";
  initialSimplexIds: string[];
  steps: ElementaryCollapseCertificateStep[];
  finalVertexId: string;
}

export interface ExhaustiveCollapseTransitionCertificate extends ElementaryCollapseCertificateStep {
  targetStateId: string;
}

export interface ExhaustiveCollapseStateCertificate {
  stateId: string;
  collapses: ExhaustiveCollapseTransitionCertificate[];
}

/**
 * A finite decision DAG proving that no elementary-collapse path reaches a
 * point. Each state lists every legal collapse, not merely the branch chosen
 * by the search.
 */
export interface ExhaustiveNonCollapsibilityCertificate {
  schemaVersion: 1;
  kind: "exhaustive-non-collapsibility";
  initialSimplexIds: string[];
  rootStateId: string;
  states: ExhaustiveCollapseStateCertificate[];
}

export type SimplicialCollapsibilityCertificate =
  | CollapseSequenceCertificate
  | ExhaustiveNonCollapsibilityCertificate;

export interface CollapsibilitySearchStats {
  statesExpanded: number;
  transitionsExamined: number;
  memoHits: number;
  terminalStates: number;
  maximumDepth: number;
  elapsedMilliseconds: number;
  exhaustive: boolean;
  budget: ResolvedCollapsibilityBudget;
}

export interface CollapsibleResult {
  status: "collapsible";
  collapsible: true;
  sequence: ElementaryCollapseCertificateStep[];
  certificate: CollapseSequenceCertificate;
  stats: CollapsibilitySearchStats;
}

export interface ProvenNonCollapsibleResult {
  status: "proven-not-collapsible";
  collapsible: false;
  certificate: ExhaustiveNonCollapsibilityCertificate;
  stats: CollapsibilitySearchStats;
}

export type CollapsibilityBudgetReason =
  | "state-budget"
  | "transition-budget"
  | "time-budget";

export interface UnknownCollapsibilityResult {
  status: "unknown-budget";
  collapsible: null;
  reason: CollapsibilityBudgetReason;
  stats: CollapsibilitySearchStats;
}

export type SimplicialCollapsibilityResult =
  | CollapsibleResult
  | ProvenNonCollapsibleResult
  | UnknownCollapsibilityResult;

export interface CollapsibilityCertificateVerification {
  valid: boolean;
  certificateKind?: SimplicialCollapsibilityCertificate["kind"];
  stepsVerified: number;
  statesVerified: number;
  transitionsVerified: number;
  finalVertexId?: string;
  error?: string;
}

interface NormalizedComplex {
  simplices: string[][];
  simplexIds: string[];
  idToIndex: Map<string, number>;
  immediateCofaces: number[][];
}

interface CollapsePair {
  faceIndex: number;
  cofaceIndex: number;
}

interface SearchContext {
  complex: NormalizedComplex;
  budget: ResolvedCollapsibilityBudget;
  startedAt: number;
  useTimeBudget: boolean;
  statesExpanded: number;
  transitionsExamined: number;
  memoHits: number;
  terminalStates: number;
  maximumDepth: number;
  exhaustedReason?: CollapsibilityBudgetReason;
  deadStates: Set<string>;
  proofStates: Map<string, ExhaustiveCollapseStateCertificate>;
}

type SearchOutcome =
  | { kind: "found"; sequence: CollapsePair[]; finalVertexIndex: number }
  | { kind: "dead" }
  | { kind: "unknown" };

const DEFAULT_BUDGET: ResolvedCollapsibilityBudget = {
  maxStates: 100_000,
  maxTransitions: 1_000_000,
  maxMilliseconds: 5_000,
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeSimplex(simplex: readonly string[]): string[] {
  return [...new Set(simplex.map(String))].sort(compareText);
}

function compareSimplices(left: string[], right: string[]): number {
  if (left.length !== right.length) {
    return left.length - right.length;
  }
  for (let index = 0; index < left.length; index += 1) {
    const comparison = compareText(left[index], right[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
}

/**
 * Return a collision-free deterministic id for a nonempty abstract simplex.
 * JSON encoding keeps labels such as `"a,b"` distinct from two labels `a,b`.
 */
export function canonicalSimplexId(simplex: readonly string[]): string {
  const normalized = normalizeSimplex(simplex);
  if (normalized.length === 0) {
    throw new Error("A canonical simplex id requires at least one vertex.");
  }
  return `simplex:${normalized.length - 1}:${JSON.stringify(normalized)}`;
}

function addNonemptyFaces(
  simplex: string[],
  byId: Map<string, string[]>,
): void {
  const faces: string[][] = [[]];
  for (const vertex of simplex) {
    const priorCount = faces.length;
    for (let index = 0; index < priorCount; index += 1) {
      faces.push([...faces[index], vertex]);
    }
  }
  for (let index = 1; index < faces.length; index += 1) {
    const face = faces[index];
    byId.set(canonicalSimplexId(face), face);
  }
}

function normalizeComplex(
  input: SimplicialCollapsibilityInput,
): NormalizedComplex {
  const byId = new Map<string, string[]>();

  for (const vertex of input.vertices ?? []) {
    const simplex = [String(vertex)];
    byId.set(canonicalSimplexId(simplex), simplex);
  }
  for (const rawSimplex of input.simplices) {
    const simplex = normalizeSimplex(rawSimplex);
    if (simplex.length > 0) {
      addNonemptyFaces(simplex, byId);
    }
  }

  const simplices = [...byId.values()].sort(compareSimplices);
  const simplexIds = simplices.map(canonicalSimplexId);
  const idToIndex = new Map(
    simplexIds.map((simplexId, index) => [simplexId, index]),
  );
  const immediateCofaces = simplices.map(() => [] as number[]);

  for (let cofaceIndex = 0; cofaceIndex < simplices.length; cofaceIndex += 1) {
    const coface = simplices[cofaceIndex];
    if (coface.length < 2) {
      continue;
    }
    for (let omitted = 0; omitted < coface.length; omitted += 1) {
      const face = coface.filter((_, index) => index !== omitted);
      const faceIndex = idToIndex.get(canonicalSimplexId(face));
      if (faceIndex === undefined) {
        throw new Error(
          "Internal error: normalized complex is not face-closed.",
        );
      }
      immediateCofaces[faceIndex].push(cofaceIndex);
    }
  }

  return { simplices, simplexIds, idToIndex, immediateCofaces };
}

function resolveNonnegativeInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (value === Number.POSITIVE_INFINITY) {
    return value;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `${name} must be a nonnegative finite number or Infinity.`,
    );
  }
  return Math.floor(value);
}

function resolveNonnegativeNumber(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (value === Number.POSITIVE_INFINITY) {
    return value;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `${name} must be a nonnegative finite number or Infinity.`,
    );
  }
  return value;
}

function resolveBudget(
  options: CollapsibilitySearchOptions,
): ResolvedCollapsibilityBudget {
  return {
    maxStates: resolveNonnegativeInteger(
      options.maxStates,
      DEFAULT_BUDGET.maxStates,
      "maxStates",
    ),
    maxTransitions: resolveNonnegativeInteger(
      options.maxTransitions,
      DEFAULT_BUDGET.maxTransitions,
      "maxTransitions",
    ),
    maxMilliseconds: resolveNonnegativeNumber(
      options.maxMilliseconds,
      DEFAULT_BUDGET.maxMilliseconds,
      "maxMilliseconds",
    ),
  };
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function stateKey(active: readonly number[]): string {
  return active.join(".");
}

function stateId(active: readonly number[]): string {
  return `state:${stateKey(active)}`;
}

function parseStateId(
  value: string,
  simplexCount: number,
): number[] | undefined {
  if (!value.startsWith("state:")) {
    return undefined;
  }
  const encoded = value.slice("state:".length);
  if (encoded.length === 0) {
    return [];
  }
  const parts = encoded.split(".");
  if (parts.some((part) => !/^(0|[1-9][0-9]*)$/.test(part))) {
    return undefined;
  }
  const active = parts.map(Number);
  if (
    active.some(
      (index, position) =>
        index >= simplexCount ||
        (position > 0 && index <= active[position - 1]),
    )
  ) {
    return undefined;
  }
  return stateId(active) === value ? active : undefined;
}

function isPoint(
  active: readonly number[],
  complex: NormalizedComplex,
): boolean {
  return active.length === 1 && complex.simplices[active[0]].length === 1;
}

function activeSet(active: readonly number[]): Set<number> {
  return new Set(active);
}

/**
 * A free face has exactly one present codimension-one coface. Face closure then
 * implies that this coface is maximal, so removing the pair is an elementary
 * simplicial collapse and leaves another simplicial complex.
 */
function legalCollapses(
  active: readonly number[],
  complex: NormalizedComplex,
): CollapsePair[] {
  const present = activeSet(active);
  const pairs: CollapsePair[] = [];
  for (const faceIndex of active) {
    let uniqueCoface = -1;
    let count = 0;
    for (const cofaceIndex of complex.immediateCofaces[faceIndex]) {
      if (present.has(cofaceIndex)) {
        uniqueCoface = cofaceIndex;
        count += 1;
        if (count > 1) {
          break;
        }
      }
    }
    if (count === 1) {
      pairs.push({ faceIndex, cofaceIndex: uniqueCoface });
    }
  }
  return pairs;
}

function collapseState(
  active: readonly number[],
  pair: CollapsePair,
): number[] {
  return active.filter(
    (index) => index !== pair.faceIndex && index !== pair.cofaceIndex,
  );
}

function budgetReason(
  context: SearchContext,
): CollapsibilityBudgetReason | undefined {
  if (
    context.useTimeBudget &&
    now() - context.startedAt >= context.budget.maxMilliseconds
  ) {
    return "time-budget";
  }
  if (context.statesExpanded >= context.budget.maxStates) {
    return "state-budget";
  }
  return undefined;
}

function searchCollapses(
  active: number[],
  context: SearchContext,
  depth: number,
): SearchOutcome {
  context.maximumDepth = Math.max(context.maximumDepth, depth);
  if (isPoint(active, context.complex)) {
    return { kind: "found", sequence: [], finalVertexIndex: active[0] };
  }

  const key = stateKey(active);
  if (context.deadStates.has(key)) {
    context.memoHits += 1;
    return { kind: "dead" };
  }

  const exhausted = budgetReason(context);
  if (exhausted !== undefined) {
    context.exhaustedReason ??= exhausted;
    return { kind: "unknown" };
  }
  context.statesExpanded += 1;

  const pairs = legalCollapses(active, context.complex);
  if (pairs.length === 0) {
    context.terminalStates += 1;
  }

  const transitions: ExhaustiveCollapseTransitionCertificate[] = [];
  for (const pair of pairs) {
    if (
      context.useTimeBudget &&
      now() - context.startedAt >= context.budget.maxMilliseconds
    ) {
      context.exhaustedReason ??= "time-budget";
      return { kind: "unknown" };
    }
    if (context.transitionsExamined >= context.budget.maxTransitions) {
      context.exhaustedReason ??= "transition-budget";
      return { kind: "unknown" };
    }
    context.transitionsExamined += 1;

    const child = collapseState(active, pair);
    const outcome = searchCollapses(child, context, depth + 1);
    if (outcome.kind === "found") {
      return {
        kind: "found",
        sequence: [pair, ...outcome.sequence],
        finalVertexIndex: outcome.finalVertexIndex,
      };
    }
    if (outcome.kind === "unknown") {
      return outcome;
    }
    transitions.push({
      freeFaceId: context.complex.simplexIds[pair.faceIndex],
      cofaceId: context.complex.simplexIds[pair.cofaceIndex],
      targetStateId: stateId(child),
    });
  }

  context.deadStates.add(key);
  context.proofStates.set(key, {
    stateId: stateId(active),
    collapses: transitions,
  });
  return { kind: "dead" };
}

function searchStats(
  context: SearchContext,
  exhaustive: boolean,
): CollapsibilitySearchStats {
  return {
    statesExpanded: context.statesExpanded,
    transitionsExamined: context.transitionsExamined,
    memoHits: context.memoHits,
    terminalStates: context.terminalStates,
    maximumDepth: context.maximumDepth,
    elapsedMilliseconds: context.useTimeBudget ? now() - context.startedAt : 0,
    exhaustive,
    budget: { ...context.budget },
  };
}

/**
 * Decide simplicial collapsibility when the configured search budget permits.
 * A negative answer is returned only after all elementary-collapse choices
 * have been exhausted. Budget exhaustion is therefore never reported as a
 * proof of noncollapsibility.
 */
export function checkSimplicialCollapsibility(
  input: SimplicialCollapsibilityInput,
  options: CollapsibilitySearchOptions = {},
): SimplicialCollapsibilityResult {
  const complex = normalizeComplex(input);
  const budget = resolveBudget(options);
  const context: SearchContext = {
    complex,
    budget,
    startedAt: now(),
    useTimeBudget: options.deterministicStateBudgetOnly !== true,
    statesExpanded: 0,
    transitionsExamined: 0,
    memoHits: 0,
    terminalStates: 0,
    maximumDepth: 0,
    deadStates: new Set(),
    proofStates: new Map(),
  };
  const root = complex.simplices.map((_, index) => index);
  const outcome = searchCollapses(root, context, 0);

  if (outcome.kind === "found") {
    const sequence = outcome.sequence.map((pair) => ({
      freeFaceId: complex.simplexIds[pair.faceIndex],
      cofaceId: complex.simplexIds[pair.cofaceIndex],
    }));
    const certificate: CollapseSequenceCertificate = {
      schemaVersion: 1,
      kind: "collapse-sequence",
      initialSimplexIds: [...complex.simplexIds],
      steps: sequence,
      finalVertexId: complex.simplexIds[outcome.finalVertexIndex],
    };
    return {
      status: "collapsible",
      collapsible: true,
      sequence,
      certificate,
      stats: searchStats(context, false),
    };
  }

  if (outcome.kind === "unknown") {
    return {
      status: "unknown-budget",
      collapsible: null,
      reason: context.exhaustedReason ?? "time-budget",
      stats: searchStats(context, false),
    };
  }

  const states = [...context.proofStates.values()].sort((left, right) =>
    compareText(left.stateId, right.stateId),
  );
  const certificate: ExhaustiveNonCollapsibilityCertificate = {
    schemaVersion: 1,
    kind: "exhaustive-non-collapsibility",
    initialSimplexIds: [...complex.simplexIds],
    rootStateId: stateId(root),
    states,
  };
  return {
    status: "proven-not-collapsible",
    collapsible: false,
    certificate,
    stats: searchStats(context, true),
  };
}

/** Short alias for callers that already establish the simplicial context. */
export const checkCollapsibility = checkSimplicialCollapsibility;

function invalidVerification(
  error: string,
  partial: Partial<CollapsibilityCertificateVerification> = {},
): CollapsibilityCertificateVerification {
  return {
    valid: false,
    stepsVerified: partial.stepsVerified ?? 0,
    statesVerified: partial.statesVerified ?? 0,
    transitionsVerified: partial.transitionsVerified ?? 0,
    certificateKind: partial.certificateKind,
    error,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

function verifyHeader(
  complex: NormalizedComplex,
  certificate: Record<string, unknown>,
): string | undefined {
  if (certificate.schemaVersion !== 1) {
    return "Unsupported or missing collapsibility certificate schemaVersion.";
  }
  if (!isStringArray(certificate.initialSimplexIds)) {
    return "Certificate initialSimplexIds must be an array of strings.";
  }
  if (!sameStrings(certificate.initialSimplexIds, complex.simplexIds)) {
    return "Certificate does not describe the supplied simplicial complex.";
  }
  return undefined;
}

/** Replay and verify a positive elementary-collapse certificate. */
export function verifyCollapseCertificate(
  input: SimplicialCollapsibilityInput,
  certificate: unknown,
): CollapsibilityCertificateVerification {
  const kind = "collapse-sequence" as const;
  if (!isRecord(certificate) || certificate.kind !== kind) {
    return invalidVerification("Expected a collapse-sequence certificate.", {
      certificateKind: kind,
    });
  }
  const complex = normalizeComplex(input);
  const headerError = verifyHeader(complex, certificate);
  if (headerError !== undefined) {
    return invalidVerification(headerError, { certificateKind: kind });
  }
  if (!Array.isArray(certificate.steps)) {
    return invalidVerification("Certificate steps must be an array.", {
      certificateKind: kind,
    });
  }

  let active = complex.simplices.map((_, index) => index);
  let stepsVerified = 0;
  for (const rawStep of certificate.steps) {
    if (
      !isRecord(rawStep) ||
      typeof rawStep.freeFaceId !== "string" ||
      typeof rawStep.cofaceId !== "string"
    ) {
      return invalidVerification("A collapse step is malformed.", {
        certificateKind: kind,
        stepsVerified,
      });
    }
    const faceIndex = complex.idToIndex.get(rawStep.freeFaceId);
    const cofaceIndex = complex.idToIndex.get(rawStep.cofaceId);
    const present = activeSet(active);
    if (
      faceIndex === undefined ||
      cofaceIndex === undefined ||
      !present.has(faceIndex) ||
      !present.has(cofaceIndex)
    ) {
      return invalidVerification(
        `Collapse step ${stepsVerified} references an absent simplex.`,
        { certificateKind: kind, stepsVerified },
      );
    }
    const currentCofaces = complex.immediateCofaces[faceIndex].filter((index) =>
      present.has(index),
    );
    if (currentCofaces.length !== 1 || currentCofaces[0] !== cofaceIndex) {
      return invalidVerification(
        `Collapse step ${stepsVerified} does not pair a free face with its unique coface.`,
        { certificateKind: kind, stepsVerified },
      );
    }
    active = collapseState(active, { faceIndex, cofaceIndex });
    stepsVerified += 1;
  }

  if (!isPoint(active, complex)) {
    return invalidVerification(
      "Collapse sequence does not finish at a single vertex.",
      { certificateKind: kind, stepsVerified },
    );
  }
  const finalVertexId = complex.simplexIds[active[0]];
  if (certificate.finalVertexId !== finalVertexId) {
    return invalidVerification("Certificate finalVertexId is incorrect.", {
      certificateKind: kind,
      stepsVerified,
    });
  }
  return {
    valid: true,
    certificateKind: kind,
    stepsVerified,
    statesVerified: 0,
    transitionsVerified: 0,
    finalVertexId,
  };
}

interface ParsedExhaustiveState {
  active: number[];
  rawCollapses: unknown[];
}

/** Verify that an exhaustive decision DAG accounts for every legal collapse. */
export function verifyNonCollapsibilityCertificate(
  input: SimplicialCollapsibilityInput,
  certificate: unknown,
): CollapsibilityCertificateVerification {
  const kind = "exhaustive-non-collapsibility" as const;
  if (!isRecord(certificate) || certificate.kind !== kind) {
    return invalidVerification(
      "Expected an exhaustive-non-collapsibility certificate.",
      { certificateKind: kind },
    );
  }
  const complex = normalizeComplex(input);
  const headerError = verifyHeader(complex, certificate);
  if (headerError !== undefined) {
    return invalidVerification(headerError, { certificateKind: kind });
  }
  if (typeof certificate.rootStateId !== "string") {
    return invalidVerification("Certificate rootStateId is missing.", {
      certificateKind: kind,
    });
  }
  const root = complex.simplices.map((_, index) => index);
  if (certificate.rootStateId !== stateId(root)) {
    return invalidVerification("Certificate root state is incorrect.", {
      certificateKind: kind,
    });
  }
  if (!Array.isArray(certificate.states)) {
    return invalidVerification("Certificate states must be an array.", {
      certificateKind: kind,
    });
  }

  const states = new Map<string, ParsedExhaustiveState>();
  for (const rawState of certificate.states) {
    if (
      !isRecord(rawState) ||
      typeof rawState.stateId !== "string" ||
      !Array.isArray(rawState.collapses)
    ) {
      return invalidVerification("An exhaustive-search state is malformed.", {
        certificateKind: kind,
        statesVerified: states.size,
      });
    }
    const active = parseStateId(rawState.stateId, complex.simplices.length);
    if (active === undefined) {
      return invalidVerification(
        "An exhaustive-search state id is not canonical.",
        {
          certificateKind: kind,
          statesVerified: states.size,
        },
      );
    }
    if (states.has(rawState.stateId)) {
      return invalidVerification(
        "Certificate repeats an exhaustive-search state.",
        {
          certificateKind: kind,
          statesVerified: states.size,
        },
      );
    }
    if (isPoint(active, complex)) {
      return invalidVerification(
        "A noncollapsibility certificate contains a successful point state.",
        { certificateKind: kind, statesVerified: states.size },
      );
    }
    states.set(rawState.stateId, {
      active,
      rawCollapses: rawState.collapses,
    });
  }
  if (!states.has(certificate.rootStateId)) {
    return invalidVerification("Certificate omits its root state.", {
      certificateKind: kind,
      statesVerified: states.size,
    });
  }

  let transitionsVerified = 0;
  const adjacency = new Map<string, string[]>();
  for (const [currentStateId, state] of states) {
    const expectedPairs = legalCollapses(state.active, complex);
    if (state.rawCollapses.length !== expectedPairs.length) {
      return invalidVerification(
        `State ${currentStateId} does not list every legal collapse.`,
        {
          certificateKind: kind,
          statesVerified: states.size,
          transitionsVerified,
        },
      );
    }
    const expectedByPair = new Map(
      expectedPairs.map((pair) => [
        `${pair.faceIndex}:${pair.cofaceIndex}`,
        pair,
      ]),
    );
    const seenPairs = new Set<string>();
    const targets: string[] = [];
    for (const rawTransition of state.rawCollapses) {
      if (
        !isRecord(rawTransition) ||
        typeof rawTransition.freeFaceId !== "string" ||
        typeof rawTransition.cofaceId !== "string" ||
        typeof rawTransition.targetStateId !== "string"
      ) {
        return invalidVerification(
          "An exhaustive-search transition is malformed.",
          {
            certificateKind: kind,
            statesVerified: states.size,
            transitionsVerified,
          },
        );
      }
      const faceIndex = complex.idToIndex.get(rawTransition.freeFaceId);
      const cofaceIndex = complex.idToIndex.get(rawTransition.cofaceId);
      const pairKey = `${faceIndex}:${cofaceIndex}`;
      const pair = expectedByPair.get(pairKey);
      if (pair === undefined || seenPairs.has(pairKey)) {
        return invalidVerification(
          `State ${currentStateId} contains an invalid or duplicate collapse.`,
          {
            certificateKind: kind,
            statesVerified: states.size,
            transitionsVerified,
          },
        );
      }
      seenPairs.add(pairKey);
      const target = collapseState(state.active, pair);
      const expectedTargetId = stateId(target);
      if (rawTransition.targetStateId !== expectedTargetId) {
        return invalidVerification(
          "A collapse transition has the wrong target state.",
          {
            certificateKind: kind,
            statesVerified: states.size,
            transitionsVerified,
          },
        );
      }
      if (isPoint(target, complex)) {
        return invalidVerification(
          "A listed collapse reaches a point, so the complex is collapsible.",
          {
            certificateKind: kind,
            statesVerified: states.size,
            transitionsVerified,
          },
        );
      }
      if (!states.has(expectedTargetId)) {
        return invalidVerification(
          "Certificate omits a state reached by a legal collapse.",
          {
            certificateKind: kind,
            statesVerified: states.size,
            transitionsVerified,
          },
        );
      }
      targets.push(expectedTargetId);
      transitionsVerified += 1;
    }
    adjacency.set(currentStateId, targets);
  }

  const reachable = new Set<string>();
  const queue = [certificate.rootStateId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  if (reachable.size !== states.size) {
    return invalidVerification(
      "Certificate contains states not reachable from its root.",
      {
        certificateKind: kind,
        statesVerified: states.size,
        transitionsVerified,
      },
    );
  }

  return {
    valid: true,
    certificateKind: kind,
    stepsVerified: 0,
    statesVerified: states.size,
    transitionsVerified,
  };
}

/** Verify either supported certificate kind without trusting its claimed status. */
export function verifyCollapsibilityCertificate(
  input: SimplicialCollapsibilityInput,
  certificate: unknown,
): CollapsibilityCertificateVerification {
  if (!isRecord(certificate)) {
    return invalidVerification("Collapsibility certificate must be an object.");
  }
  if (certificate.kind === "collapse-sequence") {
    return verifyCollapseCertificate(input, certificate);
  }
  if (certificate.kind === "exhaustive-non-collapsibility") {
    return verifyNonCollapsibilityCertificate(input, certificate);
  }
  return invalidVerification("Unknown collapsibility certificate kind.");
}
