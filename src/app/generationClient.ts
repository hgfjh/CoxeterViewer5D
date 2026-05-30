import type {
  CayleyGenerationOptions,
  CoxeterSystemInput,
  GeneratedCayleyBall,
} from "../types";
import { generateViewerBall } from "./generationPipeline";
import type {
  GenerationWorkerRequest,
  GenerationWorkerResponse,
} from "./generationWorkerTypes";
import { scheduleIdleTask } from "./idle";
import { LruCache } from "./lruCache";
import {
  createPersistentCache,
  persistentCacheKeyFromMetadata,
  persistentCacheRegistry,
  type PersistentCache,
  type PersistentCacheKey,
} from "./persistentCache";
import {
  generationCacheKey,
  hashCoxeterSystemForGeneration,
  stableHashString,
} from "./stableHash";

export type GenerationCacheHit = "memory" | "persistent" | false;

export interface GenerationClientResult {
  ball: GeneratedCayleyBall;
  generationMs?: number;
  requestId: number;
  cacheKey: string;
  inputHash: string;
  cacheHit: GenerationCacheHit;
  cacheMetadata?: CachedGeneratedBallMetadata;
}

export interface GenerationClientRequest {
  datasetId: string;
  system: CoxeterSystemInput;
  options: CayleyGenerationOptions;
}

export interface GenerationClientOptions {
  memoryEntries?: number;
  appVersion?: string;
  persistentCache?: PersistentCache<CachedGeneratedBall>;
  workerFactory?: () => Worker | undefined;
  canUseWorker?: boolean;
}

export interface CachedGeneratedBall {
  ball: GeneratedCayleyBall;
  generationMs?: number;
  cachedAt: string;
  cacheMetadata?: CachedGeneratedBallMetadata;
}

export interface CachedGeneratedBallMetadata {
  kind: "generated-ball";
  schemaVersion: number;
  cacheKey: string;
  inputHash: string;
  radius: number;
  requestedRadius?: number;
  nodeCount: number;
  edgeCount: number;
  cellCount: number;
}

interface PendingRequest {
  resolve: (result: GenerationClientResult) => void;
  reject: (error: Error) => void;
  cacheKey: string;
  inputHash: string;
  persistentKey: PersistentCacheKey;
  startedAt: number;
}

export const generatedBallCacheMetadata = persistentCacheRegistry.generatedBall;

/**
 * Factory for the long-lived generation client used by the app shell.
 */
export function createGenerationClient(
  options: GenerationClientOptions = {},
): GenerationClient {
  return new GenerationClient(options);
}

export class GenerationClient {
  private readonly memory: LruCache<string, CachedGeneratedBall>;
  private readonly persistentCache: PersistentCache<CachedGeneratedBall>;
  private readonly workerFactory: (() => Worker | undefined) | undefined;
  private readonly canUseWorker: boolean;
  private readonly appVersion: string;
  private worker: Worker | undefined;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly postedSystemHashes = new Set<string>();

  constructor(options: GenerationClientOptions = {}) {
    this.memory = new LruCache({ maxEntries: options.memoryEntries ?? 24 });
    this.persistentCache =
      options.persistentCache ??
      createPersistentCache<CachedGeneratedBall>({
        memoryEntries: options.memoryEntries ?? 24,
      });
    this.workerFactory = options.workerFactory;
    this.canUseWorker = options.canUseWorker ?? true;
    this.appVersion = options.appVersion ?? "app-v1";
  }

