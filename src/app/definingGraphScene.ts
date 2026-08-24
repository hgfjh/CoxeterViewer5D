import type { SceneEdge, SceneNode } from "../render/SceneView";
import type { CoxeterMatrixEntry, CoxeterSystemInput } from "../types";

type Vec3 = [number, number, number];

export interface DefiningGraphEdgeRecord {
  id: string;
  sourceGenerator: number;
  targetGenerator: number;
  entry: CoxeterMatrixEntry;
  label: string;
  color: string;
}

export interface DefiningGraphLegendEntry {
  label: string;
  color: string;
  count: number;
}

export interface DefiningGraphNeighborRecord {
  generator: number;
  nodeId: string;
  label: string;
  entry: Exclude<CoxeterMatrixEntry, 1>;
  edgeId?: string;
}

export interface DefiningGraphIncidenceClass {
  entry: Exclude<CoxeterMatrixEntry, 1>;
  label: string;
  color: string;
  drawnInGamma: boolean;
  neighbors: DefiningGraphNeighborRecord[];
}

export interface DefiningGraphVertexIncidence {
  generator: number;
  nodeId: string;
  label: string;
  finiteDegree: number;
  totalOtherGenerators: number;
  accountedNeighborCount: number;
  isCompletePartition: boolean;
  classes: DefiningGraphIncidenceClass[];
}

export interface DefiningGraphRelationComponent {
  id: string;
  generators: number[];
  generatorLabels: string[];
  edgeIds: string[];
}

export interface DefiningGraphRelationOrderComponents {
  relationOrder: number;
  label: string;
  color: string;
  edgeCount: number;
  components: DefiningGraphRelationComponent[];
  isolatedGenerators: number[];
  isolatedGeneratorLabels: string[];
}

export type DefiningGraphLayoutMode = "3d" | "planar";

export interface DefiningGraphPlanaritySummary {
  isPlanar: boolean;
  reason: string;
  obstruction?: {
    kind: "K5" | "K3,3";
    generatorSets: string[][];
  };
}

export interface DefiningGraphScene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  records: DefiningGraphEdgeRecord[];
  incidencePartitions: DefiningGraphVertexIncidence[];
  relationOrderComponents: DefiningGraphRelationOrderComponents[];
  legend: DefiningGraphLegendEntry[];
  charneyDavisCurvature: number;
  selectedNodeId: string | undefined;
  warnings: string[];
  rightAnglePairCount: number;
  layoutMode: DefiningGraphLayoutMode;
  planarity: DefiningGraphPlanaritySummary;
}

