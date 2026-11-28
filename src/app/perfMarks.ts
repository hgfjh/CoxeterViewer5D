/**
 * Main-thread cost of named App derivations.
 *
 * Each `measure` call records a `performance.measure` entry (visible in the
 * browser profiler) and updates `window.__coxeterPerf`, which the timed
 * browser benchmark reads to attribute interaction latency to derivations
 * rather than to rendering.
 */
export interface PerfEntry {
  count: number;
  lastMs: number;
  totalMs: number;
  maxMs: number;
}

export type PerfSummary = Record<string, PerfEntry>;

const summary: PerfSummary = {};

if (typeof window !== "undefined") {
  (window as Window & { __coxeterPerf?: PerfSummary }).__coxeterPerf = summary;
}

export function measure<T>(name: string, run: () => T): T {
  const started = performance.now();
  try {
    return run();
  } finally {
    const elapsed = performance.now() - started;
    const entry = (summary[name] ??= {
      count: 0,
      lastMs: 0,
      totalMs: 0,
      maxMs: 0,
    });
    entry.count += 1;
    entry.lastMs = elapsed;
    entry.totalMs += elapsed;
    entry.maxMs = Math.max(entry.maxMs, elapsed);
    performance.measure?.(`coxeter:${name}`, {
      start: started,
      duration: elapsed,
    });
  }
}

/** Snapshot for tests and benchmarks; the live object is mutated in place. */
export function perfSummary(): PerfSummary {
  return structuredClone(summary);
}
