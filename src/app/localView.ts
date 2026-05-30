import type {
  CayleyEdge,
  CayleyNode,
  CoxeterSystemInput,
  DavisTwoCell,
  GeneratedCayleyBall,
  HyperbolicProjection,
} from "../types";

export type ViewPresetId =
  | "global"
  | "local-chamber"
  | "rank-two-cells"
  | "geometric-projection";

export type LabelScope = "off" | "focused" | "budgeted";
export type LocalViewLayout =
  | "local-chamber-3d"
  | "global-shell"
  | "geometric-projection";
export type LocalCellRenderMode =
  | "in-graph"
  | "lifted-panels"
  | "petals"
  | "outline-only";
export type CellFocusMode =
  | "all-local"
  | "incident-selected"
  | "selected-pair"
  | "selected-cell";
export type CellNeighborhoodMode =
  | "chamber"
  | "cell-boundary"
  | "cell-plus-1"
  | "cell-plus-2";
export type RelationWalkMode = "off" | "numbered";
export type OcclusionMode = "hide-far" | "fade-far" | "x-ray";

export interface LocalChamber3DLayoutResult extends LocalLayoutResult {
  layout: "local-chamber-3d";
  generatorDirections: Map<number, [number, number, number]>;
  pairPanelDirections: Map<string, [number, number, number]>;
  cameraTargets: Map<string, [number, number, number]>;
}

export interface LocalLayoutOptions {
  depth: number;
  generatorCount: number;
  innerRadius?: number;
  outerRadius?: number;
}

export interface LocalLayoutNode {
  nodeId: string;
  distance: number;
  path: number[];
  position: [number, number, number];
}

export interface LocalLayoutResult {
  nodeIds: Set<string>;
  distances: Map<string, number>;
  paths: Map<string, number[]>;
  positions: Map<string, [number, number, number]>;
  nodes: LocalLayoutNode[];
}

export interface GeneratorStepOption {
  generator: number;
  generatorId: string;
  label: string;
  targetNodeId?: string;
  available: boolean;
  reason?: string;
}

export interface BreadcrumbEntry {
  index: number;
  label: string;
  word: number[];
  nodeId?: string;
  clickable: boolean;
}

export interface LocalNeighborhoodExport {
  schemaVersion: 1;
  kind: "coxeter-local-neighborhood-view";
  dataset: {
    id: string;
    label: string;
    systemName: string;
  };
  selectedNodeId: string | undefined;
  selectedWord: {
    generators: number[];
    labels: string[];
    compactLabel: string;
  };
  view: {
    preset: ViewPresetId;
    graphView: "global" | "on-graph";
    localDepth: number;
    mode: "shell" | "geometric";
    projection: HyperbolicProjection;
    labelScope: LabelScope;
    layout: LocalViewLayout;
    cellRenderMode: LocalCellRenderMode;
    cellFocusMode: CellFocusMode;
    cellNeighborhoodMode: CellNeighborhoodMode;
    relationWalkMode: RelationWalkMode;
    occlusionMode: OcclusionMode;
  };
  filters: {
    disabledGeneratorPairs: string[];
    activeGeneratorPair?: string;
  };
  visible: {
    nodeIds: string[];
    edgeIds: string[];
    rankTwoCellIds: string[];
  };
  warnings: string[];
}

/**
 * Computes the chamber-centered 3D layout used by local topology mode.
 *
 * Distance-one generator neighbors sit on stable non-coplanar directions;
 * deeper nodes move onto separated shells. This is deliberately a readable
 * graph drawing, not Coxeter or hyperbolic geometry.
 */
