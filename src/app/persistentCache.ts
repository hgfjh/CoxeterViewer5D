import { LruCache } from "./lruCache";

export type PersistentCacheScope =
  | "generation"
  | "topology"
  | "quotient"
  | "comparison"
  | "benchmark";

export type PersistentCacheNamespace =
  | "generated-ball"
  | "ygamma-scene"
  | "topology"
  | "quotient"
  | "comparison"
  | "benchmark"
  | (string & {});

export interface PersistentCacheMetadata {
  namespace: PersistentCacheNamespace;
  scope: PersistentCacheScope;
  schemaVersion: number;
  valueKind: string;
  description: string;
}

export type PersistentCacheRegistry = typeof persistentCacheRegistry;
export type PersistentCacheRegistryKey = keyof PersistentCacheRegistry;

export const persistentCacheRegistry = {
  generatedBall: {
    namespace: "generated-ball",
    scope: "generation",
    schemaVersion: 1,
    valueKind: "generated-cayley-ball",
    description:
      "Finite-radius Cayley balls produced by the generation client.",
  },
  yGammaScene: {
    namespace: "ygamma-scene",
    scope: "topology",
    schemaVersion: 1,
    valueKind: "ygamma-scene",
    description: "Derived Y_Gamma 2-skeleton scene payloads.",
  },
  topology: {
    namespace: "topology",
    scope: "topology",
    schemaVersion: 1,
    valueKind: "topology-lens",
    description:
      "Local topology lens summaries, stars, links, and cell-neighborhood views.",
  },
  quotient: {
    namespace: "quotient",
    scope: "quotient",
    schemaVersion: 1,
    valueKind: "quotient-artifact",
    description:
      "Validated quotient complexes and progressive quotient loading chunks.",
  },
  comparison: {
    namespace: "comparison",
    scope: "comparison",
    schemaVersion: 1,
    valueKind: "comparison-summary",
    description:
      "Backend, notebook, and experiment comparison summaries keyed by inputs.",
  },
  benchmark: {
    namespace: "benchmark",
    scope: "benchmark",
    schemaVersion: 1,
    valueKind: "timed-benchmark",
    description:
      "Timed benchmark case and interaction summaries for performance budgets.",
  },
} as const satisfies Record<string, PersistentCacheMetadata>;

export interface PersistentCacheKeyInput {
  metadata: PersistentCacheMetadata;
  appVersion: string;
  inputHash: string;
  variant: string;
}

export interface TopologyCacheEntryMetadata {
  kind: "topology";
  lensId: string;
  structureVersion: string;
  selectedNodeId?: string;
  selectedCellId?: string;
}

export interface QuotientCacheEntryMetadata {
  kind: "quotient";
  quotientHash: string;
  sourceSystemHash?: string;
  chunkId?: string;
  repairedImport?: boolean;
}

export interface ComparisonCacheEntryMetadata {
  kind: "comparison";
  comparisonId: string;
  leftHash: string;
  rightHash: string;
}

export interface BenchmarkCacheEntryMetadata {
  kind: "benchmark";
  benchmarkId: string;
  caseId: string;
  scriptVersion: string;
}

export interface PersistentCacheKey {
  namespace: PersistentCacheNamespace;
  schemaVersion: number;
  appVersion: string;
  inputHash: string;
  variant: string;
}

export interface PersistentCacheRecord<T> {
  key: string;
  namespace: string;
  schemaVersion: number;
  appVersion: string;
  inputHash: string;
  variant: string;
  writtenAt: string;
  value: T;
}

export interface PersistentCacheOptions {
  databaseName?: string;
  storeName?: string;
  memoryEntries?: number;
}

export interface PersistentCache<T> {
  get(key: PersistentCacheKey): Promise<T | undefined>;
  set(key: PersistentCacheKey, value: T): Promise<void>;
  delete(key: PersistentCacheKey): Promise<void>;
  clearNamespace(namespace: string): Promise<void>;
}

const defaultDatabaseName = "coxeter-viewer-performance-cache";
const defaultStoreName = "records";

/**
 * Builds the IndexedDB key. Namespace, schema, app version, input hash, and
 * variant all participate so stale mathematical data is missed rather than
 * silently reused after a migration or source edit.
 */
export function persistentKeyString(key: PersistentCacheKey): string {
  return [
    key.namespace,
    `v${key.schemaVersion}`,
    key.appVersion,
    key.inputHash,
    key.variant,
  ].join("|");
}

export function persistentCacheKeyFromMetadata(
  input: PersistentCacheKeyInput,
): PersistentCacheKey {
  return {
    namespace: input.metadata.namespace,
    schemaVersion: input.metadata.schemaVersion,
    appVersion: input.appVersion,
    inputHash: input.inputHash,
    variant: input.variant,
  };
}

