import { describe, expect, it } from "vitest";

import I2_5 from "../public/examples/I2_5.json";
import A3 from "../public/examples/A3.json";
import { parseCoxeterSystemInput } from "../src/coxeter";
import { generateViewerBall } from "../src/app/generationPipeline";
import { createGenerationClient } from "../src/app/generationClient";
import { createLocalViewCache } from "../src/app/localLayoutCache";
import { LruCache } from "../src/app/lruCache";
import {
  createPersistentCache,
  persistentCacheKeyFromMetadata,
  persistentCacheMetadataForNamespace,
  persistentCacheRegistry,
  persistentKeyString,
  type PersistentCache,
  type PersistentCacheKey,
} from "../src/app/persistentCache";
import {
  generationCacheKey,
  sceneAppearanceVersion,
  sceneStructureVersion,
  stableValueHash,
} from "../src/app/stableHash";
import { buildYGammaCellAtlas } from "../src/app/yGammaAtlas";
import { buildYGamma2SkeletonScene } from "../src/app/yGammaScene";
import { createYGammaSceneClient } from "../src/app/yGammaSceneClient";
import type { GeneratedCayleyBall } from "../src/types";

class ImmediateMemoryPersistentCache<T> implements PersistentCache<T> {
  private readonly values = new Map<string, T>();

  async get(key: PersistentCacheKey): Promise<T | undefined> {
    return this.values.get(JSON.stringify(key));
  }

  async set(key: PersistentCacheKey, value: T): Promise<void> {
    this.values.set(JSON.stringify(key), value);
  }

  async delete(key: PersistentCacheKey): Promise<void> {
    this.values.delete(JSON.stringify(key));
  }

  async clearNamespace(namespace: string): Promise<void> {
    for (const key of this.values.keys()) {
      if (key.includes(`"namespace":"${namespace}"`)) {
        this.values.delete(key);
      }
    }
  }
}