export function computeLocalChamber3DLayout(
  nodes: CayleyNode[],
  edges: CayleyEdge[],
  cells: DavisTwoCell[],
  centerNodeId: string,
  options: LocalLayoutOptions,
): LocalChamber3DLayoutResult {
  const base = computeLocalLayout(nodes, edges, centerNodeId, options);
  const generatorCount = Math.max(1, Math.trunc(options.generatorCount));
  const innerRadius = options.innerRadius ?? 1.45;
  const outerRadius = options.outerRadius ?? 2.25;
  const generatorDirections = new Map<number, [number, number, number]>();
  const pairPanelDirections = new Map<string, [number, number, number]>();
  const cameraTargets = new Map<string, [number, number, number]>();
  const positions = new Map<string, [number, number, number]>();

  for (let generator = 0; generator < generatorCount; generator += 1) {
    generatorDirections.set(
      generator,
      stableGeneratorDirection(generator, generatorCount),
    );
  }

  for (const cell of cells) {
    const [left, right] = cell.generatorPair;
    const leftDirection =
      generatorDirections.get(left) ??
      stableGeneratorDirection(left, generatorCount);
    const rightDirection =
      generatorDirections.get(right) ??
      stableGeneratorDirection(right, generatorCount);
    const direction = normalizeVector([
      leftDirection[0] + rightDirection[0],
      leftDirection[1] + rightDirection[1],
      leftDirection[2] + rightDirection[2],
    ]);
    const fallback = stablePairDirection(left, right, generatorCount);
    const panelDirection =
      vectorLength(direction) > 0.001 ? direction : fallback;
    const key = pairKey(cell.generatorPair);
    pairPanelDirections.set(key, panelDirection);
    cameraTargets.set(key, scaleVector(panelDirection, outerRadius * 1.55));
  }

  for (const node of base.nodes) {
    if (node.distance === 0) {
      positions.set(node.nodeId, [0, 0, 0]);
      continue;
    }

    const pathDirection = directionForPath(
      node.path,
      generatorDirections,
      generatorCount,
    );
    const shellRadius =
      node.distance === 1
        ? innerRadius
        : innerRadius + (node.distance - 1) * outerRadius;
    const twist = deterministicTwist(node.path, node.nodeId);
    const shellLift = (node.distance - 1) * 0.42;
    const lateral = orthogonalUnit(pathDirection);
    positions.set(node.nodeId, [
      pathDirection[0] * shellRadius + lateral[0] * twist * 0.28,
      pathDirection[1] * shellRadius + lateral[1] * twist * 0.28,
      pathDirection[2] * shellRadius + lateral[2] * twist * 0.28 + shellLift,
    ]);
  }

  const layoutNodes = base.nodes.map((node) => ({
    ...node,
    position: positions.get(node.nodeId) ?? node.position,
  }));

  return {
    ...base,
    layout: "local-chamber-3d",
    positions,
    nodes: layoutNodes,
    generatorDirections,
    pairPanelDirections,
    cameraTargets,
  };
}

interface AdjacencyEntry {
  nodeId: string;
  generator: number;
  edgeId: string;
}

const adjacencyCache = new WeakMap<
  CayleyEdge[],
  Map<string, AdjacencyEntry[]>
>();

/**
 * Breadth-first local layout data before the 3D chamber-specific placement.
 */