interface DefiningGraphTopology {
  records: DefiningGraphEdgeRecord[];
  incidencePartitions: DefiningGraphVertexIncidence[];
  relationOrderComponents: DefiningGraphRelationOrderComponents[];
  legend: DefiningGraphLegendEntry[];
  charneyDavisCurvature: number;
  rightAnglePairCount: number;
  planarity: DefiningGraphPlanaritySummary;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DIAGRAM_RADIUS = 5.4;
const PLANAR_RADIUS = 8.2;
const PLANAR_LABEL_FRACTIONS = [
  0.12, 0.16, 0.2, 0.25, 0.3, 0.36, 0.42, 0.48, 0.52, 0.58, 0.64, 0.7, 0.75,
  0.8, 0.84, 0.88,
];
const PLANAR_LABEL_OFFSETS = [0.5, -0.5, 0.72, -0.72, 0.94, -0.94];

// Parsed Coxeter systems are immutable app data. Caching by object identity
// keeps planarity and incidence analysis out of layout/theme-only updates.
const definingGraphTopologyCache = new WeakMap<
  CoxeterSystemInput,
  DefiningGraphTopology
>();
const planarLabelPlacementCache = new WeakMap<
  DefiningGraphTopology,
  Map<string, PlanarLabelPlacement>
>();

/**
 * Builds the Coxeter defining graph Gamma as a renderer scene.
 *
 * Gamma has one vertex for each generator. We draw every finite rank-two
 * Coxeter relation, including the usually suppressed `m=2` commuting pairs.
 * Infinite entries are omitted: they record that no finite rank-two relation
 * exists, so drawing them as edges makes dense diagrams read backwards.
 */
export function buildDefiningGraphScene(
  system: CoxeterSystemInput,
  options: {
    layoutMode?: DefiningGraphLayoutMode;
    highlightedGenerators?: readonly number[];
    highlightLabel?: string;
    highlightColor?: string;
  } = {},
): DefiningGraphScene {
  const layoutMode = options.layoutMode ?? "3d";
  const topology = buildDefiningGraphTopology(system);
  const highlightedGenerators =
    options.highlightedGenerators === undefined
      ? undefined
      : new Set(options.highlightedGenerators);
  const highlightColor = options.highlightColor ?? "#22d3ee";
  const nodes: SceneNode[] = system.generators.map((generator, index) => ({
    id: definingGraphNodeId(index),
    label: generator.label,
    compactLabel: generator.label,
    length: 0,
    localDistance: 0,
    colorHint: highlightedGenerators
      ? highlightedGenerators.has(index)
        ? highlightColor
        : "#64748b"
      : undefined,
    stateRole: highlightedGenerators
      ? highlightedGenerators.has(index)
        ? "in-state"
        : "out-of-state"
      : undefined,
    nodeScale: highlightedGenerators
      ? highlightedGenerators.has(index)
        ? 2.05
        : 0.72
      : undefined,
    alwaysLabel: highlightedGenerators ? true : undefined,
    labelPriority: highlightedGenerators
      ? highlightedGenerators.has(index)
        ? 130_000 - index
        : 95_000 - index
      : undefined,
    position:
      layoutMode === "planar"
        ? planarGeneratorDirection(index, system.rank)
        : generatorDirection(index, system.rank),
  }));
  const planarLabelPlacements =
    layoutMode === "planar"
      ? planarLabelPlacementsFor(topology, system.rank)
      : new Map<string, PlanarLabelPlacement>();

  return {
    nodes,
    edges: topology.records.map((record, index) => ({
      id: record.id,
      source: definingGraphNodeId(record.sourceGenerator),
      target: definingGraphNodeId(record.targetGenerator),
      // SceneView colors edges by a single generator bucket. For Gamma edges,
      // the label carries the relation; the color is only a stable cue.
      generator: record.sourceGenerator,
      // Coxeter-diagram edges carry relation orders, not generator names.
      // The legend writes "m=3"; the edge itself stays compact as "3".
      compactLabel: String(record.entry),
      semanticLabelKind: "coxeter-order",
      colorHint: record.color,
      isRelationBoundary: true,
      alwaysLabel: true,
      labelAnchor:
        layoutMode === "planar"
          ? planarLabelPlacements.get(record.id)?.anchor
          : undefined,
      labelPosition:
        layoutMode === "planar"
          ? planarLabelPlacements.get(record.id)?.labelPosition
          : undefined,
      labelLeader: true,
      labelPriority: 100_000 - index,
      emphasis: "readable-boundary",
      selectedHighlight: "outline",
    })),
    records: topology.records,
    incidencePartitions: topology.incidencePartitions,
    relationOrderComponents: topology.relationOrderComponents,
    legend: topology.legend,
    charneyDavisCurvature: topology.charneyDavisCurvature,
    selectedNodeId: highlightedGenerators ? undefined : nodes[0]?.id,
    warnings: [
      "Gamma is the Coxeter defining graph: vertices are generators and edges record finite rank-two Coxeter relations.",
      ...(highlightedGenerators && options.highlightLabel
        ? [
            `${options.highlightLabel} is highlighted on Gamma: colored generator vertices are in the selected JNW state; gray vertices are outside that state.`,
          ]
        : []),
      `${topology.rightAnglePairCount} m=2 commuting pair${
        topology.rightAnglePairCount === 1 ? " is" : "s are"
      } drawn intentionally, even though standard Coxeter diagrams usually omit them.`,
      "Pairs with m=inf are omitted because they do not contribute a finite Coxeter relation edge.",
      layoutMode === "planar"
        ? "Gamma planar mode is a 2D drawing of the defining graph. If an obstruction is present, crossings are unavoidable in any plane drawing."
        : "The 3D placement of Gamma is a drawing convention; it is not a cell complex or a geometric realization.",
      topology.planarity.reason,
    ],
    rightAnglePairCount: topology.rightAnglePairCount,
    layoutMode,
    planarity: topology.planarity,
  };
}

/**
 * Computes the finite relation graph and the relation-order partition at each
 * generator. For a fixed generator i, every j != i belongs to exactly one
 * class N_m(i), including the omitted m=inf class.
 */
export function buildDefiningGraphTopology(
  system: CoxeterSystemInput,
): DefiningGraphTopology {
  const cached = definingGraphTopologyCache.get(system);
  if (cached) {
    return cached;
  }

  const records: DefiningGraphEdgeRecord[] = [];
  const neighborsByGenerator = Array.from(
    { length: system.rank },
    () =>
      new Map<Exclude<CoxeterMatrixEntry, 1>, DefiningGraphNeighborRecord[]>(),
  );
  const finiteEntries = new Set<number>();
  let rightAnglePairCount = 0;

  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      const entry = system.coxeterMatrix[left]?.[right];
      if (entry === 1 || entry === undefined) {
        continue;
      }
      const edgeId =
        entry === "inf" ? undefined : definingGraphEdgeId(left, right);
      addIncidenceNeighbor(
        neighborsByGenerator[left],
        entry,
        neighborRecord(system, right, entry, edgeId),
      );
      addIncidenceNeighbor(
        neighborsByGenerator[right],
        entry,
        neighborRecord(system, left, entry, edgeId),
      );

      if (entry === "inf") {
        continue;
      }
      finiteEntries.add(entry);
      if (entry === 2) {
        rightAnglePairCount += 1;
      }
      records.push({
        id: edgeId!,
        sourceGenerator: left,
        targetGenerator: right,
        entry,
        label: relationLabel(entry),
        color: relationColor(entry),
      });
    }
  }

  const orderedEntries: Array<Exclude<CoxeterMatrixEntry, 1>> = [
    ...[...finiteEntries].sort((left, right) => left - right),
    "inf",
  ];
  const incidencePartitions = system.generators.map((generator, index) => {
    const buckets = neighborsByGenerator[index];
    const classes = orderedEntries.map((entry) => ({
      entry,
      label: relationLabel(entry),
      color: relationColor(entry),
      drawnInGamma: entry !== "inf",
      neighbors: [...(buckets.get(entry) ?? [])].sort(
        (left, right) => left.generator - right.generator,
      ),
    }));
    const accountedNeighborCount = classes.reduce(
      (count, relationClass) => count + relationClass.neighbors.length,
      0,
    );
    return {
      generator: index,
      nodeId: definingGraphNodeId(index),
      label: generator.label,
      finiteDegree: classes
        .filter((relationClass) => relationClass.drawnInGamma)
        .reduce(
          (count, relationClass) => count + relationClass.neighbors.length,
          0,
        ),
      totalOtherGenerators: Math.max(0, system.rank - 1),
      accountedNeighborCount,
      isCompletePartition:
        accountedNeighborCount === Math.max(0, system.rank - 1),
      classes,
    } satisfies DefiningGraphVertexIncidence;
  });

  const topology: DefiningGraphTopology = {
    records,
    incidencePartitions,
    relationOrderComponents: buildRelationOrderComponents(system, records),
    legend: relationLegend(records),
    charneyDavisCurvature:
      1 - system.generators.length / 2 + records.length / 4,
    rightAnglePairCount,
    planarity: summarizePlanarity(system, records),
  };
  definingGraphTopologyCache.set(system, topology);
  return topology;
}

