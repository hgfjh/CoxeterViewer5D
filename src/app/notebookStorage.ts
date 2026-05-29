import type {
  ExperimentBundle,
  ExperimentComparison,
  ExperimentRun,
} from "./experiments";
import { compareExperimentRuns, createExperimentBundle } from "./experiments";

export type NotebookRun = ExperimentRun;
export type NotebookBundle = ExperimentBundle;
export type NotebookComparison = ExperimentComparison;

const dbName = "coxeter-viewer-notebook";
const dbVersion = 1;
const storeName = "state";
const storageKey = "coxeter-viewer:experiment-bundles";
const allBundlesKey = "bundles";

export function readNotebookBundlesSync(): NotebookBundle[] {
  return parseNotebookBundlesFromText(
    typeof window === "undefined"
      ? undefined
      : (window.localStorage?.getItem(storageKey) ?? undefined),
  );
}

export async function readNotebookBundles(): Promise<NotebookBundle[]> {
  const fromIndexedDb = await readIndexedDbBundles();
  if (fromIndexedDb.length > 0) {
    return fromIndexedDb;
  }
  return readNotebookBundlesSync();
}

export async function writeNotebookBundles(
  bundles: NotebookBundle[],
): Promise<void> {
  const normalized = normalizeNotebookBundles(bundles);
  if (typeof window !== "undefined") {
    window.localStorage?.setItem(storageKey, JSON.stringify(normalized));
  }
  await writeIndexedDbBundles(normalized);
}

export function parseNotebookBundles(input: unknown): NotebookBundle[] {
  if (!Array.isArray(input)) {
    throw new Error("Notebook import must be an array of experiment bundles.");
  }
  return normalizeNotebookBundles(input as NotebookBundle[]);
}

export function duplicateNotebookBundle(
  bundle: NotebookBundle,
  createdAt = "1970-01-01T00:00:00.000Z",
): NotebookBundle {
  return createExperimentBundle({
    label: `${bundle.label} copy`,
    createdAt,
    runs: bundle.runs.map((run) => ({
      label: `${run.label} copy`,
      dataset: run.dataset,
      view: run.view,
      render: run.render,
      topology: run.topology,
      counts: run.counts,
      warnings: run.warnings,
      notes: run.notes,
      status: run.status,
    })),
    notes: bundle.notes,
  });
}

export function compareLatestNotebookRuns(
  bundles: NotebookBundle[],
): NotebookComparison | undefined {
  const runs = bundles.flatMap((bundle) => bundle.runs);
  if (runs.length < 2) {
    return undefined;
  }
  return compareExperimentRuns(runs[1], runs[0]);
}

function parseNotebookBundlesFromText(
  text: string | undefined,
): NotebookBundle[] {
  if (!text) {
    return [];
  }
  try {
    return parseNotebookBundles(JSON.parse(text) as unknown);
  } catch {
    return [];
  }
}

function normalizeNotebookBundles(bundles: NotebookBundle[]): NotebookBundle[] {
  return bundles
    .filter(
      (bundle) => bundle?.schemaVersion === 1 && Array.isArray(bundle.runs),
    )
    .map((bundle) => ({
      ...bundle,
      runs: [...bundle.runs],
      notes: [...(bundle.notes ?? [])],
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function openNotebookDb(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") {
    return undefined;
  }
  return new Promise((resolve) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName);
    };
    request.onerror = () => resolve(undefined);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readIndexedDbBundles(): Promise<NotebookBundle[]> {
  const db = await openNotebookDb();
  if (!db) {
    return [];
  }
  return new Promise((resolve) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(allBundlesKey);
    request.onerror = () => resolve([]);
    request.onsuccess = () =>
      resolve(
        Array.isArray(request.result)
          ? normalizeNotebookBundles(request.result as NotebookBundle[])
          : [],
      );
  });
}

async function writeIndexedDbBundles(bundles: NotebookBundle[]): Promise<void> {
  const db = await openNotebookDb();
  if (!db) {
    return;
  }
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(bundles, allBundlesKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}