export function computeLocalLayout(
  nodes: CayleyNode[],
  edges: CayleyEdge[],
  centerNodeId: string,
  options: LocalLayoutOptions,
): LocalLayoutResult {
  const depth = Math.max(0, Math.trunc(options.depth));
  const generatorCount = Math.max(1, Math.trunc(options.generatorCount));
  const innerRadius = options.innerRadius ?? 1.25;
  const outerRadius = options.outerRadius ?? 2.35;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = getCachedAdjacency(edges);
  const distances = new Map<string, number>();
  const paths = new Map<string, number[]>();
  const queue: string[] = [];

  if (nodeIds.has(centerNodeId)) {
    distances.set(centerNodeId, 0);
    paths.set(centerNodeId, []);
    queue.push(centerNodeId);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const currentId = queue[cursor];
    const currentDistance = distances.get(currentId) ?? 0;
    if (currentDistance >= depth) {
      continue;
    }

    const currentPath = paths.get(currentId) ?? [];
    const neighbors = [...(adjacency.get(currentId) ?? [])].sort(
      compareAdjacencyEntries,
    );
    for (const neighbor of neighbors) {
      if (!nodeIds.has(neighbor.nodeId) || distances.has(neighbor.nodeId)) {
        continue;
      }
      distances.set(neighbor.nodeId, currentDistance + 1);
      paths.set(neighbor.nodeId, [...currentPath, neighbor.generator]);
      queue.push(neighbor.nodeId);
    }
  }

  const includedNodeIds = new Set(distances.keys());
  const positions = new Map<string, [number, number, number]>();
  const shellGroups = new Map<number, string[]>();
  for (const [nodeId, distance] of distances) {
    shellGroups.set(distance, [...(shellGroups.get(distance) ?? []), nodeId]);
  }

  for (const [distance, shellNodeIds] of shellGroups) {
    const sorted = [...shellNodeIds].sort((left, right) =>
      comparePathKeys(left, right, paths),
    );
    sorted.forEach((nodeId, index) => {
      positions.set(
        nodeId,
        localPosition(
          distance,
          index,
          sorted.length,
          paths.get(nodeId) ?? [],
          generatorCount,
          innerRadius,
          outerRadius,
        ),
      );
    });
  }

  const layoutNodes = [...includedNodeIds]
    .map((nodeId) => ({
      nodeId,
      distance: distances.get(nodeId) ?? 0,
      path: paths.get(nodeId) ?? [],
      position: positions.get(nodeId) ?? [0, 0, 0],
    }))
    .sort((left, right) => {
      const distanceDifference = left.distance - right.distance;
      return distanceDifference === 0
        ? comparePathArrays(left.path, right.path) ||
            left.nodeId.localeCompare(right.nodeId)
        : distanceDifference;
    });

  return {
    nodeIds: includedNodeIds,
    distances,
    paths,
    positions,
    nodes: layoutNodes,
  };
}

/**
 * Describes which generator buttons can step from the selected chamber.
 */
export function generatorStepOptions(
  edges: CayleyEdge[],
  selectedNodeId: string | undefined,
  generators: CoxeterSystemInput["generators"],
): GeneratorStepOption[] {
  return generators.map((generator, index) => {
    if (!selectedNodeId) {
      return {
        generator: index,
        generatorId: generator.id,
        label: generator.label,
        available: false,
        reason: "No chamber is selected.",
      };
    }

    const incident = edges
      .filter(
        (edge) =>
          edge.generator === index &&
          (edge.source === selectedNodeId || edge.target === selectedNodeId),
      )
      .sort((left, right) => left.id.localeCompare(right.id))[0];

    if (!incident) {
      return {
        generator: index,
        generatorId: generator.id,
        label: generator.label,
        available: false,
        reason: "Not present in this finite ball; increase radius.",
      };
    }

    return {
      generator: index,
      generatorId: generator.id,
      label: generator.label,
      targetNodeId:
        incident.source === selectedNodeId ? incident.target : incident.source,
      available: true,
    };
  });
}

/**
 * Builds the selected word breadcrumb and marks only visible prefixes clickable.
 */
export function wordBreadcrumb(
  nodes: CayleyNode[],
  selectedNode: CayleyNode | undefined,
  generators: CoxeterSystemInput["generators"],
): BreadcrumbEntry[] {
  const selectedWord = selectedNode?.word ?? [];
  const nodesByWord = new Map(
    nodes.map((node) => [wordSignature(node.word), node.id]),
  );
  const entries: BreadcrumbEntry[] = [
    {
      index: 0,
      label: "e",
      word: [],
      nodeId: nodesByWord.get(""),
      clickable: nodesByWord.has(""),
    },
  ];

  for (let index = 0; index < selectedWord.length; index += 1) {
    const word = selectedWord.slice(0, index + 1);
    const nodeId = nodesByWord.get(wordSignature(word));
    const generator = selectedWord[index];
    entries.push({
      index: index + 1,
      label: generators[generator]?.label ?? `s${generator}`,
      word,
      nodeId,
      clickable: nodeId !== undefined,
    });
  }

  return entries;
}

export function compactWordLabel(
  word: number[],
  generators: CoxeterSystemInput["generators"],
): string {
  if (word.length === 0) {
    return "e";
  }

  const labels = word.map(
    (generator) => generators[generator]?.label ?? `s${generator}`,
  );
  const joined = labels.join("");
  return joined.length <= 12
    ? joined
    : `${labels.slice(0, 4).join("")}...${labels.at(-1)}`;
}