/**
 * Splits Gamma into its monochromatic relation subgraphs Gamma_m.
 *
 * An equality imposed across every m-edge is constant on each edge-bearing
 * component below. Generators with no incident m-edge are retained separately;
 * they are the singleton components of the spanning graph Gamma_m.
 */
function buildRelationOrderComponents(
  system: CoxeterSystemInput,
  records: DefiningGraphEdgeRecord[],
): DefiningGraphRelationOrderComponents[] {
  const relationOrders = [
    ...new Set(
      records
        .map((record) => record.entry)
        .filter((entry): entry is number => typeof entry === "number"),
    ),
  ].sort((left, right) => left - right);

  return relationOrders.map((relationOrder) => {
    const orderRecords = records.filter(
      (record) => record.entry === relationOrder,
    );
    const adjacency = Array.from(
      { length: system.rank },
      () => new Set<number>(),
    );
    const incidentGenerators = new Set<number>();

    for (const record of orderRecords) {
      adjacency[record.sourceGenerator].add(record.targetGenerator);
      adjacency[record.targetGenerator].add(record.sourceGenerator);
      incidentGenerators.add(record.sourceGenerator);
      incidentGenerators.add(record.targetGenerator);
    }

    const visited = new Set<number>();
    const components: DefiningGraphRelationComponent[] = [];
    for (const seed of [...incidentGenerators].sort(
      (left, right) => left - right,
    )) {
      if (visited.has(seed)) {
        continue;
      }
      const pending = [seed];
      const generators: number[] = [];
      visited.add(seed);

      while (pending.length > 0) {
        const generator = pending.pop()!;
        generators.push(generator);
        for (const neighbor of adjacency[generator]) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            pending.push(neighbor);
          }
        }
      }

      generators.sort((left, right) => left - right);
      const componentGenerators = new Set(generators);
      components.push({
        id: `Gamma:m:${relationOrder}:component:${generators[0]}`,
        generators,
        generatorLabels: generators.map(
          (generator) => system.generators[generator]?.label ?? `s${generator}`,
        ),
        edgeIds: orderRecords
          .filter(
            (record) =>
              componentGenerators.has(record.sourceGenerator) &&
              componentGenerators.has(record.targetGenerator),
          )
          .map((record) => record.id),
      });
    }

    const isolatedGenerators = Array.from(
      { length: system.rank },
      (_, generator) => generator,
    ).filter((generator) => !incidentGenerators.has(generator));

    return {
      relationOrder,
      label: relationLabel(relationOrder),
      color: relationColor(relationOrder),
      edgeCount: orderRecords.length,
      components,
      isolatedGenerators,
      isolatedGeneratorLabels: isolatedGenerators.map(
        (generator) => system.generators[generator]?.label ?? `s${generator}`,
      ),
    };
  });
}

