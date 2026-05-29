import type { GeneratedCayleyBall } from "../types";
import type { TopologyDiagnosticSummary } from "../topology";

export type ExperimentStatus = "passed" | "warning" | "failed" | "unknown";

export interface ExperimentNote {
  id: string;
  level: "info" | "warning" | "error";
  message: string;
  source?: string;
}

export interface ExperimentCounts {
  nodes?: number;
  edges?: number;
  rankTwoCells?: number;
  higherCells?: number;
  warnings?: number;
  topologyWarnings?: number;
  missingFlagSimplices?: number;
}

export interface ExperimentRun {
  id: string;
  label: string;
  createdAt: string;
  status: ExperimentStatus;
  dataset: unknown;
  view: unknown;
  render: unknown;
  topology: unknown;
  counts: ExperimentCounts;
  warnings: string[];
  notes: ExperimentNote[];
}

export interface ExperimentBundle {
  schemaVersion: 1;
  id: string;
  label: string;
  createdAt: string;
  runs: ExperimentRun[];
  notes: ExperimentNote[];
  summary: {
    runCount: number;
    statusCounts: Record<ExperimentStatus, number>;
    warnings: string[];
  };
}

export interface ExperimentComparison {
  baselineRunId: string;
  candidateRunId: string;
  statusChanged: boolean;
  countDeltas: Partial<Record<keyof ExperimentCounts, number>>;
  addedWarnings: string[];
  removedWarnings: string[];
  unchangedWarnings: string[];
}

export interface ExperimentRunInput {
  id?: string;
  label?: string;
  createdAt?: string;
  status?: ExperimentStatus;
  dataset: unknown;
  view: unknown;
  render: unknown;
  topology?: TopologyDiagnosticSummary | unknown;
  ball?: GeneratedCayleyBall;
  counts?: ExperimentCounts;
  warnings?: string[];
  notes?: Array<Omit<ExperimentNote, "id"> & { id?: string }>;
}

export interface ExperimentBundleInput {
  id?: string;
  label?: string;
  createdAt?: string;
  runs: ExperimentRunInput[];
  notes?: Array<Omit<ExperimentNote, "id"> & { id?: string }>;
}

const deterministicTimestamp = "1970-01-01T00:00:00.000Z";

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableNormalize(entry)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableNormalize(value));
}