export function pairKey(pair: [number, number]): string {
  return `${pair[0]}-${pair[1]}`;
}

export function parsePairKey(
  key: string | undefined,
): [number, number] | undefined {
  if (!key) {
    return undefined;
  }
  const [left, right] = key.split("-").map(Number);
  return Number.isInteger(left) && Number.isInteger(right)
    ? [left, right]
    : undefined;
}

/**
 * Deterministic sidecar for a local view export.
 *
 * It records what was visible and why, but it is not a replacement for the
 * source dataset or exact backend artifact.
 */
export function buildLocalNeighborhoodExport(input: {
  datasetId: string;
  datasetLabel: string;
  system: CoxeterSystemInput;
  ball: GeneratedCayleyBall | undefined;
  selectedNode: CayleyNode | undefined;
  visibleNodes: CayleyNode[];
  visibleEdges: CayleyEdge[];
  visibleCells: DavisTwoCell[];
  activePreset: ViewPresetId;
  graphView: "global" | "on-graph";
  localDepth: number;
  mode: "shell" | "geometric";
  projection: HyperbolicProjection;
  labelScope: LabelScope;
  layout: LocalViewLayout;
  cellRenderMode: LocalCellRenderMode;
  cellFocusMode: CellFocusMode;
  occlusionMode: OcclusionMode;
  disabledPairs: Set<string>;
  activeGeneratorPairKey?: string;
  cellNeighborhoodMode: CellNeighborhoodMode;
  relationWalkMode: RelationWalkMode;
  warnings: string[];
}): LocalNeighborhoodExport {
  const selectedWord = input.selectedNode?.word ?? [];
  return {
    schemaVersion: 1,
    kind: "coxeter-local-neighborhood-view",
    dataset: {
      id: input.datasetId,
      label: input.datasetLabel,
      systemName: input.system.name,
    },
    selectedNodeId: input.selectedNode?.id,
    selectedWord: {
      generators: [...selectedWord],
      labels: selectedWord.map(
        (generator) =>
          input.system.generators[generator]?.label ?? `s${generator}`,
      ),
      compactLabel: compactWordLabel(selectedWord, input.system.generators),
    },
    view: {
      preset: input.activePreset,
      graphView: input.graphView,
      localDepth: input.localDepth,
      mode: input.mode,
      projection: input.projection,
      labelScope: input.labelScope,
      layout: input.layout,
      cellRenderMode: input.cellRenderMode,
      cellFocusMode: input.cellFocusMode,
      cellNeighborhoodMode: input.cellNeighborhoodMode,
      relationWalkMode: input.relationWalkMode,
      occlusionMode: input.occlusionMode,
    },
    filters: {
      disabledGeneratorPairs: [...input.disabledPairs].sort(),
      activeGeneratorPair: input.activeGeneratorPairKey,
    },
    visible: {
      nodeIds: input.visibleNodes.map((node) => node.id).sort(),
      edgeIds: input.visibleEdges.map((edge) => edge.id).sort(),
      rankTwoCellIds: input.visibleCells.map((cell) => cell.id).sort(),
    },
    warnings: [...new Set(input.warnings)].sort(),
  };
}

export interface RankTwoPairDiagnostic {
  key: string;
  pair: [number, number];
  label: string;
  m: number;
  polygonLabel: string;
  boundaryLength: number;
  visibleCount: number;
  totalCount: number;
  clippedCount: number;
  minDepthToComplete?: number;
}

export interface RelationWalkEntry {
  index: number;
  nodeId: string;
  label: string;
  generatorFromPrevious?: number;
  generatorLabelFromPrevious?: string;
}