function addIncidenceNeighbor(
  buckets: Map<Exclude<CoxeterMatrixEntry, 1>, DefiningGraphNeighborRecord[]>,
  entry: Exclude<CoxeterMatrixEntry, 1>,
  neighbor: DefiningGraphNeighborRecord,
): void {
  const entries = buckets.get(entry) ?? [];
  entries.push(neighbor);
  buckets.set(entry, entries);
}

function neighborRecord(
  system: CoxeterSystemInput,
  generator: number,
  entry: Exclude<CoxeterMatrixEntry, 1>,
  edgeId: string | undefined,
): DefiningGraphNeighborRecord {
  return {
    generator,
    nodeId: definingGraphNodeId(generator),
    label: system.generators[generator]?.label ?? `s${generator}`,
    entry,
    edgeId,
  };
}

function planarLabelPlacementsFor(
  topology: DefiningGraphTopology,
  generatorCount: number,
): Map<string, PlanarLabelPlacement> {
  const cached = planarLabelPlacementCache.get(topology);
  if (cached) {
    return cached;
  }
  const placements = buildPlanarLabelPlacements(
    topology.records,
    generatorCount,
  );
  planarLabelPlacementCache.set(topology, placements);
  return placements;
}

export function definingGraphNodeId(generator: number): string {
  return `Gamma:v:${generator}`;
}

function definingGraphEdgeId(left: number, right: number): string {
  return `Gamma:e:${left}-${right}`;
}

function relationLabel(entry: CoxeterMatrixEntry): string {
  return entry === "inf" ? "m=inf" : `m=${entry}`;
}

function relationColor(entry: CoxeterMatrixEntry): string {
  if (entry === "inf") {
    return "#94a3b8";
  }
  if (entry === 2) {
    return "#06b6d4";
  }
  if (entry === 3) {
    return "#2563eb";
  }
  if (entry === 4) {
    return "#16a34a";
  }
  if (entry === 5) {
    return "#f59e0b";
  }
  return "#8b5cf6";
}

function relationLegend(
  records: DefiningGraphEdgeRecord[],
): DefiningGraphLegendEntry[] {
  const counts = new Map<string, DefiningGraphLegendEntry>();
  for (const record of records) {
    const existing = counts.get(record.label);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(record.label, {
        label: record.label,
        color: record.color,
        count: 1,
      });
    }
  }

  return [...counts.values()].sort((left, right) => {
    const leftRank = relationLegendRank(left.label);
    const rightRank = relationLegendRank(right.label);
    return leftRank - rightRank || left.label.localeCompare(right.label);
  });
}

