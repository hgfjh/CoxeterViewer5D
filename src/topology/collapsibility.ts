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
  /**
   * Check reduced Z/2 homology before searching (default true).  A collapsible
   * complex is contractible, hence acyclic, so a nonzero reduced Betti number
   * settles noncollapsibility in polynomial time; the exhaustive collapse
   * search it replaces is exponential and stores every visited state.
   */
  homologyPrecheck?: boolean;
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

/**
 * Noncollapsibility witnessed by nonzero reduced homology over Z/2: a
 * collapsible complex is contractible and therefore acyclic.  Verification
 * recomputes the Betti numbers exactly from the supplied complex.
 */
export interface HomologyNonCollapsibilityCertificate {
  schemaVersion: 1;
  kind: "nonzero-reduced-homology";
  field: "F2";
  initialSimplexIds: string[];
  /** Reduced Betti numbers over Z/2, indexed by dimension. */
  reducedBettiNumbers: number[];
}

export type NonCollapsibilityCertificate =
  | ExhaustiveNonCollapsibilityCertificate
  | HomologyNonCollapsibilityCertificate;

export type SimplicialCollapsibilityCertificate =
  | CollapseSequenceCertificate
  | NonCollapsibilityCertificate;

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
  certificate: NonCollapsibilityCertificate;
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

/**
 * Incremental search state.  The original formulation rebuilt a Set of all
 * active simplices and a joined string key at every state, which is
 * quadratic along a collapse path; here presence and present-coface counts
 * are updated per collapse and undone on backtrack.  Branch order (free
 * faces by increasing index, each with its unique present coface), memo
 * semantics, statistics and certificates are unchanged.
 */
interface IncrementalState {
  present: Uint8Array;
  presentCofaces: Int32Array;
  facets: number[][];
  activeCount: number;
  hashLow: number;
  hashHigh: number;
  zobristLow: Int32Array;
  zobristHigh: Int32Array;
  /** Dead states bucketed by hash; membership is decided by exact bitsets. */
  dead: Map<string, Uint8Array[]>;
}

function createIncrementalState(complex: NormalizedComplex): IncrementalState {
  const count = complex.simplices.length;
  const facets: number[][] = complex.simplices.map(() => []);
  complex.immediateCofaces.forEach((cofaces, faceIndex) => {
    for (const coface of cofaces) facets[coface].push(faceIndex);
  });
  const presentCofaces = new Int32Array(count);
  complex.immediateCofaces.forEach((cofaces, index) => {
    presentCofaces[index] = cofaces.length;
  });
  // Deterministic pseudo-random keys (xorshift) for Zobrist hashing.
  const zobristLow = new Int32Array(count);
  const zobristHigh = new Int32Array(count);
  let seed = 0x9e3779b9;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed | 0;
  };
  let hashLow = 0;
  let hashHigh = 0;
  for (let index = 0; index < count; index += 1) {
    zobristLow[index] = next();
    zobristHigh[index] = next();
    hashLow ^= zobristLow[index];
    hashHigh ^= zobristHigh[index];
  }
  return {
    present: new Uint8Array(count).fill(1),
    presentCofaces,
    facets,
    activeCount: count,
    hashLow,
    hashHigh,
    zobristLow,
    zobristHigh,
    dead: new Map(),
  };
}

function toggleSimplex(state: IncrementalState, index: number, on: boolean) {
  state.present[index] = on ? 1 : 0;
  state.activeCount += on ? 1 : -1;
  state.hashLow ^= state.zobristLow[index];
  state.hashHigh ^= state.zobristHigh[index];
  const delta = on ? 1 : -1;
  for (const facet of state.facets[index]) state.presentCofaces[facet] += delta;
}

function activeIndices(state: IncrementalState): number[] {
  const active: number[] = [];
  for (let index = 0; index < state.present.length; index += 1) {
    if (state.present[index] === 1) active.push(index);
  }
  return active;
}

function deadStateKey(state: IncrementalState): string {
  return `${state.hashLow >>> 0}:${state.hashHigh >>> 0}`;
}

function isKnownDead(state: IncrementalState): boolean {
  const bucket = state.dead.get(deadStateKey(state));
  if (!bucket) return false;
  return bucket.some((stored) => {
    for (let index = 0; index < stored.length; index += 1) {
      if (stored[index] !== state.present[index]) return false;
    }
    return true;
  });
}

function rememberDead(state: IncrementalState): void {
  const key = deadStateKey(state);
  const bucket = state.dead.get(key) ?? [];
  bucket.push(state.present.slice());
  state.dead.set(key, bucket);
}