export function rankTwoPairDiagnostics(input: {
  allCells: DavisTwoCell[];
  visibleCells: DavisTwoCell[];
  sceneNodeIds: Set<string>;
  system: CoxeterSystemInput;
  localDistances?: Map<string, number>;
}): RankTwoPairDiagnostic[] {
  const allCounts = new Map<string, number>();
  const visibleCounts = new Map<string, number>();
  const firstCellByPair = new Map<string, DavisTwoCell>();

  for (const cell of input.allCells) {
    const key = pairKey(cell.generatorPair);
    allCounts.set(key, (allCounts.get(key) ?? 0) + 1);
    if (!firstCellByPair.has(key)) {
      firstCellByPair.set(key, cell);
    }
  }

  for (const cell of input.visibleCells) {
    const key = pairKey(cell.generatorPair);
    visibleCounts.set(key, (visibleCounts.get(key) ?? 0) + 1);
  }

  const diagnostics: RankTwoPairDiagnostic[] = [];
  for (let i = 0; i < input.system.rank; i += 1) {
    for (let j = i + 1; j < input.system.rank; j += 1) {
      const entry = input.system.coxeterMatrix[i]?.[j];
      if (typeof entry !== "number" || entry <= 1) {
        continue;
      }

      const key = pairKey([i, j]);
      const visibleCount = visibleCounts.get(key) ?? 0;
      const totalCount = allCounts.get(key) ?? 0;
      const firstCell = firstCellByPair.get(key);
      const minDepthToComplete = firstCell
        ? maxKnownDistance(firstCell.boundaryNodeIds, input.localDistances)
        : undefined;
      diagnostics.push({
        key,
        pair: [i, j],
        label: `${input.system.generators[i]?.label ?? `s${i}`}-${input.system.generators[j]?.label ?? `s${j}`}`,
        m: entry,
        polygonLabel: polygonLabelForM(entry),
        boundaryLength: entry * 2,
        visibleCount,
        totalCount,
        clippedCount: Math.max(0, totalCount - visibleCount),
        minDepthToComplete,
      });
    }
  }

  return diagnostics.sort((left, right) => {
    const byM = left.m - right.m;
    return byM === 0 ? left.key.localeCompare(right.key) : byM;
  });
}

export function polygonLabelForM(m: number): string {
  switch (m) {
    case 2:
      return "square";
    case 3:
      return "hexagon";
    case 4:
      return "octagon";
    case 5:
      return "decagon";
    default:
      return `${2 * m}-gon`;
  }
}

export function cellNeighborhoodNodeIds(
  edges: CayleyEdge[],
  cell: DavisTwoCell | undefined,
  mode: CellNeighborhoodMode,
): Set<string> | undefined {
  if (!cell || mode === "chamber") {
    return undefined;
  }

  const included = new Set(cell.boundaryNodeIds);
  const shellCount =
    mode === "cell-plus-2" ? 2 : mode === "cell-plus-1" ? 1 : 0;
  if (shellCount <= 0) {
    return included;
  }

  const adjacency = getCachedAdjacency(edges);
  let frontier = new Set(cell.boundaryNodeIds);
  for (let depth = 0; depth < shellCount; depth += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (!included.has(neighbor.nodeId)) {
          included.add(neighbor.nodeId);
          next.add(neighbor.nodeId);
        }
      }
    }
    frontier = next;
  }

  return included;
}

export function cellBoundaryEdgeKeys(
  edges: CayleyEdge[],
  cell: DavisTwoCell | undefined,
): Set<string> {
  const keys = new Set<string>();
  if (!cell) {
    return keys;
  }

  const edgeIdsByEndpoints = new Map<string, string>();
  const edgeIdsByEndpointsAndGenerator = new Map<string, string>();
  for (const edge of edges) {
    edgeIdsByEndpoints.set(endpointKey(edge.source, edge.target), edge.id);
    edgeIdsByEndpointsAndGenerator.set(
      endpointGeneratorKey(edge.source, edge.target, edge.generator),
      edge.id,
    );
  }

  cell.boundaryNodeIds.forEach((nodeId, index) => {
    const nextNodeId =
      cell.boundaryNodeIds[(index + 1) % cell.boundaryNodeIds.length];
    const generator = cell.generatorPair[index % 2];
    const edgeId =
      edgeIdsByEndpointsAndGenerator.get(
        endpointGeneratorKey(nodeId, nextNodeId, generator),
      ) ?? edgeIdsByEndpoints.get(endpointKey(nodeId, nextNodeId));
    if (edgeId) {
      keys.add(edgeId);
    }
  });

  return keys;
}