function relationLegendRank(label: string): number {
  const match = /^m=(\d+)$/.exec(label);
  return match ? Number(match[1]) : 10_000;
}

function generatorDirection(index: number, count: number): Vec3 {
  if (count <= 1) {
    return [0, 0, 0];
  }
  const y = 1 - (2 * (index + 0.5)) / count;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = index * GOLDEN_ANGLE - Math.PI / 2;
  return [
    Math.cos(angle) * radius * DIAGRAM_RADIUS,
    Math.sin(angle) * radius * DIAGRAM_RADIUS,
    y * DIAGRAM_RADIUS,
  ];
}

function planarGeneratorDirection(index: number, count: number): Vec3 {
  if (count <= 1) {
    return [0, 0, 0];
  }
  const angle = (2 * Math.PI * index) / count - Math.PI / 2;
  return [Math.cos(angle) * PLANAR_RADIUS, Math.sin(angle) * PLANAR_RADIUS, 0];
}

interface PlanarLabelPlacement {
  anchor: Vec3;
  labelPosition: Vec3;
}

interface PlanarSegment {
  record: DefiningGraphEdgeRecord;
  source: Vec3;
  target: Vec3;
}

function buildPlanarLabelPlacements(
  records: DefiningGraphEdgeRecord[],
  generatorCount: number,
): Map<string, PlanarLabelPlacement> {
  const segments = records.map((record) => ({
    record,
    source: planarGeneratorDirection(record.sourceGenerator, generatorCount),
    target: planarGeneratorDirection(record.targetGenerator, generatorCount),
  }));
  const placements = new Map<string, PlanarLabelPlacement>();
  const placed: PlanarLabelPlacement[] = [];
  const ordered = [...segments].sort((left, right) => {
    const crossingDifference =
      countSegmentCrossings(right, segments) -
      countSegmentCrossings(left, segments);
    if (crossingDifference !== 0) {
      return crossingDifference;
    }
    return left.record.id.localeCompare(right.record.id);
  });

  for (const segment of ordered) {
    const placement = choosePlanarLabelPlacement(segment, segments, placed);
    placements.set(segment.record.id, placement);
    placed.push(placement);
  }

  return placements;
}

function choosePlanarLabelPlacement(
  segment: PlanarSegment,
  allSegments: PlanarSegment[],
  placed: PlanarLabelPlacement[],
): PlanarLabelPlacement {
  const candidates = planarLabelCandidates(segment, allSegments, placed);
  return candidates.reduce((best, candidate) =>
    candidate.score > best.score ? candidate : best,
  ).placement;
}

function planarLabelCandidates(
  segment: PlanarSegment,
  allSegments: PlanarSegment[],
  placed: PlanarLabelPlacement[],
): Array<{ placement: PlanarLabelPlacement; score: number }> {
  const edgeVector = subtract2(segment.target, segment.source);
  const edgeLength = length2(edgeVector);
  if (edgeLength === 0) {
    return [
      {
        placement: { anchor: segment.source, labelPosition: segment.source },
        score: Number.NEGATIVE_INFINITY,
      },
    ];
  }
  const unit = [
    edgeVector[0] / edgeLength,
    edgeVector[1] / edgeLength,
  ] as const;
  const normal = [-unit[1], unit[0]] as const;
  const crossingParameters = allSegments
    .filter((other) => other.record.id !== segment.record.id)
    .map((other) => segmentIntersectionParameter(segment, other))
    .filter((value): value is number => value !== undefined);

  return PLANAR_LABEL_FRACTIONS.flatMap((fraction) => {
    const anchor = lerpVec3(segment.source, segment.target, fraction);
    return PLANAR_LABEL_OFFSETS.map((offset) => {
      const labelPosition: Vec3 = [
        anchor[0] + normal[0] * offset,
        anchor[1] + normal[1] * offset,
        0.24,
      ];
      const unrelatedEdgeClearance = minimumUnrelatedEdgeDistance(
        labelPosition,
        segment,
        allSegments,
      );
      const labelClearance = minimumPlacedLabelDistance(labelPosition, placed);
      const crossingClearance =
        crossingParameters.length === 0
          ? edgeLength
          : Math.min(
              ...crossingParameters.map(
                (parameter) => Math.abs(parameter - fraction) * edgeLength,
              ),
            );
      const endpointClearance = Math.min(fraction, 1 - fraction) * edgeLength;
      const centerPenalty = Math.max(
        0,
        2.25 - Math.hypot(labelPosition[0], labelPosition[1]),
      );
      const score =
        unrelatedEdgeClearance * 18 +
        Math.min(labelClearance, 2) * 18 +
        Math.min(crossingClearance, 2) * 7 +
        endpointClearance * 0.2 -
        Math.abs(offset) * 2.4 -
        centerPenalty * 10 -
        (unrelatedEdgeClearance < 0.24 ? 60 : 0) -
        (labelClearance < 0.55 ? 80 : 0) -
        (labelClearance < 0.65 ? 35 : 0);
      return {
        placement: { anchor, labelPosition },
        score,
      };
    });
  });
}

