import type {
  CayleyEdge,
  CayleyNode,
  CoxeterSystemInput,
  DavisTwoCell,
  GeneratedCayleyBall,
} from "../types";
import { LruCache } from "./lruCache";
import {
  cellNeighborhoodNodeIds,
  computeLocalChamber3DLayout,
  generatorStepOptions,
  type BreadcrumbEntry,
  type CellNeighborhoodMode,
  type GeneratorStepOption,
  type LocalChamber3DLayoutResult,
  type LocalLayoutOptions,
  wordBreadcrumb,
} from "./localView";
import { generatedBallIdentity, stableValueHash } from "./stableHash";

export interface LocalViewCacheOptions {
  layoutEntries?: number;
  neighborhoodEntries?: number;
  stepEntries?: number;
  breadcrumbEntries?: number;
}

export function createLocalViewCache(
  options: LocalViewCacheOptions = {},
): LocalViewCache {
  return new LocalViewCache(options);
}

export class LocalViewCache {
  private readonly layouts: LruCache<string, LocalChamber3DLayoutResult>;
  private readonly neighborhoods: LruCache<string, Set<string> | undefined>;
  private readonly steps: LruCache<string, GeneratorStepOption[]>;
  private readonly breadcrumbs: LruCache<string, BreadcrumbEntry[]>;

  constructor(options: LocalViewCacheOptions = {}) {
    this.layouts = new LruCache({ maxEntries: options.layoutEntries ?? 48 });
    this.neighborhoods = new LruCache({
      maxEntries: options.neighborhoodEntries ?? 80,
    });
    this.steps = new LruCache({ maxEntries: options.stepEntries ?? 80 });
    this.breadcrumbs = new LruCache({
      maxEntries: options.breadcrumbEntries ?? 80,
    });
  }

  localChamber3DLayout(input: {
    ball: GeneratedCayleyBall;
    centerNodeId: string;
    options: LocalLayoutOptions;
  }): LocalChamber3DLayoutResult {
    const key = stableValueHash({
      kind: "local-chamber-3d",
      ball: generatedBallIdentity(input.ball),
      centerNodeId: input.centerNodeId,
      options: input.options,
    });
    const cached = this.layouts.get(key);
    if (cached) {
      return cached;
    }
    const layout = computeLocalChamber3DLayout(
      input.ball.nodes,
      input.ball.edges,
      input.ball.twoCells,
      input.centerNodeId,
      input.options,
    );
    this.layouts.set(key, layout);
    return layout;
  }

  cellNeighborhoodNodeIds(input: {
    ball: GeneratedCayleyBall | undefined;
    cell: DavisTwoCell | undefined;
    mode: CellNeighborhoodMode;
  }): Set<string> | undefined {
    if (!input.ball) {
      return undefined;
    }
    const key = stableValueHash({
      kind: "cell-neighborhood",
      ball: generatedBallIdentity(input.ball),
      cellId: input.cell?.id,
      mode: input.mode,
    });
    if (this.neighborhoods.has(key)) {
      return cloneOptionalSet(this.neighborhoods.get(key));
    }
    const nodeIds = cellNeighborhoodNodeIds(
      input.ball.edges,
      input.cell,
      input.mode,
    );
    this.neighborhoods.set(key, cloneOptionalSet(nodeIds));
    return nodeIds;
  }

  generatorStepOptions(input: {
    edges: CayleyEdge[];
    selectedNodeId: string | undefined;
    generators: CoxeterSystemInput["generators"];
    ballIdentity: string;
  }): GeneratorStepOption[] {
    const key = stableValueHash({
      kind: "generator-steps",
      ball: input.ballIdentity,
      selectedNodeId: input.selectedNodeId,
      generatorCount: input.generators.length,
    });
    const cached = this.steps.get(key);
    if (cached) {
      return cached;
    }
    const steps = generatorStepOptions(
      input.edges,
      input.selectedNodeId,
      input.generators,
    );
    this.steps.set(key, steps);
    return steps;
  }

  wordBreadcrumb(input: {
    nodes: CayleyNode[];
    selectedNode: CayleyNode | undefined;
    generators: CoxeterSystemInput["generators"];
    ballIdentity: string;
  }): BreadcrumbEntry[] {
    const key = stableValueHash({
      kind: "word-breadcrumb",
      ball: input.ballIdentity,
      selectedWord: input.selectedNode?.word ?? [],
      generatorCount: input.generators.length,
    });
    const cached = this.breadcrumbs.get(key);
    if (cached) {
      return cached;
    }
    const entries = wordBreadcrumb(
      input.nodes,
      input.selectedNode,
      input.generators,
    );
    this.breadcrumbs.set(key, entries);
    return entries;
  }

  clear(): void {
    this.layouts.clear();
    this.neighborhoods.clear();
    this.steps.clear();
    this.breadcrumbs.clear();
  }
}

function cloneOptionalSet<T>(set: Set<T> | undefined): Set<T> | undefined {
  return set ? new Set(set) : undefined;
}