export function relationWalkEntries(input: {
  cell: DavisTwoCell | undefined;
  nodes: CayleyNode[];
  edges: CayleyEdge[];
  generators: CoxeterSystemInput["generators"];
}): RelationWalkEntry[] {
  if (!input.cell) {
    return [];
  }

  const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
  const edgeByEndpoints = new Map<string, CayleyEdge>();
  const edgeByEndpointsAndGenerator = new Map<string, CayleyEdge>();
  for (const edge of input.edges) {
    edgeByEndpoints.set(endpointKey(edge.source, edge.target), edge);
    edgeByEndpointsAndGenerator.set(
      endpointGeneratorKey(edge.source, edge.target, edge.generator),
      edge,
    );
  }

  return input.cell.boundaryNodeIds.map((nodeId, index) => {
    const node = nodesById.get(nodeId);
    const previous =
      index === 0 ? undefined : input.cell?.boundaryNodeIds[index - 1];
    const expectedGenerator =
      index === 0 ? undefined : input.cell?.generatorPair[(index - 1) % 2];
    const edge =
      previous !== undefined && expectedGenerator !== undefined
        ? (edgeByEndpointsAndGenerator.get(
            endpointGeneratorKey(previous, nodeId, expectedGenerator),
          ) ?? edgeByEndpoints.get(endpointKey(previous, nodeId)))
        : previous !== undefined
          ? edgeByEndpoints.get(endpointKey(previous, nodeId))
          : undefined;
    return {
      index,
      nodeId,
      label: `${index}: ${compactWordLabel(node?.word ?? [], input.generators)}`,
      generatorFromPrevious: edge?.generator,
      generatorLabelFromPrevious:
        edge !== undefined
          ? (input.generators[edge.generator]?.label ?? `s${edge.generator}`)
          : undefined,
    };
  });
}

export function endpointKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function endpointGeneratorKey(
  left: string,
  right: string,
  generator: number,
): string {
  return `${endpointKey(left, right)}|s${generator}`;
}

function maxKnownDistance(
  nodeIds: string[],
  distances: Map<string, number> | undefined,
): number | undefined {
  if (!distances) {
    return undefined;
  }
  let maxDistance = 0;
  for (const nodeId of nodeIds) {
    const distance = distances.get(nodeId);
    if (distance === undefined) {
      return undefined;
    }
    maxDistance = Math.max(maxDistance, distance);
  }
  return maxDistance;
}

function getCachedAdjacency(
  edges: CayleyEdge[],
): Map<string, AdjacencyEntry[]> {
  const cached = adjacencyCache.get(edges);
  if (cached) {
    return cached;
  }
  const adjacency = buildAdjacency(edges);
  adjacencyCache.set(edges, adjacency);
  return adjacency;
}

function buildAdjacency(edges: CayleyEdge[]): Map<string, AdjacencyEntry[]> {
  const adjacency = new Map<string, AdjacencyEntry[]>();
  for (const edge of edges) {
    addAdjacency(adjacency, edge.source, {
      nodeId: edge.target,
      generator: edge.generator,
      edgeId: edge.id,
    });
    addAdjacency(adjacency, edge.target, {
      nodeId: edge.source,
      generator: edge.generator,
      edgeId: edge.id,
    });
  }
  return adjacency;
}

function addAdjacency(
  adjacency: Map<string, AdjacencyEntry[]>,
  source: string,
  entry: AdjacencyEntry,
) {
  const entries = adjacency.get(source);
  if (entries) {
    entries.push(entry);
  } else {
    adjacency.set(source, [entry]);
  }
}

function compareAdjacencyEntries(left: AdjacencyEntry, right: AdjacencyEntry) {
  const generatorDifference = left.generator - right.generator;
  if (generatorDifference !== 0) {
    return generatorDifference;
  }
  const byNode = left.nodeId.localeCompare(right.nodeId);
  return byNode === 0 ? left.edgeId.localeCompare(right.edgeId) : byNode;
}

