import {
  buildYGamma2SkeletonScene,
  type YGamma2SkeletonScene,
} from "./yGammaScene";
import { scheduleIdleTask } from "./idle";
import type { YGammaCellAtlas } from "./yGammaAtlas";
import type {
  YGammaSceneWorkerRequest,
  YGammaSceneWorkerResponse,
} from "./yGammaSceneWorkerTypes";
import { LruCache } from "./lruCache";
import {
  createPersistentCache,
  type PersistentCache,
  type PersistentCacheKey,
} from "./persistentCache";
import {
  stableHashString,
  yGammaAtlasVersion,
  yGammaSceneVersion,
} from "./stableHash";
import type { YGamma2SkeletonSceneOptions } from "./yGammaScene";

export interface YGammaSceneClientOptions {
  memoryEntries?: number;
  appVersion?: string;
  persistentCache?: PersistentCache<CachedYGammaScene>;
  workerFactory?: () => Worker | undefined;
  canUseWorker?: boolean;
}

export interface CachedYGammaScene {
  scene: YGamma2SkeletonScene;
  buildMs?: number;
  cachedAt: string;
}

export interface YGammaSceneClientRequest {
  atlas: YGammaCellAtlas;
  options: YGamma2SkeletonSceneOptions;
}

export interface YGammaSceneClientResult {
  scene: YGamma2SkeletonScene;
  requestId: number;
  sceneVersion: string;
  buildMs?: number;
  cacheHit: "memory" | "persistent" | false;
}

interface PendingRequest {
  resolve: (result: YGammaSceneClientResult) => void;
  reject: (error: Error) => void;
  sceneVersion: string;
  persistentKey: PersistentCacheKey;
  startedAt: number;
}

const yGammaSceneSchemaVersion = 2;
const yGammaSceneNamespace = "ygamma-scene";
const yGammaSceneBuilderVersion = "relation-face-lift-v2";

/**
 * Factory for the off-main-thread Y_Gamma scene builder.
 */
export function createYGammaSceneClient(
  options: YGammaSceneClientOptions = {},
): YGammaSceneClient {
  return new YGammaSceneClient(options);
}

export class YGammaSceneClient {
  private readonly memory: LruCache<string, CachedYGammaScene>;
  private readonly persistentCache: PersistentCache<CachedYGammaScene>;
  private readonly workerFactory: (() => Worker | undefined) | undefined;
  private readonly canUseWorker: boolean;
  private readonly appVersion: string;
  private readonly pending = new Map<number, PendingRequest>();
  private worker: Worker | undefined;
  private nextRequestId = 1;

  constructor(options: YGammaSceneClientOptions = {}) {
    this.memory = new LruCache({ maxEntries: options.memoryEntries ?? 24 });
    this.persistentCache =
      options.persistentCache ??
      createPersistentCache<CachedYGammaScene>({
        memoryEntries: options.memoryEntries ?? 24,
      });
    this.workerFactory = options.workerFactory;
    this.canUseWorker = options.canUseWorker ?? true;
    this.appVersion = options.appVersion ?? "app-v1";
  }

  sceneVersionFor(request: YGammaSceneClientRequest): string {
    const atlasVersion = yGammaAtlasVersion({
      systemName: request.atlas.systemName,
      generatorCount: request.atlas.generatorCount,
      rankTwoCellIds: request.atlas.rankTwoCells.map((cell) => cell.id),
      higherCellIds: request.atlas.higherCells.map((cell) => cell.id),
      warnings: request.atlas.warnings,
    });
    return yGammaSceneVersion({
      atlasVersion,
      builderVersion: yGammaSceneBuilderVersion,
      options: request.options,
    });
  }