  async generate(
    request: GenerationClientRequest,
  ): Promise<GenerationClientResult> {
    const requestId = this.nextRequestId++;
    const inputHash = hashCoxeterSystemForGeneration(request.system);
    const cacheKey = generationCacheKey(request);
    const persistentKey = this.persistentKey(cacheKey, inputHash);
    const memoryHit = this.memory.get(cacheKey);
    if (memoryHit) {
      return {
        ball: memoryHit.ball,
        generationMs: memoryHit.generationMs,
        requestId,
        cacheKey,
        inputHash,
        cacheHit: "memory",
        cacheMetadata: memoryHit.cacheMetadata,
      };
    }

    const persistentHit = await this.persistentCache.get(persistentKey);
    if (persistentHit) {
      this.memory.set(cacheKey, persistentHit);
      return {
        ball: persistentHit.ball,
        generationMs: persistentHit.generationMs,
        requestId,
        cacheKey,
        inputHash,
        cacheHit: "persistent",
        cacheMetadata: persistentHit.cacheMetadata,
      };
    }

    if (!this.canUseWorker || typeof Worker === "undefined") {
      const startedAt = performanceNow();
      const { ball } = generateViewerBall(request.system, request.options);
      const generationMs = performanceNow() - startedAt;
      const cached = this.remember(cacheKey, persistentKey, {
        ball,
        generationMs,
      });
      return {
        ball,
        generationMs,
        requestId,
        cacheKey,
        inputHash,
        cacheHit: false,
        cacheMetadata: cached.cacheMetadata,
      };
    }

    const worker = this.ensureWorker();
    if (!worker) {
      const startedAt = performanceNow();
      const { ball } = generateViewerBall(request.system, request.options);
      const generationMs = performanceNow() - startedAt;
      const cached = this.remember(cacheKey, persistentKey, {
        ball,
        generationMs,
      });
      return {
        ball,
        generationMs,
        requestId,
        cacheKey,
        inputHash,
        cacheHit: false,
        cacheMetadata: cached.cacheMetadata,
      };
    }

    return new Promise<GenerationClientResult>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve,
        reject,
        cacheKey,
        inputHash,
        persistentKey,
        startedAt: performanceNow(),
      });

      const workerRequest: GenerationWorkerRequest = {
        type: "generate-ball",
        requestId,
        cacheKey,
        inputHash,
        // The worker keeps the most recent system per hash. Radius changes can
        // then post only options, which avoids cloning compact examples on
        // every slider or preset change.
        system: this.postedSystemHashes.has(inputHash)
          ? undefined
          : request.system,
        options: request.options,
      };
      worker.postMessage(workerRequest);
      this.postedSystemHashes.add(inputHash);
    });
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Generation worker was disposed."));
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = undefined;
  }

  private ensureWorker(): Worker | undefined {
    if (this.worker) {
      return this.worker;
    }

    const worker =
      this.workerFactory?.() ??
      new Worker(new URL("./generationWorker.ts", import.meta.url), {
        type: "module",
      });
    this.postedSystemHashes.clear();
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<GenerationWorkerResponse>) => {
      void this.handleWorkerMessage(event.data);
    };
    worker.onerror = (event) => {
      this.rejectAll(event.message || "Generation worker failed.");
      worker.terminate();
      if (this.worker === worker) {
        this.worker = undefined;
      }
      this.postedSystemHashes.clear();
    };
    return worker;
  }

  private async handleWorkerMessage(
    response: GenerationWorkerResponse,
  ): Promise<void> {
    const pending = this.pending.get(response.requestId);
    if (!pending) {
      // Stale worker replies are harmless: the UI may already have requested a
      // newer radius/example, so only the matching request id can resolve.
      return;
    }
    this.pending.delete(response.requestId);

    if (response.type === "generate-ball-failure") {
      pending.reject(new Error(response.error));
      return;
    }

    const generationMs =
      response.generationMs || performanceNow() - pending.startedAt;
    const cached = this.remember(pending.cacheKey, pending.persistentKey, {
      ball: response.ball,
      generationMs,
    });
    pending.resolve({
      ball: response.ball,
      generationMs,
      requestId: response.requestId,
      cacheKey: pending.cacheKey,
      inputHash: pending.inputHash,
      cacheHit: false,
      cacheMetadata: cached.cacheMetadata,
    });
  }

  private remember(
    cacheKey: string,
    persistentKey: PersistentCacheKey,
    value: { ball: GeneratedCayleyBall; generationMs?: number },
  ): CachedGeneratedBall {
    const cached: CachedGeneratedBall = {
      ...value,
      cachedAt: new Date().toISOString(),
      cacheMetadata: generatedBallCacheEntryMetadata(
        cacheKey,
        persistentKey.inputHash,
        value.ball,
      ),
    };
    this.memory.set(cacheKey, cached);
    scheduleIdleTask(() => {
      void this.persistentCache.set(persistentKey, cached);
    });
    return cached;
  }

  private rejectAll(message: string): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  private persistentKey(
    cacheKey: string,
    inputHash: string,
  ): PersistentCacheKey {
    return persistentCacheKeyFromMetadata({
      metadata: generatedBallCacheMetadata,
      appVersion: this.appVersion,
      inputHash,
      variant: stableHashString(cacheKey),
    });
  }
}

function generatedBallCacheEntryMetadata(
  cacheKey: string,
  inputHash: string,
  ball: GeneratedCayleyBall,
): CachedGeneratedBallMetadata {
  return {
    kind: "generated-ball",
    schemaVersion: generatedBallCacheMetadata.schemaVersion,
    cacheKey,
    inputHash,
    radius: ball.metadata.radius,
    requestedRadius: ball.metadata.requestedRadius,
    nodeCount: ball.nodes.length,
    edgeCount: ball.edges.length,
    cellCount: ball.twoCells.length + (ball.higherCells?.length ?? 0),
  };
}

function performanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