function stableHash(value: unknown): string {
  let hash = 0x811c9dc5;
  const text = stableJson(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizeNotes(
  notes: Array<Omit<ExperimentNote, "id"> & { id?: string }> = [],
): ExperimentNote[] {
  return notes
    .map((note, index) => ({
      ...note,
      id:
        note.id ??
        `note:${stableHash({
          index,
          level: note.level,
          message: note.message,
          source: note.source,
        })}`,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function countsFromBall(
  ball: GeneratedCayleyBall | undefined,
): ExperimentCounts {
  if (ball === undefined) {
    return {};
  }
  return {
    nodes: ball.nodes.length,
    edges: ball.edges.length,
    rankTwoCells: ball.twoCells.length,
    higherCells: ball.higherCells?.length ?? 0,
    warnings: ball.metadata.warnings.length,
  };
}

function countsFromTopology(topology: unknown): ExperimentCounts {
  const summary = topology as Partial<TopologyDiagnosticSummary> | undefined;
  if (summary?.linkCondition === undefined) {
    return {};
  }
  return {
    topologyWarnings: summary.warnings?.length ?? 0,
    missingFlagSimplices:
      summary.linkCondition.missingFlagSimplices?.length ?? 0,
  };
}

function statusFromInputs(input: {
  status?: ExperimentStatus;
  warnings: string[];
  notes: ExperimentNote[];
  topology?: unknown;
}): ExperimentStatus {
  if (input.status !== undefined) {
    return input.status;
  }
  if (input.notes.some((note) => note.level === "error")) {
    return "failed";
  }
  const topology = input.topology as
    | Partial<TopologyDiagnosticSummary>
    | undefined;
  if (topology?.linkCondition?.status === "fails") {
    return "failed";
  }
  if (
    input.warnings.length > 0 ||
    input.notes.some((note) => note.level === "warning") ||
    topology?.linkCondition?.status === "not-checked"
  ) {
    return "warning";
  }
  return "passed";
}

export function createExperimentRun(input: ExperimentRunInput): ExperimentRun {
  const notes = normalizeNotes(input.notes);
  const warnings = uniqueSorted([
    ...(input.warnings ?? []),
    ...(input.ball?.metadata.warnings ?? []),
    ...notes
      .filter((note) => note.level === "warning" || note.level === "error")
      .map((note) => note.message),
  ]);
  const counts = {
    ...countsFromBall(input.ball),
    ...countsFromTopology(input.topology),
    ...input.counts,
  };
  const createdAt = input.createdAt ?? deterministicTimestamp;
  const snapshot = {
    dataset: input.dataset,
    view: input.view,
    render: input.render,
    topology: input.topology,
    counts,
    warnings,
    notes,
    createdAt,
  };

  return {
    id: input.id ?? `run:${stableHash(snapshot)}`,
    label: input.label ?? "Experiment run",
    createdAt,
    status: statusFromInputs({
      status: input.status,
      warnings,
      notes,
      topology: input.topology,
    }),
    dataset: stableNormalize(input.dataset),
    view: stableNormalize(input.view),
    render: stableNormalize(input.render),
    topology: stableNormalize(input.topology),
    counts,
    warnings,
    notes,
  };
}

export function createExperimentBundle(
  input: ExperimentBundleInput,
): ExperimentBundle {
  const createdAt = input.createdAt ?? deterministicTimestamp;
  const runs = input.runs
    .map((run) =>
      createExperimentRun({ ...run, createdAt: run.createdAt ?? createdAt }),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const notes = normalizeNotes(input.notes);
  const statusCounts: Record<ExperimentStatus, number> = {
    passed: 0,
    warning: 0,
    failed: 0,
    unknown: 0,
  };
  for (const run of runs) {
    statusCounts[run.status] += 1;
  }

  const warnings = uniqueSorted([
    ...runs.flatMap((run) => run.warnings),
    ...notes
      .filter((note) => note.level === "warning" || note.level === "error")
      .map((note) => note.message),
  ]);
  const snapshot = {
    label: input.label,
    createdAt,
    runs,
    notes,
  };

  return {
    schemaVersion: 1,
    id: input.id ?? `bundle:${stableHash(snapshot)}`,
    label: input.label ?? "Experiment bundle",
    createdAt,
    runs,
    notes,
    summary: {
      runCount: runs.length,
      statusCounts,
      warnings,
    },
  };
}

export function compareExperimentRuns(
  baseline: ExperimentRun,
  candidate: ExperimentRun,
): ExperimentComparison {
  const countKeys = uniqueSorted([
    ...Object.keys(baseline.counts),
    ...Object.keys(candidate.counts),
  ]) as Array<keyof ExperimentCounts>;
  const countDeltas: Partial<Record<keyof ExperimentCounts, number>> = {};
  for (const key of countKeys) {
    const delta = (candidate.counts[key] ?? 0) - (baseline.counts[key] ?? 0);
    if (delta !== 0) {
      countDeltas[key] = delta;
    }
  }

  const baselineWarnings = new Set(baseline.warnings);
  const candidateWarnings = new Set(candidate.warnings);
  return {
    baselineRunId: baseline.id,
    candidateRunId: candidate.id,
    statusChanged: baseline.status !== candidate.status,
    countDeltas,
    addedWarnings: [...candidateWarnings]
      .filter((warning) => !baselineWarnings.has(warning))
      .sort(),
    removedWarnings: [...baselineWarnings]
      .filter((warning) => !candidateWarnings.has(warning))
      .sort(),
    unchangedWarnings: [...candidateWarnings]
      .filter((warning) => baselineWarnings.has(warning))
      .sort(),
  };
}