function incrementalLegalCollapses(
  state: IncrementalState,
  complex: NormalizedComplex,
): CollapsePair[] {
  const pairs: CollapsePair[] = [];
  for (let faceIndex = 0; faceIndex < state.present.length; faceIndex += 1) {
    if (
      state.present[faceIndex] === 0 ||
      state.presentCofaces[faceIndex] !== 1
    ) {
      continue;
    }
    for (const cofaceIndex of complex.immediateCofaces[faceIndex]) {
      if (state.present[cofaceIndex] === 1) {
        pairs.push({ faceIndex, cofaceIndex });
        break;
      }
    }
  }
  return pairs;
}

interface SearchFrame {
  pairs: CollapsePair[];
  next: number;
  transitions: ExhaustiveCollapseTransitionCertificate[];
}

/**
 * Depth-first search over elementary collapses with an explicit frame stack:
 * collapse paths in order complexes run to tens of thousands of steps, more
 * than the call stack allows.  Visit order and bookkeeping match the former
 * recursive search exactly.
 */
function searchCollapsesIncremental(
  state: IncrementalState,
  context: SearchContext,
  rootDepth: number,
): SearchOutcome {
  const frames: SearchFrame[] = [];
  const applied: CollapsePair[] = [];

  // Enter the current state: a final outcome, or a new frame to expand.
  const enter = (depth: number): SearchOutcome | "expanded" => {
    context.maximumDepth = Math.max(context.maximumDepth, depth);
    if (state.activeCount === 1) {
      const only = state.present.indexOf(1);
      if (context.complex.simplices[only].length === 1) {
        return {
          kind: "found",
          sequence: [...applied],
          finalVertexIndex: only,
        };
      }
    }
    if (isKnownDead(state)) {
      context.memoHits += 1;
      return { kind: "dead" };
    }
    const exhausted = budgetReason(context);
    if (exhausted !== undefined) {
      context.exhaustedReason ??= exhausted;
      return { kind: "unknown" };
    }
    context.statesExpanded += 1;
    const pairs = incrementalLegalCollapses(state, context.complex);
    if (pairs.length === 0) context.terminalStates += 1;
    frames.push({ pairs, next: 0, transitions: [] });
    return "expanded";
  };

  let outcome = enter(rootDepth);
  if (outcome !== "expanded") return outcome;
  while (frames.length > 0) {
    const frame = frames[frames.length - 1];
    if (frame.next < frame.pairs.length) {
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
      const pair = frame.pairs[frame.next];
      toggleSimplex(state, pair.faceIndex, false);
      toggleSimplex(state, pair.cofaceIndex, false);
      applied.push(pair);
      outcome = enter(rootDepth + frames.length);
      if (outcome === "expanded") continue;
      if (outcome.kind !== "dead") return outcome;
      // The child is dead: record the transition and undo the collapse.
      frame.transitions.push({
        freeFaceId: context.complex.simplexIds[pair.faceIndex],
        cofaceId: context.complex.simplexIds[pair.cofaceIndex],
        targetStateId: stateId(activeIndices(state)),
      });
      applied.pop();
      toggleSimplex(state, pair.cofaceIndex, true);
      toggleSimplex(state, pair.faceIndex, true);
      frame.next += 1;
      continue;
    }
    // Every branch of this state is dead.
    rememberDead(state);
    const active = activeIndices(state);
    context.proofStates.set(stateKey(active), {
      stateId: stateId(active),
      collapses: frame.transitions,
    });
    frames.pop();
    const parent = frames[frames.length - 1];
    if (!parent) return { kind: "dead" };
    const pair = parent.pairs[parent.next];
    parent.transitions.push({
      freeFaceId: context.complex.simplexIds[pair.faceIndex],
      cofaceId: context.complex.simplexIds[pair.cofaceIndex],
      targetStateId: stateId(active),
    });
    applied.pop();
    toggleSimplex(state, pair.cofaceIndex, true);
    toggleSimplex(state, pair.faceIndex, true);
    parent.next += 1;
  }
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
 * Reduced Betti numbers over Z/2 by Gaussian elimination of boundary
 * matrices stored as bitsets (rows: simplices, columns: their facets).  The
 * augmentation C_0 -> Z/2 makes these the reduced numbers.
 */
function reducedZ2BettiNumbers(complex: NormalizedComplex): number[] {
  const byDimension = new Map<number, number[]>();
  complex.simplices.forEach((simplex, index) => {
    const dimension = simplex.length - 1;
    const bucket = byDimension.get(dimension) ?? [];
    bucket.push(index);
    byDimension.set(dimension, bucket);
  });
  const top = Math.max(-1, ...byDimension.keys());
  // Position of each simplex within its dimension, for column indexing.
  const positionOf = new Int32Array(complex.simplices.length);
  for (const bucket of byDimension.values()) {
    bucket.forEach((index, position) => {
      positionOf[index] = position;
    });
  }
  const rankOfBoundary = (dimension: number): number => {
    const rows = byDimension.get(dimension) ?? [];
    if (rows.length === 0) return 0;
    if (dimension === 0) return 1; // augmentation onto Z/2
    const facetCount = (byDimension.get(dimension - 1) ?? []).length;
    const words = Math.ceil(facetCount / 32);
    const pivots = new Map<number, Uint32Array>();
    let rank = 0;
    for (const row of rows) {
      const bits = new Uint32Array(words);
      const simplex = complex.simplices[row];
      for (let omitted = 0; omitted < simplex.length; omitted += 1) {
        const facet = simplex.filter((_, index) => index !== omitted);
        const facetIndex = complex.idToIndex.get(canonicalSimplexId(facet))!;
        const column = positionOf[facetIndex];
        bits[column >>> 5] ^= 1 << (column & 31);
      }
      // Reduce by existing pivots, highest set bit first.
      for (let word = words - 1; word >= 0; word -= 1) {
        while (bits[word] !== 0) {
          const bit = 31 - Math.clz32(bits[word]);
          const column = word * 32 + bit;
          const pivot = pivots.get(column);
          if (!pivot) {
            pivots.set(column, bits);
            rank += 1;
            word = -1;
            break;
          }
          for (let k = 0; k <= word; k += 1) bits[k] ^= pivot[k];
        }
      }
    }
    return rank;
  };
  const betti: number[] = [];
  const ranks = new Map<number, number>();
  for (let dimension = 0; dimension <= top + 1; dimension += 1) {
    ranks.set(dimension, rankOfBoundary(dimension));
  }
  for (let dimension = 0; dimension <= top; dimension += 1) {
    const chains = (byDimension.get(dimension) ?? []).length;
    betti.push(chains - ranks.get(dimension)! - ranks.get(dimension + 1)!);
  }
  return betti;
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
  if (options.homologyPrecheck !== false && complex.simplices.length > 0) {
    const reducedBettiNumbers = reducedZ2BettiNumbers(complex);
    if (reducedBettiNumbers.some((value) => value !== 0)) {
      return {
        status: "proven-not-collapsible",
        collapsible: false,
        certificate: {
          schemaVersion: 1,
          kind: "nonzero-reduced-homology",
          field: "F2",
          initialSimplexIds: [...complex.simplexIds],
          reducedBettiNumbers,
        },
        stats: {
          statesExpanded: 0,
          transitionsExamined: 0,
          memoHits: 0,
          terminalStates: 0,
          maximumDepth: 0,
          elapsedMilliseconds: 0,
          exhaustive: false,
          budget,
        },
      };
    }
  }
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
  const outcome = searchCollapsesIncremental(
    createIncrementalState(complex),
    context,
    0,
  );

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

/** Recompute the reduced Z/2 Betti numbers claimed by a homology witness. */
function verifyHomologyCertificate(
  input: SimplicialCollapsibilityInput,
  certificate: Record<string, unknown>,
): CollapsibilityCertificateVerification {
  const kind = "nonzero-reduced-homology" as const;
  const complex = normalizeComplex(input);
  const headerError = verifyHeader(complex, certificate);
  if (headerError !== undefined) {
    return invalidVerification(headerError, { certificateKind: kind });
  }
  if (certificate.field !== "F2") {
    return invalidVerification("Homology certificates must use field F2.", {
      certificateKind: kind,
    });
  }
  const recomputed = reducedZ2BettiNumbers(complex);
  const claimed = certificate.reducedBettiNumbers;
  if (
    !Array.isArray(claimed) ||
    claimed.length !== recomputed.length ||
    claimed.some((value, index) => value !== recomputed[index])
  ) {
    return invalidVerification(
      "Claimed reduced Betti numbers do not match the complex.",
      { certificateKind: kind },
    );
  }
  if (recomputed.every((value) => value === 0)) {
    return invalidVerification(
      "The complex is acyclic; homology does not witness noncollapsibility.",
      { certificateKind: kind },
    );
  }
  return {
    valid: true,
    certificateKind: kind,
    stepsVerified: 0,
    statesVerified: 0,
    transitionsVerified: 0,
  };
}

/** Verify a noncollapsibility certificate of either supported kind. */
export function verifyNonCollapsibilityCertificate(
  input: SimplicialCollapsibilityInput,
  certificate: unknown,
): CollapsibilityCertificateVerification {
  if (
    isRecord(certificate) &&
    certificate.kind === "nonzero-reduced-homology"
  ) {
    return verifyHomologyCertificate(input, certificate);
  }
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
  if (
    certificate.kind === "exhaustive-non-collapsibility" ||
    certificate.kind === "nonzero-reduced-homology"
  ) {
    return verifyNonCollapsibilityCertificate(input, certificate);
  }
  return invalidVerification("Unknown collapsibility certificate kind.");
}
