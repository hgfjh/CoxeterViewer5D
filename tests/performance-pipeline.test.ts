import { describe, expect, it, vi } from "vitest";

import I2_5 from "../public/examples/I2_5.json";
import A3 from "../public/examples/A3.json";
import { parseCoxeterSystemInput } from "../src/coxeter";
import { enumerateSphericalSubsets } from "../src/davis";
import { generateViewerBall } from "../src/app/generationPipeline";
import { createGenerationClient } from "../src/app/generationClient";
import { createLocalViewCache } from "../src/app/localLayoutCache";
import { LruCache } from "../src/app/lruCache";
import {
  createPersistentCache,
  estimatePersistentCacheRecordBytes,
  estimatePersistentCacheValueBytes,
  planPersistentCacheEvictions,
  persistentCacheKeyFromMetadata,
  persistentCacheMetadataForNamespace,
  persistentCacheRegistry,
  persistentKeyString,
  type PersistentCache,
  type PersistentCacheKey,
  type PersistentCacheRecord,
} from "../src/app/persistentCache";
import {
  buildSceneRevisionSet,
  generationCacheKey,
  sceneAppearanceVersion,
  sceneStructureVersion,
  stableValueHash,
} from "../src/app/stableHash";
import { buildSceneTopologyIndex } from "../src/app/sceneTopologyIndex";
import { buildYGammaCellAtlas } from "../src/app/yGammaAtlas";
import { buildYGamma2SkeletonScene } from "../src/app/yGammaScene";
import { createYGammaSceneClient } from "../src/app/yGammaSceneClient";
import type { SceneCell, SceneEdge, SceneNode } from "../src/render/SceneView";
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

  it("tracks byte size through replacement, deletion, clear, and oversized values", () => {
    const cache = new LruCache<string, string>({
      maxEntries: 10,
      maxBytes: 5,
      sizeOf: (value) => value.length,
    });
    cache.set("a", "aa");
    cache.set("b", "bbb");
    expect(cache.byteSize).toBe(5);

    expect(cache.get("a")).toBe("aa");
    cache.set("a", "aaaa");
    expect(cache.keys()).toEqual(["a"]);
    expect(cache.byteSize).toBe(4);

    cache.set("c", "c");
    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("missing")).toBe(false);
    expect(cache.byteSize).toBe(1);
    cache.clear();
    expect(cache.byteSize).toBe(0);

    cache.set("too-large", "123456");
    expect(cache.size).toBe(0);
    expect(cache.byteSize).toBe(0);
  });

  it("estimates persistent records without serializing cycles or typed arrays", () => {
    const shared = { label: "shared" };
    const value: {
      payload: Uint8Array;
      first: typeof shared;
      second: typeof shared;
      self?: unknown;
    } = {
      payload: new Uint8Array(128),
      first: shared,
      second: shared,
    };
    value.self = value;
    const valueBytes = estimatePersistentCacheValueBytes(value);
    const record: PersistentCacheRecord<typeof value> = {
      key: "topology|v1|app|input|default",
      namespace: "topology",
      schemaVersion: 1,
      appVersion: "app",
      inputHash: "input",
      variant: "default",
      writtenAt: "2026-01-01T00:00:00.000Z",
      estimatedBytes: 0,
      value,
    };
    const recordBytes = estimatePersistentCacheRecordBytes(record);

    expect(Number.isFinite(valueBytes)).toBe(true);
    expect(valueBytes).toBeGreaterThan(128);
    expect(recordBytes).toBeGreaterThan(valueBytes);
  });

  it("plans deterministic oldest-first IndexedDB eviction", () => {
    const candidates = [
      {
        key: "b",
        writtenAt: "2026-01-01T00:00:00.000Z",
        estimatedBytes: 10,
      },
      {
        key: "c",
        writtenAt: "2026-01-02T00:00:00.000Z",
        estimatedBytes: 10,
      },
      {
        key: "a",
        writtenAt: "2026-01-01T00:00:00.000Z",
        estimatedBytes: 10,
      },
    ];

    expect(planPersistentCacheEvictions(candidates, 20)).toEqual(["a"]);
    expect(planPersistentCacheEvictions(candidates, 10)).toEqual(["a", "b"]);
    expect(planPersistentCacheEvictions(candidates, 30)).toEqual([]);
    expect(candidates.map((candidate) => candidate.key)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("applies the persistent cache memory byte budget without IndexedDB", async () => {
    vi.stubGlobal("indexedDB", undefined);
    try {
      const cache = createPersistentCache<{ payload: string }>({
        memoryEntries: 4,
        memoryBytes: 1,
        persistentBytes: 1024,
      });
      const key: PersistentCacheKey = {
        namespace: "test",
        schemaVersion: 1,
        appVersion: "test",
        inputHash: "memory-budget",
        variant: "default",
      };

      await cache.set(key, { payload: "larger than one byte" });
      expect(await cache.get(key)).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("separates scene topology, layout, cell geometry, labels, and appearance revisions", () => {
    const base = buildSceneRevisionSet({
      nodes: [
        { id: "e", length: 0, position: [0, 0, 0], label: "e" },
        { id: "s0", length: 1, position: [1, 0, 0], label: "s0" },
      ],
      edges: [
        {
          id: "e--0--s0",
          source: "e",
          target: "s0",
          generator: 0,
          compactLabel: "s0",
        },
      ],
      cells: [
        {
          id: "c:0-1",
          generatorPair: [0, 1],
          boundaryNodeIds: ["e", "s0"],
        },
      ],
      cellGeometryParts: ["separation:50"],
      appearanceParts: ["selected:e"],
      labelParts: ["labels:on"],
    });
    const moved = buildSceneRevisionSet({
      nodes: [
        { id: "e", length: 0, position: [0, 0, 0], label: "e" },
        { id: "s0", length: 1, position: [2, 0, 0], label: "s0" },
      ],
      edges: [
        {
          id: "e--0--s0",
          source: "e",
          target: "s0",
          generator: 0,
          compactLabel: "s0",
        },
      ],
      cells: [
        {
          id: "c:0-1",
          generatorPair: [0, 1],
          boundaryNodeIds: ["e", "s0"],
        },
      ],
      cellGeometryParts: ["separation:50"],
      appearanceParts: ["selected:e"],
      labelParts: ["labels:on"],
    });
    const relabeled = buildSceneRevisionSet({
      nodes: [
        { id: "e", length: 0, position: [0, 0, 0], label: "identity" },
        { id: "s0", length: 1, position: [1, 0, 0], label: "s0" },
      ],
      edges: [
        {
          id: "e--0--s0",
          source: "e",
          target: "s0",
          generator: 0,
          compactLabel: "g0",
        },
      ],
      cells: [
        {
          id: "c:0-1",
          generatorPair: [0, 1],
          boundaryNodeIds: ["e", "s0"],
        },
      ],
      cellGeometryParts: ["separation:50"],
      appearanceParts: ["selected:e"],
      labelParts: ["labels:on"],
    });
    const separated = buildSceneRevisionSet({
      nodes: [
        { id: "e", length: 0, position: [0, 0, 0], label: "e" },
        { id: "s0", length: 1, position: [1, 0, 0], label: "s0" },
      ],
      edges: [
        {
          id: "e--0--s0",
          source: "e",
          target: "s0",
          generator: 0,
          compactLabel: "s0",
        },
      ],
      cells: [
        {
          id: "c:0-1",
          generatorPair: [0, 1],
          boundaryNodeIds: ["e", "s0"],
        },
      ],
      cellGeometryParts: ["separation:100"],
      appearanceParts: ["selected:e"],
      labelParts: ["labels:on"],
    });
    const foldedCellInterior = buildSceneRevisionSet({
      nodes: [
        { id: "e", length: 0, position: [0, 0, 0], label: "e" },
        { id: "s0", length: 1, position: [1, 0, 0], label: "s0" },
      ],
      edges: [
        {
          id: "e--0--s0",
          source: "e",
          target: "s0",
          generator: 0,
          compactLabel: "s0",
        },
      ],
      cells: [
        {
          id: "c:0-1",
          generatorPair: [0, 1],
          boundaryNodeIds: ["e", "s0"],
          drawingInteriorPoint: [0.5, 0, 1],
          drawingInteriorRing: [
            [0.25, 0, 0.75],
            [0.75, 0, 0.75],
          ],
        },
      ],
      cellGeometryParts: ["separation:50"],
      appearanceParts: ["selected:e"],
      labelParts: ["labels:on"],
    });
    const activePairChanged = buildSceneRevisionSet({
      nodes: [
        { id: "e", length: 0, position: [0, 0, 0], label: "e" },
        { id: "s0", length: 1, position: [1, 0, 0], label: "s0" },
      ],
      edges: [
        {
          id: "e--0--s0",
          source: "e",
          target: "s0",
          generator: 0,
          compactLabel: "s0",
        },
      ],
      cells: [
        {
          id: "c:0-1",
          generatorPair: [0, 1],
          boundaryNodeIds: ["e", "s0"],
        },
      ],
      cellGeometryParts: ["separation:50", "active-pair:0-1"],
      appearanceParts: ["selected:e"],
      labelParts: ["labels:on"],
    });
    const edgeRenderChanged = buildSceneRevisionSet({
      nodes: [
        { id: "e", length: 0, position: [0, 0, 0], label: "e" },
        { id: "s0", length: 1, position: [1, 0, 0], label: "s0" },
      ],
      edges: [
        {
          id: "e--0--s0",
          source: "e",
          target: "s0",
          generator: 0,
          compactLabel: "s0",
          colorHint: "#ff0000",
          ghost: true,
          isRelationBoundary: true,
        },
      ],
      cells: [
        {
          id: "c:0-1",
          generatorPair: [0, 1],
          boundaryNodeIds: ["e", "s0"],
        },
      ],
      cellGeometryParts: ["separation:50"],
      appearanceParts: ["selected:e"],
      labelParts: ["labels:on"],
    });
    const gammaStateHighlightChanged = buildSceneRevisionSet({
      nodes: [
        {
          id: "e",
          length: 0,
          position: [0, 0, 0],
          label: "e",
          colorHint: "#2dd4bf",
          nodeScale: 1.9,
          stateRole: "in-state",
          alwaysLabel: true,
        },
        {
          id: "s0",
          length: 1,
          position: [1, 0, 0],
          label: "s0",
          colorHint: "#334155",
          nodeScale: 0.62,
          stateRole: "out-of-state",
          alwaysLabel: true,
        },
      ],
      edges: [
        {
          id: "e--0--s0",
          source: "e",
          target: "s0",
          generator: 0,
          compactLabel: "s0",
        },
      ],
      cells: [
        {
          id: "c:0-1",
          generatorPair: [0, 1],
          boundaryNodeIds: ["e", "s0"],
        },
      ],
      cellGeometryParts: ["separation:50"],
      appearanceParts: ["selected:e"],
      labelParts: ["labels:on"],
    });

    expect(moved.topologyVersion).toBe(base.topologyVersion);
    expect(moved.layoutVersion).not.toBe(base.layoutVersion);
    expect(relabeled.structureVersion).toBe(base.structureVersion);
    expect(relabeled.labelVersion).not.toBe(base.labelVersion);
    expect(separated.topologyVersion).toBe(base.topologyVersion);
    expect(separated.cellGeometryVersion).not.toBe(base.cellGeometryVersion);
    expect(foldedCellInterior.topologyVersion).toBe(base.topologyVersion);
    expect(foldedCellInterior.cellGeometryVersion).not.toBe(
      base.cellGeometryVersion,
    );
    expect(activePairChanged.cellGeometryVersion).not.toBe(
      base.cellGeometryVersion,
    );
    expect(edgeRenderChanged.topologyVersion).not.toBe(base.topologyVersion);
    expect(gammaStateHighlightChanged.layoutVersion).not.toBe(
      base.layoutVersion,
    );
    expect(gammaStateHighlightChanged.appearanceVersion).not.toBe(
      base.appearanceVersion,
    );
    expect(gammaStateHighlightChanged.labelVersion).not.toBe(base.labelVersion);
  });

  it("reuses scene-array fingerprints for selection-only revisions", () => {
    let nodeIdReads = 0;
    const nodes: SceneNode[] = [
      {
        get id() {
          nodeIdReads += 1;
          return "e";
        },
        length: 0,
        position: [0, 0, 0],
        label: "e",
      },
    ];
    const edges: SceneEdge[] = [];
    const cells: SceneCell[] = [];
    const first = buildSceneRevisionSet({
      nodes,
      edges,
      cells,
      appearanceParts: ["selected:e"],
      labelParts: ["selected:e"],
    });
    const readsAfterFirstFingerprint = nodeIdReads;
    const second = buildSceneRevisionSet({
      nodes,
      edges,
      cells,
      appearanceParts: ["selected:other"],
      labelParts: ["selected:other"],
    });

    expect(readsAfterFirstFingerprint).toBeGreaterThan(0);
    expect(nodeIdReads).toBe(readsAfterFirstFingerprint);
    expect(second.topologyVersion).toBe(first.topologyVersion);
    expect(second.layoutVersion).toBe(first.layoutVersion);
    expect(second.appearanceVersion).not.toBe(first.appearanceVersion);
    expect(second.labelVersion).not.toBe(first.labelVersion);
  });

  it("indexes scene topology without changing incidence", () => {
    const index = buildSceneTopologyIndex({
      nodes: [
        { id: "e", length: 0 },
        { id: "s0", length: 1 },
        { id: "s1", length: 1 },
      ],
      edges: [
        { id: "e--0--s0", source: "e", target: "s0", generator: 0 },
        { id: "e--1--s1", source: "e", target: "s1", generator: 1 },
      ],
      cells: [
        {
          id: "cell",
          generatorPair: [0, 1],
          boundaryNodeIds: ["e", "s0", "s1"],
        },
      ],
    });

    expect(
      index.edgesByNode
        .get("e")
        ?.map((edge) => edge.id)
        .sort(),
    ).toEqual(["e--0--s0", "e--1--s1"]);
    expect(index.edgesByGenerator.get(0)?.[0]?.id).toBe("e--0--s0");
    expect(index.cellsByPair.get("0-1")?.[0]?.id).toBe("cell");
    expect(index.cellsByNode.get("s0")?.[0]?.id).toBe("cell");
    expect(index.boundaryEdgeKeysByCell.get("cell")).toEqual([
      "e--s0",
      "s0--s1",
      "e--s1",
    ]);
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
    expect(second.sphericalSubsets).toBe(first.sphericalSubsets);
    expect(second.sphericalSubsets.subsets.length).toBeGreaterThan(0);
    expect(second.ball.nodes.length).toBe(second.cacheMetadata?.nodeCount);
    expect(second.cacheMetadata).toMatchObject({
      kind: "generated-ball",
      radius: 5,
      inputHash: first.inputHash,
    });
    client.dispose();
  });

  it("reuses spherical-subset enumeration for the same immutable system and options", () => {
    const system = parseCoxeterSystemInput(A3);
    const first = enumerateSphericalSubsets(system);
    const second = enumerateSphericalSubsets(system);
    const rankTwoOnly = enumerateSphericalSubsets(system, {
      maxRankForExhaustiveEnumeration: 2,
    });

    expect(second).toBe(first);
    expect(rankTwoOnly).not.toBe(first);
    expect(rankTwoOnly.subsets.every((subset) => subset.rank <= 2)).toBe(true);
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

  it("coalesces concurrent Y_Gamma requests for the same scene version", async () => {
    const system = parseCoxeterSystemInput(A3);
    const atlas = buildYGammaCellAtlas(system);
    const options = { faceMode: "all" as const, includeRankThreeCells: true };
    const client = createYGammaSceneClient({
      canUseWorker: false,
      persistentCache: new ImmediateMemoryPersistentCache(),
    });

    const [first, second] = await Promise.all([
      client.build({ atlas, options }),
      client.build({ atlas, options }),
    ]);

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe("inflight");
    expect(second.requestId).not.toBe(first.requestId);
    expect(second.scene).toBe(first.scene);
    client.dispose();
  });

  it("invalidates Y_Gamma scene cache when relation data changes under stable ids", () => {
    const system = parseCoxeterSystemInput(A3);
    const atlas = buildYGammaCellAtlas(system);
    const client = createYGammaSceneClient({
      canUseWorker: false,
      persistentCache: new ImmediateMemoryPersistentCache(),
    });
    const baseVersion = client.sceneVersionFor({
      atlas,
      options: { faceMode: "all", includeRankThreeCells: true },
    });
    const changedAtlas = {
      ...atlas,
      rankTwoCells: atlas.rankTwoCells.map((cell, index) =>
        index === 0
          ? {
              ...cell,
              m: (cell.m ?? 3) + 1,
              boundaryLength: (cell.boundaryLength ?? 6) + 2,
              attachingWord: [...cell.attachingWord, "changed"],
            }
          : cell,
      ),
    };
    const changedVersion = client.sceneVersionFor({
      atlas: changedAtlas,
      options: { faceMode: "all", includeRankThreeCells: true },
    });

    expect(changedVersion).not.toBe(baseVersion);
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