function localPosition(
  distance: number,
  index: number,
  count: number,
  path: number[],
  generatorCount: number,
  innerRadius: number,
  outerRadius: number,
): [number, number, number] {
  if (distance === 0) {
    return [0, 0, 0];
  }

  if (distance === 1) {
    const generator = path[0] ?? index;
    const angle = generatorAngle(generator, generatorCount);
    return [innerRadius * Math.cos(angle), innerRadius * Math.sin(angle), 0];
  }

  const angle =
    count <= 1
      ? generatorAngle(path[0] ?? 0, generatorCount)
      : -Math.PI / 2 + (2 * Math.PI * index) / count;
  const radius = outerRadius + Math.max(0, distance - 2) * 0.85;
  const z = distance >= 3 ? (distance - 2) * 0.28 : 0;
  return [radius * Math.cos(angle), radius * Math.sin(angle), z];
}

function generatorAngle(generator: number, generatorCount: number): number {
  return -Math.PI / 2 + (2 * Math.PI * generator) / generatorCount;
}

function stableGeneratorDirection(
  generator: number,
  generatorCount: number,
): [number, number, number] {
  if (generatorCount === 1) {
    return [0, 0, 1];
  }

  if (generatorCount === 2) {
    return generator === 0 ? [-0.72, -0.48, 0.5] : [0.72, -0.48, 0.5];
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * (generator + 0.5)) / Math.max(1, generatorCount);
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = generator * goldenAngle - Math.PI / 2;
  return normalizeVector([
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
    y,
  ]);
}

function stablePairDirection(
  left: number,
  right: number,
  generatorCount: number,
): [number, number, number] {
  const angle =
    -Math.PI / 2 +
    (2 * Math.PI * (left + right + 0.5)) / Math.max(1, generatorCount * 2);
  return normalizeVector([Math.cos(angle), Math.sin(angle), 0.36]);
}

function directionForPath(
  path: number[],
  generatorDirections: Map<number, [number, number, number]>,
  generatorCount: number,
): [number, number, number] {
  const accumulator: [number, number, number] = [0, 0, 0];
  path.forEach((generator, index) => {
    const direction =
      generatorDirections.get(generator) ??
      stableGeneratorDirection(generator, generatorCount);
    const weight = 1 / (index + 1);
    accumulator[0] += direction[0] * weight;
    accumulator[1] += direction[1] * weight;
    accumulator[2] += direction[2] * weight;
  });

  return vectorLength(accumulator) > 0.001
    ? normalizeVector(accumulator)
    : [0, 0, 1];
}

function deterministicTwist(path: number[], nodeId: string): number {
  let hash = 17;
  for (const generator of path) {
    hash = (hash * 31 + generator + 1) % 997;
  }
  for (let index = 0; index < nodeId.length; index += 1) {
    hash = (hash * 31 + nodeId.charCodeAt(index)) % 997;
  }
  return (hash / 996 - 0.5) * 2;
}

function orthogonalUnit(
  vector: [number, number, number],
): [number, number, number] {
  const reference: [number, number, number] =
    Math.abs(vector[2]) < 0.82 ? [0, 0, 1] : [0, 1, 0];
  return normalizeVector([
    vector[1] * reference[2] - vector[2] * reference[1],
    vector[2] * reference[0] - vector[0] * reference[2],
    vector[0] * reference[1] - vector[1] * reference[0],
  ]);
}

function normalizeVector(
  vector: [number, number, number],
): [number, number, number] {
  const length = vectorLength(vector);
  if (length <= 0.000001) {
    return [0, 0, 0];
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function scaleVector(
  vector: [number, number, number],
  scale: number,
): [number, number, number] {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

function vectorLength(vector: [number, number, number]): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function comparePathKeys(
  leftNodeId: string,
  rightNodeId: string,
  paths: Map<string, number[]>,
): number {
  const byPath = comparePathArrays(
    paths.get(leftNodeId) ?? [],
    paths.get(rightNodeId) ?? [],
  );
  return byPath === 0 ? leftNodeId.localeCompare(rightNodeId) : byPath;
}

function comparePathArrays(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

function wordSignature(word: number[]): string {
  return word.join(".");
}