function countSegmentCrossings(
  segment: PlanarSegment,
  allSegments: PlanarSegment[],
): number {
  return allSegments.filter(
    (other) =>
      other.record.id !== segment.record.id &&
      segmentIntersectionParameter(segment, other) !== undefined,
  ).length;
}

function minimumUnrelatedEdgeDistance(
  position: Vec3,
  segment: PlanarSegment,
  allSegments: PlanarSegment[],
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const other of allSegments) {
    if (other.record.id === segment.record.id) {
      continue;
    }
    const distance = pointSegmentDistance2(
      position,
      other.source,
      other.target,
    );
    minimum = Math.min(minimum, distance);
  }
  return minimum;
}

function minimumPlacedLabelDistance(
  position: Vec3,
  placed: PlanarLabelPlacement[],
): number {
  if (placed.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.min(
    ...placed.map((placement) =>
      Math.hypot(
        position[0] - placement.labelPosition[0],
        position[1] - placement.labelPosition[1],
      ),
    ),
  );
}

function segmentIntersectionParameter(
  segment: PlanarSegment,
  other: PlanarSegment,
): number | undefined {
  if (
    segment.record.sourceGenerator === other.record.sourceGenerator ||
    segment.record.sourceGenerator === other.record.targetGenerator ||
    segment.record.targetGenerator === other.record.sourceGenerator ||
    segment.record.targetGenerator === other.record.targetGenerator
  ) {
    return undefined;
  }

  const p = segment.source;
  const r = subtract2(segment.target, segment.source);
  const q = other.source;
  const s = subtract2(other.target, other.source);
  const denominator = cross2(r, s);
  if (Math.abs(denominator) < 1e-10) {
    return undefined;
  }
  const qMinusP = subtract2(q, p);
  const t = cross2(qMinusP, s) / denominator;
  const u = cross2(qMinusP, r) / denominator;
  return t > 1e-8 && t < 1 - 1e-8 && u > 1e-8 && u < 1 - 1e-8 ? t : undefined;
}

function pointSegmentDistance2(point: Vec3, source: Vec3, target: Vec3) {
  const segment = subtract2(target, source);
  const lengthSquared = dot2(segment, segment);
  if (lengthSquared === 0) {
    return Math.hypot(point[0] - source[0], point[1] - source[1]);
  }
  const t = Math.max(
    0,
    Math.min(1, dot2(subtract2(point, source), segment) / lengthSquared),
  );
  const closest = [source[0] + segment[0] * t, source[1] + segment[1] * t];
  return Math.hypot(point[0] - closest[0], point[1] - closest[1]);
}

function lerpVec3(source: Vec3, target: Vec3, fraction: number): Vec3 {
  return [
    source[0] + (target[0] - source[0]) * fraction,
    source[1] + (target[1] - source[1]) * fraction,
    source[2] + (target[2] - source[2]) * fraction,
  ];
}

function subtract2(left: Vec3, right: Vec3): [number, number] {
  return [left[0] - right[0], left[1] - right[1]];
}

function length2(vector: readonly [number, number]) {
  return Math.hypot(vector[0], vector[1]);
}

function dot2(
  left: readonly [number, number],
  right: readonly [number, number],
) {
  return left[0] * right[0] + left[1] * right[1];
}

function cross2(
  left: readonly [number, number],
  right: readonly [number, number],
) {
  return left[0] * right[1] - left[1] * right[0];
}

function summarizePlanarity(
  system: CoxeterSystemInput,
  records: DefiningGraphEdgeRecord[],
): DefiningGraphPlanaritySummary {
  const labels = system.generators.map((generator) => generator.label);
  const edgeSet = new Set(
    records.map((record) =>
      pairKeyForGenerators(record.sourceGenerator, record.targetGenerator),
    ),
  );
  const k5 = findCompleteSubgraph(system.rank, edgeSet, 5);
  if (k5) {
    return {
      isPlanar: false,
      reason: `Gamma contains a K5 subgraph on ${formatGeneratorSet(k5, labels)}, so it is not planar.`,
      obstruction: {
        kind: "K5",
        generatorSets: [k5.map((index) => labels[index] ?? `s${index}`)],
      },
    };
  }

  const k33 = findCompleteBipartiteSubgraph(system.rank, edgeSet, 3, 3);
  if (k33) {
    return {
      isPlanar: false,
      reason: `Gamma contains a K3,3 subgraph between ${formatGeneratorSet(k33.left, labels)} and ${formatGeneratorSet(k33.right, labels)}, so it is not planar.`,
      obstruction: {
        kind: "K3,3",
        generatorSets: [
          k33.left.map((index) => labels[index] ?? `s${index}`),
          k33.right.map((index) => labels[index] ?? `s${index}`),
        ],
      },
    };
  }

  if (system.rank >= 3 && records.length > 3 * system.rank - 6) {
    return {
      isPlanar: false,
      reason:
        "Gamma fails the planar edge-count bound |E| <= 3|V| - 6. No literal K5 or K3,3 subgraph was found by the lightweight obstruction scan.",
    };
  }

  return {
    isPlanar: true,
    reason:
      "No K5 or K3,3 subgraph was found, and the planar edge-count bound does not rule out a crossing-free drawing.",
  };
}

function findCompleteSubgraph(
  vertexCount: number,
  edgeSet: Set<string>,
  size: number,
): number[] | undefined {
  for (const subset of combinations(vertexCount, size)) {
    if (isCompleteSubgraph(subset, edgeSet)) {
      return subset;
    }
  }
  return undefined;
}

function findCompleteBipartiteSubgraph(
  vertexCount: number,
  edgeSet: Set<string>,
  leftSize: number,
  rightSize: number,
): { left: number[]; right: number[] } | undefined {
  for (const left of combinations(vertexCount, leftSize)) {
    const remaining = Array.from(
      { length: vertexCount },
      (_, index) => index,
    ).filter((index) => !left.includes(index));
    for (const right of combinationsFromValues(remaining, rightSize)) {
      if (isCompleteBipartite(left, right, edgeSet)) {
        return { left, right };
      }
    }
  }
  return undefined;
}

function isCompleteSubgraph(vertices: number[], edgeSet: Set<string>): boolean {
  for (let left = 0; left < vertices.length; left += 1) {
    for (let right = left + 1; right < vertices.length; right += 1) {
      if (!edgeSet.has(pairKeyForGenerators(vertices[left], vertices[right]))) {
        return false;
      }
    }
  }
  return true;
}

function isCompleteBipartite(
  left: number[],
  right: number[],
  edgeSet: Set<string>,
): boolean {
  return left.every((leftIndex) =>
    right.every((rightIndex) =>
      edgeSet.has(pairKeyForGenerators(leftIndex, rightIndex)),
    ),
  );
}

function combinations(vertexCount: number, size: number): number[][] {
  return combinationsFromValues(
    Array.from({ length: vertexCount }, (_, index) => index),
    size,
  );
}

function combinationsFromValues(values: number[], size: number): number[][] {
  if (size === 0) {
    return [[]];
  }
  if (values.length < size) {
    return [];
  }
  const [head, ...tail] = values;
  return [
    ...combinationsFromValues(tail, size - 1).map((subset) => [
      head,
      ...subset,
    ]),
    ...combinationsFromValues(tail, size),
  ];
}

function pairKeyForGenerators(left: number, right: number): string {
  return left < right ? `${left}-${right}` : `${right}-${left}`;
}

function formatGeneratorSet(indices: number[], labels: string[]): string {
  return `{${indices.map((index) => labels[index] ?? `s${index}`).join(", ")}}`;
}