export function persistentCacheMetadataForNamespace(
  namespace: PersistentCacheNamespace,
): PersistentCacheMetadata | undefined {
  return Object.values(persistentCacheRegistry).find(
    (metadata) => metadata.namespace === namespace,
  );
}

/**
 * IndexedDB-backed cache with an in-memory LRU fallback.
 *
 * Cache hits are performance hints only. Generated JSON, certificates, and
 * experiment bundles still carry their own hashes and validation status.
 */
export function createPersistentCache<T>(
  options: PersistentCacheOptions = {},
): PersistentCache<T> {
  return new IndexedDbBackedCache<T>(options);
}

class IndexedDbBackedCache<T> implements PersistentCache<T> {
  private readonly memory: LruCache<string, PersistentCacheRecord<T>>;
  private readonly databaseName: string;
  private readonly storeName: string;
  private openPromise: Promise<IDBDatabase | undefined> | undefined;

  constructor(options: PersistentCacheOptions) {
    this.memory = new LruCache({
      maxEntries: options.memoryEntries ?? 64,
    });
    this.databaseName = options.databaseName ?? defaultDatabaseName;
    this.storeName = options.storeName ?? defaultStoreName;
  }

  async get(key: PersistentCacheKey): Promise<T | undefined> {
    const keyString = persistentKeyString(key);
    const memoryRecord = this.memory.get(keyString);
    if (memoryRecord && recordMatches(memoryRecord, key)) {
      return memoryRecord.value;
    }

    const database = await this.openDatabase();
    if (!database) {
      return undefined;
    }

    const record = await readRecord<T>(database, this.storeName, keyString);
    if (!record || !recordMatches(record, key)) {
      return undefined;
    }
    this.memory.set(keyString, record);
    return record.value;
  }

  async set(key: PersistentCacheKey, value: T): Promise<void> {
    const keyString = persistentKeyString(key);
    const record: PersistentCacheRecord<T> = {
      key: keyString,
      namespace: key.namespace,
      schemaVersion: key.schemaVersion,
      appVersion: key.appVersion,
      inputHash: key.inputHash,
      variant: key.variant,
      writtenAt: new Date().toISOString(),
      value,
    };
    this.memory.set(keyString, record);

    const database = await this.openDatabase();
    if (!database) {
      return;
    }
    await writeRecord(database, this.storeName, record);
  }

  async delete(key: PersistentCacheKey): Promise<void> {
    const keyString = persistentKeyString(key);
    this.memory.delete(keyString);

    const database = await this.openDatabase();
    if (!database) {
      return;
    }
    await deleteRecord(database, this.storeName, keyString);
  }

  async clearNamespace(namespace: string): Promise<void> {
    for (const [key, record] of this.memory.entries()) {
      if (record.namespace === namespace) {
        this.memory.delete(key);
      }
    }

    const database = await this.openDatabase();
    if (!database) {
      return;
    }
    await clearNamespaceRecords(database, this.storeName, namespace);
  }

  private openDatabase(): Promise<IDBDatabase | undefined> {
    if (this.openPromise) {
      return this.openPromise;
    }
    this.openPromise = openIndexedDb(this.databaseName, this.storeName);
    return this.openPromise;
  }
}

function recordMatches<T>(
  record: PersistentCacheRecord<T>,
  key: PersistentCacheKey,
): boolean {
  return (
    record.namespace === key.namespace &&
    record.schemaVersion === key.schemaVersion &&
    record.appVersion === key.appVersion &&
    record.inputHash === key.inputHash &&
    record.variant === key.variant
  );
}

function openIndexedDb(
  databaseName: string,
  storeName: string,
): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "key" });
      }
    };
    request.onerror = () => resolve(undefined);
    request.onsuccess = () => resolve(request.result);
  });
}

function readRecord<T>(
  database: IDBDatabase,
  storeName: string,
  key: string,
): Promise<PersistentCacheRecord<T> | undefined> {
  return new Promise((resolve) => {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onerror = () => resolve(undefined);
    request.onsuccess = () =>
      resolve(request.result as PersistentCacheRecord<T> | undefined);
  });
}

function writeRecord<T>(
  database: IDBDatabase,
  storeName: string,
  record: PersistentCacheRecord<T>,
): Promise<void> {
  return new Promise((resolve) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.objectStore(storeName).put(record);
  });
}

function deleteRecord(
  database: IDBDatabase,
  storeName: string,
  key: string,
): Promise<void> {
  return new Promise((resolve) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.objectStore(storeName).delete(key);
  });
}

function clearNamespaceRecords(
  database: IDBDatabase,
  storeName: string,
  namespace: string,
): Promise<void> {
  return new Promise((resolve) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.openCursor();
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      const record = cursor.value as PersistentCacheRecord<unknown>;
      if (record.namespace === namespace) {
        cursor.delete();
      }
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
  });
}