describe("performance data-pipeline helpers", () => {
  it("evicts least-recently-used entries deterministically", () => {
    const cache = new LruCache<string, number>({ maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.keys()).toEqual(["a", "c"]);
  });

  it("hashes values independent of object key insertion order", () => {
    expect(stableValueHash({ b: 2, a: [1, 2] })).toBe(
      stableValueHash({ a: [1, 2], b: 2 }),
    );
  });

  it("creates generation keys that change with radius and preserve scene key roles", () => {
    const system = parseCoxeterSystemInput(I2_5);
    const radiusFive = generationCacheKey({
      datasetId: "I2_5",
      system,
      options: { radius: 5, maxRadius: 6, maxNodes: 100, maxEdges: 200 },
    });
    const radiusFour = generationCacheKey({
      datasetId: "I2_5",
      system,
      options: { radius: 4, maxRadius: 6, maxNodes: 100, maxEdges: 200 },
    });
    expect(radiusFive).not.toBe(radiusFour);

    const structureA = sceneStructureVersion({
      nodes: [{ id: "e", length: 0, position: [0, 0, 0] }],
      edges: [],
      cells: [],
    });
    const structureB = sceneStructureVersion({
      nodes: [{ id: "e", length: 0, position: [1, 0, 0] }],
      edges: [],
      cells: [],
    });
    expect(structureA).not.toBe(structureB);
    expect(
      sceneAppearanceVersion({
        selectedNodeId: "e",
        selectedCellId: undefined,
        activeGeneratorPairKey: undefined,
        showCells: true,
        showNodeLabels: true,
        showEdgeLabels: true,
        labelScope: "focused",
        cellOpacity: 0.2,
        occlusionMode: "hide-far",
        topologyMode: false,
      }),
    ).not.toBe(
      sceneAppearanceVersion({
        selectedNodeId: "w:0",
        selectedCellId: undefined,
        activeGeneratorPairKey: undefined,
        showCells: true,
        showNodeLabels: true,
        showEdgeLabels: true,
        labelScope: "focused",
        cellOpacity: 0.2,
        occlusionMode: "hide-far",
        topologyMode: false,
      }),
    );
  });

  it("registers bounded cache metadata for topology, quotient, comparison, and benchmark caches", () => {
    const scopedNamespaces = [
      persistentCacheRegistry.topology,
      persistentCacheRegistry.quotient,
      persistentCacheRegistry.comparison,
      persistentCacheRegistry.benchmark,
    ];

    expect(scopedNamespaces.map((metadata) => metadata.scope)).toEqual([
      "topology",
      "quotient",
      "comparison",
      "benchmark",
    ]);
    expect(
      scopedNamespaces.every((metadata) => metadata.schemaVersion === 1),
    ).toBe(true);
    expect(
      persistentCacheMetadataForNamespace(
        persistentCacheRegistry.quotient.namespace,
      )?.valueKind,
    ).toBe("quotient-artifact");
  });

  it("builds persistent cache keys that invalidate on schema, input, and variant changes", () => {
    const metadata = persistentCacheRegistry.topology;
    const base = persistentCacheKeyFromMetadata({
      metadata,
      appVersion: "app-v1",
      inputHash: "structure-a",
      variant: "lens-generator-star",
    });

    expect(base).toMatchObject({
      namespace: "topology",
      schemaVersion: 1,
      appVersion: "app-v1",
      inputHash: "structure-a",
      variant: "lens-generator-star",
    });
    expect(
      persistentKeyString({
        ...base,
        schemaVersion: metadata.schemaVersion + 1,
      }),
    ).not.toBe(persistentKeyString(base));
    expect(persistentKeyString({ ...base, inputHash: "structure-b" })).not.toBe(
      persistentKeyString(base),
    );
    expect(
      persistentKeyString({ ...base, variant: "lens-cells-incident-edge" }),
    ).not.toBe(persistentKeyString(base));
  });

  it("keeps IndexedDB cache optional and validates cache-key metadata", async () => {
    const cache = createPersistentCache<{ value: number }>({
      databaseName: "coxeter-test-cache",
      storeName: "records",
    });
    const key: PersistentCacheKey = {
      namespace: "test",
      schemaVersion: 1,
      appVersion: "test",
      inputHash: "abc",
      variant: "default",
    };
    await cache.set(key, { value: 7 });
    expect(await cache.get(key)).toEqual({ value: 7 });
    expect(
      await cache.get({
        ...key,
        schemaVersion: 2,
      }),
    ).toBeUndefined();
  });

  it("reuses generated balls through the persistent generation client memory cache", async () => {
    const system = parseCoxeterSystemInput(I2_5);
    const client = createGenerationClient({
      canUseWorker: false,
      persistentCache: new ImmediateMemoryPersistentCache(),
    });
    const first = await client.generate({
      datasetId: "I2_5",
      system,
      options: { radius: 5, maxRadius: 6, maxNodes: 100, maxEdges: 200 },
    });
    const second = await client.generate({
      datasetId: "I2_5",
      system,
      options: { radius: 5, maxRadius: 6, maxNodes: 100, maxEdges: 200 },
    });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe("memory");
    expect(second.ball.nodes.length).toBe(first.ball.nodes.length);
    expect(second.ball.nodes.length).toBe(second.cacheMetadata?.nodeCount);
    expect(second.cacheMetadata).toMatchObject({
      kind: "generated-ball",
      radius: 5,
      inputHash: first.inputHash,
    });
    client.dispose();
  });

  it("caches local chamber layouts without changing layout data", () => {
    const system = parseCoxeterSystemInput(I2_5);
    const { ball } = generateViewerBall(system, {
      radius: 5,
      maxRadius: 6,
      maxNodes: 100,
      maxEdges: 200,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const cache = createLocalViewCache();
    const first = cache.localChamber3DLayout({
      ball,
      centerNodeId: "e",
      options: { depth: 2, generatorCount: system.rank },
    });
    const second = cache.localChamber3DLayout({
      ball,
      centerNodeId: "e",
      options: { depth: 2, generatorCount: system.rank },
    });

    expect(second).toBe(first);
    expect([...second.nodeIds].sort()).toEqual([...first.nodeIds].sort());
  });

  it("builds Y_Gamma scenes through the client fallback with sync parity", async () => {
    const system = parseCoxeterSystemInput(A3);
    const atlas = buildYGammaCellAtlas(system);
    const options = { faceMode: "all" as const, includeRankThreeCells: true };
    const expected = buildYGamma2SkeletonScene(atlas, options);
    const client = createYGammaSceneClient({
      canUseWorker: false,
      persistentCache: new ImmediateMemoryPersistentCache(),
    });
    const result = await client.build({ atlas, options });

    expect(result.cacheHit).toBe(false);
    expect(result.scene.nodes.length).toBe(expected.nodes.length);
    expect(result.scene.edges.length).toBe(expected.edges.length);
    expect(result.scene.cells.length).toBe(expected.cells.length);
    client.dispose();
  });

  it("returns cloned cached cell neighborhoods so callers cannot mutate the cache", () => {
    const system = parseCoxeterSystemInput(I2_5);
    const { ball } = generateViewerBall(system, {
      radius: 5,
      maxRadius: 6,
      maxNodes: 100,
      maxEdges: 200,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const cache = createLocalViewCache();
    const cell = ball.twoCells[0];
    const first = cache.cellNeighborhoodNodeIds({
      ball: ball as GeneratedCayleyBall,
      cell,
      mode: "cell-boundary",
    });
    first?.clear();
    const second = cache.cellNeighborhoodNodeIds({
      ball: ball as GeneratedCayleyBall,
      cell,
      mode: "cell-boundary",
    });

    expect(second?.size).toBe(cell.boundaryNodeIds.length);
  });
});