  async build(
    request: YGammaSceneClientRequest,
  ): Promise<YGammaSceneClientResult> {
    const requestId = this.nextRequestId++;
    const sceneVersion = this.sceneVersionFor(request);
    const persistentKey = this.persistentKey(sceneVersion);
    const memoryHit = this.memory.get(sceneVersion);
    if (memoryHit) {
      return {
        scene: memoryHit.scene,
        requestId,
        sceneVersion,
        buildMs: memoryHit.buildMs,
        cacheHit: "memory",
      };
    }

    const persistentHit = await this.persistentCache.get(persistentKey);
    if (persistentHit) {
      this.memory.set(sceneVersion, persistentHit);
      return {
        scene: persistentHit.scene,
        requestId,
        sceneVersion,
        buildMs: persistentHit.buildMs,
        cacheHit: "persistent",
      };
    }

    if (!this.canUseWorker || typeof Worker === "undefined") {
      const startedAt = performanceNow();
      const scene = buildYGamma2SkeletonScene(request.atlas, request.options);
      const buildMs = performanceNow() - startedAt;
      this.remember(sceneVersion, persistentKey, { scene, buildMs });
      return { scene, requestId, sceneVersion, buildMs, cacheHit: false };
    }

    const worker = this.ensureWorker();
    if (!worker) {
      const startedAt = performanceNow();
      const scene = buildYGamma2SkeletonScene(request.atlas, request.options);
      const buildMs = performanceNow() - startedAt;
      this.remember(sceneVersion, persistentKey, { scene, buildMs });
      return { scene, requestId, sceneVersion, buildMs, cacheHit: false };
    }

    return new Promise<YGammaSceneClientResult>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve,
        reject,
        sceneVersion,
        persistentKey,
        startedAt: performanceNow(),
      });
      const workerRequest: YGammaSceneWorkerRequest = {
        type: "build-ygamma-scene",
        requestId,
        sceneVersion,
        atlas: request.atlas,
        options: request.options,
      };
      worker.postMessage(workerRequest);
    });
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Y_Gamma scene worker was disposed."));
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
      new Worker(new URL("./yGammaSceneWorker.ts", import.meta.url), {
        type: "module",
      });
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<YGammaSceneWorkerResponse>) => {
      void this.handleWorkerMessage(event.data);
    };
    worker.onerror = (event) => {
      this.rejectAll(event.message || "Y_Gamma scene worker failed.");
      worker.terminate();
      if (this.worker === worker) {
        this.worker = undefined;
      }
    };
    return worker;
  }

  private async handleWorkerMessage(
    response: YGammaSceneWorkerResponse,
  ): Promise<void> {
    const pending = this.pending.get(response.requestId);
    if (!pending) {
      // A newer lens/preset may already have replaced this request.
      return;
    }
    this.pending.delete(response.requestId);

    if (response.type === "build-ygamma-scene-failure") {
      pending.reject(new Error(response.error));
      return;
    }

    const buildMs = response.buildMs || performanceNow() - pending.startedAt;
    this.remember(pending.sceneVersion, pending.persistentKey, {
      scene: response.scene,
      buildMs,
    });
    pending.resolve({
      scene: response.scene,
      requestId: response.requestId,
      sceneVersion: response.sceneVersion,
      buildMs,
      cacheHit: false,
    });
  }

  private remember(
    sceneVersion: string,
    persistentKey: PersistentCacheKey,
    value: { scene: YGamma2SkeletonScene; buildMs?: number },
  ): void {
    const cached: CachedYGammaScene = {
      ...value,
      cachedAt: new Date().toISOString(),
    };
    this.memory.set(sceneVersion, cached);
    scheduleIdleTask(() => {
      void this.persistentCache.set(persistentKey, cached);
    });
  }

  private rejectAll(message: string): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  private persistentKey(sceneVersion: string): PersistentCacheKey {
    return {
      namespace: yGammaSceneNamespace,
      schemaVersion: yGammaSceneSchemaVersion,
      appVersion: this.appVersion,
      inputHash: sceneVersion,
      variant: stableHashString(sceneVersion),
    };
  }
}

function performanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
