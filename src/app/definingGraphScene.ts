import type { SceneNode } from "../render/SceneView";
import type { CoxeterMatrixEntry, CoxeterSystemInput } from "../types";
import type { SceneLineStyle, StyledSceneEdge } from "./compressedComplexScene";

type Vec3 = [number, number, number];

export interface DefiningGraphEdgeRecord {
  id: string;
  sourceGenerator: number;
  targetGenerator: number;
  entry: CoxeterMatrixEntry;
  label: string;
  color: string;
  lineStyle: SceneLineStyle;
}

export interface DefiningGraphLegendEntry {
  label: string;
  color: string;
  lineStyle: SceneLineStyle;
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
  lineStyle: SceneLineStyle;
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
  lineStyle: SceneLineStyle;
  edgeCount: number;
  components: DefiningGraphRelationComponent[];
  isolatedGenerators: number[];
  isolatedGeneratorLabels: string[];
}

/**
 * "auto" draws a planar Gamma crossing-free in one plane and a non-planar
 * Gamma in 3D; "3d" forces the spherical spiral; "planar" is the circle
 * drawing with crossings left visible.
 */
export type DefiningGraphLayoutMode = "auto" | "3d" | "planar";

/**
 * Requested node field: colour this vertex as generator `generatorColorIndex`
 * in the active theme when no colorHint is supplied.
 */
export type GammaSceneNode = SceneNode & { generatorColorIndex?: number };

export interface DefiningGraphPlanaritySummary {
  isPlanar: boolean;
  reason: string;
  obstruction?: {
    kind: "K5" | "K3,3";
    generatorSets: string[][];
  };
}

export interface DefiningGraphScene {
  nodes: GammaSceneNode[];
  edges: StyledSceneEdge[];
  records: DefiningGraphEdgeRecord[];
  incidencePartitions: DefiningGraphVertexIncidence[];
  relationOrderComponents: DefiningGraphRelationOrderComponents[];
  legend: DefiningGraphLegendEntry[];
  charneyDavisCurvature: number;
  selectedNodeId: string | undefined;
  warnings: string[];
  rightAnglePairCount: number;
  layoutMode: DefiningGraphLayoutMode;
  /** Whether the drawn vertices lie in one plane (z = 0) or in space. */
  layoutKind: "plane" | "space";
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
/** Candidate outer faces tried for the Tutte drawing. */
const GAMMA_CYCLE_LIMIT = 200;
/** Minimum clearance (vertex-vertex, vertex-edge) over median edge length. */
const GAMMA_MIN_SEPARATION = 0.2;

// Parsed Coxeter systems are immutable app data. Caching by object identity
// keeps planarity and incidence analysis out of layout/theme-only updates.
const definingGraphTopologyCache = new WeakMap<
  CoxeterSystemInput,
  DefiningGraphTopology
>();
const planarLabelPlacementCache = new WeakMap<
  DefiningGraphTopology,
  Map<string, Map<string, PlanarLabelPlacement>>
>();
const automaticLayoutCache = new WeakMap<
  DefiningGraphTopology,
  { positions: Vec3[]; kind: "plane" | "space" }
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
  const layoutMode = options.layoutMode ?? "auto";
  const topology = buildDefiningGraphTopology(system);
  const layout = gammaLayout(topology, system.rank, layoutMode);
  const highlightedGenerators =
    options.highlightedGenerators === undefined
      ? undefined
      : new Set(options.highlightedGenerators);
  const highlightColor = options.highlightColor ?? "#22d3ee";
  const nodes: GammaSceneNode[] = system.generators.map((generator, index) => ({
    id: definingGraphNodeId(index),
    label: generator.label,
    compactLabel: generator.label,
    length: 0,
    localDistance: 0,
    // A Gamma vertex is a generator, so it wears that generator's colour.
    colorHint: highlightedGenerators
      ? highlightedGenerators.has(index)
        ? highlightColor
        : "#64748b"
      : generator.colorHint,
    generatorColorIndex: highlightedGenerators ? undefined : index,
    stateRole: highlightedGenerators
      ? highlightedGenerators.has(index)
        ? "in-state"
        : "out-of-state"
      : undefined,
    nodeScale: highlightedGenerators
      ? highlightedGenerators.has(index)
        ? 2.05
        : 0.72
      : 1.35,
    alwaysLabel: true,
    labelPriority: highlightedGenerators
      ? highlightedGenerators.has(index)
        ? 130_000 - index
        : 95_000 - index
      : 120_000 - index,
    position: layout.positions[index],
  }));
  const planarLabelPlacements =
    layout.kind === "plane"
      ? planarLabelPlacementsFor(topology, layoutMode, layout.positions)
      : new Map<string, PlanarLabelPlacement>();

  return {
    nodes,
    edges: topology.records.map((record, index) => ({
      id: record.id,
      source: definingGraphNodeId(record.sourceGenerator),
      target: definingGraphNodeId(record.targetGenerator),
      // SceneView needs a generator bucket, but a Gamma edge is a relation,
      // not a generator. The neutral colorHint overrides the generator hue;
      // the "m=k" label and the line style carry the order.
      generator: record.sourceGenerator,
      compactLabel: record.label,
      semanticLabelKind: "coxeter-order",
      colorHint: record.color,
      lineStyle: record.lineStyle,
      isRelationBoundary: true,
      alwaysLabel: true,
      labelAnchor: planarLabelPlacements.get(record.id)?.anchor,
      labelPosition: planarLabelPlacements.get(record.id)?.labelPosition,
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
        : layout.kind === "plane"
          ? "Gamma is drawn crossing-free in one plane (the drawing is checked for crossings). Vertex positions are a drawing convention, not a geometric realization."
          : "Gamma is drawn in 3D by a stress layout of graph distances; the placement is a drawing convention, not a cell complex or a geometric realization.",
      "Edge colour is neutral on purpose: generator hues mark the vertices, while each edge's m=k label and line style give its Coxeter order.",
      topology.planarity.reason,
    ],
    rightAnglePairCount: topology.rightAnglePairCount,
    layoutMode,
    layoutKind: layout.kind,
    planarity: topology.planarity,
  };
}

function gammaLayout(
  topology: DefiningGraphTopology,
  rank: number,
  mode: DefiningGraphLayoutMode,
): { positions: Vec3[]; kind: "plane" | "space" } {
  if (mode === "planar") {
    return {
      positions: Array.from({ length: rank }, (_unused, index) =>
        planarGeneratorDirection(index, rank),
      ),
      kind: "plane",
    };
  }
  if (mode === "3d") {
    return {
      positions: Array.from({ length: rank }, (_unused, index) =>
        generatorDirection(index, rank),
      ),
      kind: "space",
    };
  }
  const cached = automaticLayoutCache.get(topology);
  if (cached) return cached;
  const layout = automaticGammaLayout(
    rank,
    topology.records,
    topology.planarity.isPlanar,
  );
  automaticLayoutCache.set(topology, layout);
  return layout;
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
        lineStyle: relationLineStyle(entry),
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
      lineStyle: relationLineStyle(entry),
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
      lineStyle: relationLineStyle(relationOrder),
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
  mode: DefiningGraphLayoutMode,
  positions: readonly Vec3[],
): Map<string, PlanarLabelPlacement> {
  const byMode =
    planarLabelPlacementCache.get(topology) ??
    new Map<string, Map<string, PlanarLabelPlacement>>();
  planarLabelPlacementCache.set(topology, byMode);
  const cached = byMode.get(mode);
  if (cached) {
    return cached;
  }
  const placements = buildPlanarLabelPlacements(topology.records, positions);
  byMode.set(mode, placements);
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

/**
 * Neutral greys for relation edges. Generator hues are reserved for Gamma's
 * vertices, so an edge colour never reads as a generator. Every grey keeps
 * at least 3:1 contrast on the light (#f6f7f9) and dark (#0d1117) canvases;
 * lightness alone cannot separate five orders in both themes, so the order is
 * carried by the "m=k" label and `relationLineStyle`.
 */
function relationColor(entry: CoxeterMatrixEntry): string {
  if (entry === "inf") {
    return "#94a3b8";
  }
  if (entry === 2) {
    return "#7c8799";
  }
  if (entry === 3) {
    return "#64748b";
  }
  if (entry === 4) {
    return "#5b6577";
  }
  return "#78716c";
}

/**
 * m=2 is dotted (commuting pairs, usually omitted from Coxeter diagrams),
 * m=3 solid (the unlabelled edge of a Coxeter diagram), and higher orders
 * get progressively longer dash patterns.
 */
function relationLineStyle(entry: CoxeterMatrixEntry): SceneLineStyle {
  if (entry === "inf" || entry === 2) return "dotted";
  if (entry === 3) return "solid";
  if (entry === 4) return "dashed";
  if (entry === 5) return "dash-dot";
  return "long-dash";
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
        lineStyle: record.lineStyle,
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
  positions: readonly Vec3[],
): Map<string, PlanarLabelPlacement> {
  const segments = records.map((record) => ({
    record,
    source: positions[record.sourceGenerator],
    target: positions[record.targetGenerator],
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

/**
 * Automatic Gamma drawing.
 *
 * A planar Gamma is drawn crossing-free in the z=0 plane, so the camera sees
 * it face-on and perspective does not shrink one side. We try, in order:
 * Tutte barycentric embeddings with each short induced cycle as the convex
 * outer face (Tutte's theorem makes these crossing-free for 3-connected
 * planar graphs when the cycle is a face), a 2D stress layout, and the
 * circle. Each candidate is accepted only after an explicit crossing and
 * vertex-separation check. A non-planar Gamma, or one where every candidate
 * fails the check, gets a 3D stress layout from graph distances.
 */
function automaticGammaLayout(
  rank: number,
  records: readonly DefiningGraphEdgeRecord[],
  planar: boolean,
): { positions: Vec3[]; kind: "plane" | "space" } {
  if (rank <= 1) return { positions: [[0, 0, 0]], kind: "plane" };
  const edges = records.map(
    (record) => [record.sourceGenerator, record.targetGenerator] as const,
  );
  if (planar) {
    const candidates: Array<() => Vec3[] | undefined> = [
      ...inducedCycles(rank, edges, GAMMA_CYCLE_LIMIT).map(
        (cycle) => () => tutteLayout(rank, edges, cycle),
      ),
      () => stressLayout(rank, edges, 2),
      () =>
        Array.from({ length: rank }, (_unused, index) =>
          planarGeneratorDirection(index, rank),
        ),
    ];
    let best: { positions: Vec3[]; separation: number } | undefined;
    for (const candidate of candidates) {
      const positions = candidate();
      if (!positions || countCrossings(positions, edges) > 0) continue;
      const separation = relativeSeparation(positions, edges);
      if (separation < GAMMA_MIN_SEPARATION) continue;
      if (!best || separation > best.separation + 1e-9) {
        best = { positions, separation };
      }
    }
    if (best) {
      return {
        positions: fitRadius(best.positions, PLANAR_RADIUS),
        kind: "plane",
      };
    }
  }
  return {
    positions: fitRadius(stressLayout(rank, edges, 3), DIAGRAM_RADIUS),
    kind: "space",
  };
}

/** Induced cycles of length 3..8, each once, as candidate outer faces. */
function inducedCycles(
  rank: number,
  edges: ReadonlyArray<readonly [number, number]>,
  limit: number,
): number[][] {
  const adjacent = Array.from({ length: rank }, () => new Set<number>());
  for (const [left, right] of edges) {
    adjacent[left].add(right);
    adjacent[right].add(left);
  }
  const cycles: number[][] = [];
  const seen = new Set<string>();
  const extend = (path: number[]) => {
    if (cycles.length >= limit) return;
    const last = path[path.length - 1];
    for (const next of adjacent[last]) {
      if (next < path[0]) continue;
      if (next === path[0] && path.length >= 3) {
        const key = [...path].sort((a, b) => a - b).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push([...path]);
        }
        continue;
      }
      if (path.includes(next) || path.length >= 8) continue;
      // Induced: the new vertex may touch only its predecessor (and the start
      // when it closes the cycle).
      const chord = path
        .slice(1, -1)
        .some((vertex) => adjacent[next].has(vertex));
      if (chord) continue;
      extend([...path, next]);
    }
  };
  for (let start = 0; start < rank; start += 1) extend([start]);
  return cycles.filter((cycle) =>
    cycle.every((vertex, index) => {
      // Re-check the closing chord condition for the first vertex.
      const neighbours = cycle.filter(
        (other, otherIndex) =>
          otherIndex !== index && adjacent[vertex].has(other),
      );
      return neighbours.length === 2;
    }),
  );
}

/** Tutte embedding: outer cycle on a circle, others at neighbour averages. */
function tutteLayout(
  rank: number,
  edges: ReadonlyArray<readonly [number, number]>,
  outer: readonly number[],
): Vec3[] | undefined {
  const adjacent = Array.from({ length: rank }, () => [] as number[]);
  for (const [left, right] of edges) {
    adjacent[left].push(right);
    adjacent[right].push(left);
  }
  const fixed = new Set(outer);
  if (adjacent.some((list, index) => list.length === 0 && !fixed.has(index))) {
    return undefined;
  }
  const positions: Vec3[] = Array.from({ length: rank }, () => [0, 0, 0]);
  outer.forEach((vertex, index) => {
    const angle = Math.PI / 2 - (2 * Math.PI * index) / outer.length;
    positions[vertex] = [Math.cos(angle), Math.sin(angle), 0];
  });
  for (let sweep = 0; sweep < 400; sweep += 1) {
    for (let vertex = 0; vertex < rank; vertex += 1) {
      if (fixed.has(vertex)) continue;
      let x = 0;
      let y = 0;
      for (const neighbour of adjacent[vertex]) {
        x += positions[neighbour][0];
        y += positions[neighbour][1];
      }
      positions[vertex] = [
        x / adjacent[vertex].length,
        y / adjacent[vertex].length,
        0,
      ];
    }
  }
  return positions;
}

/**
 * Stress layout from shortest-path distances (disconnected pairs use the
 * diameter plus one), started from a fixed spiral so the result is
 * deterministic.
 */
function stressLayout(
  rank: number,
  edges: ReadonlyArray<readonly [number, number]>,
  dimension: 2 | 3,
): Vec3[] {
  const distance = Array.from({ length: rank }, () =>
    new Array<number>(rank).fill(Number.POSITIVE_INFINITY),
  );
  const adjacent = Array.from({ length: rank }, () => [] as number[]);
  for (const [left, right] of edges) {
    adjacent[left].push(right);
    adjacent[right].push(left);
  }
  for (let source = 0; source < rank; source += 1) {
    distance[source][source] = 0;
    const queue = [source];
    for (let head = 0; head < queue.length; head += 1) {
      const vertex = queue[head];
      for (const next of adjacent[vertex]) {
        if (distance[source][next] === Number.POSITIVE_INFINITY) {
          distance[source][next] = distance[source][vertex] + 1;
          queue.push(next);
        }
      }
    }
  }
  const finite = distance.flat().filter(Number.isFinite);
  const fallback = Math.max(1, ...finite) + 1;
  const positions: Vec3[] = Array.from({ length: rank }, (_unused, index) => {
    const z = dimension === 3 ? 1 - (2 * (index + 0.5)) / rank : 0;
    const radial = Math.sqrt(Math.max(0, 1 - z * z));
    const angle = index * GOLDEN_ANGLE;
    return [Math.cos(angle) * radial * 2, Math.sin(angle) * radial * 2, z * 2];
  });
  for (let iteration = 0; iteration < 600; iteration += 1) {
    const step = 0.1 * (1 - iteration / 650);
    for (let left = 0; left < rank; left += 1) {
      for (let right = left + 1; right < rank; right += 1) {
        const target = Number.isFinite(distance[left][right])
          ? distance[left][right]
          : fallback;
        const delta = [0, 1, 2].map(
          (axis) => positions[left][axis] - positions[right][axis],
        );
        const current = Math.max(1e-6, Math.hypot(...delta));
        const pull = (step * (current - target)) / (current * target);
        for (let axis = 0; axis < dimension; axis += 1) {
          positions[left][axis] -= delta[axis] * pull;
          positions[right][axis] += delta[axis] * pull;
        }
      }
    }
  }
  return positions;
}

function countCrossings(
  positions: readonly Vec3[],
  edges: ReadonlyArray<readonly [number, number]>,
): number {
  let crossings = 0;
  for (let left = 0; left < edges.length; left += 1) {
    for (let right = left + 1; right < edges.length; right += 1) {
      const [a, b] = edges[left];
      const [c, d] = edges[right];
      if (a === c || a === d || b === c || b === d) continue;
      if (
        segmentsCrossProperly(
          positions[a],
          positions[b],
          positions[c],
          positions[d],
        )
      ) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

/**
 * Smallest vertex-vertex or vertex-edge clearance divided by the median
 * edge length; it rejects drawings where a vertex sits on a foreign edge.
 */
function relativeSeparation(
  positions: readonly Vec3[],
  edges: ReadonlyArray<readonly [number, number]>,
): number {
  const lengths = edges
    .map(([a, b]) =>
      Math.hypot(
        positions[a][0] - positions[b][0],
        positions[a][1] - positions[b][1],
      ),
    )
    .sort((left, right) => left - right);
  const scaleLength =
    lengths.length > 0 ? lengths[Math.floor(lengths.length / 2)] : 1;
  if (scaleLength < 1e-9) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < positions.length; left += 1) {
    for (let right = left + 1; right < positions.length; right += 1) {
      minimum = Math.min(
        minimum,
        Math.hypot(
          positions[left][0] - positions[right][0],
          positions[left][1] - positions[right][1],
        ),
      );
    }
    for (const [a, b] of edges) {
      if (a === left || b === left) continue;
      minimum = Math.min(
        minimum,
        pointSegmentDistance2(positions[left], positions[a], positions[b]),
      );
    }
  }
  return minimum / scaleLength;
}

function fitRadius(positions: readonly Vec3[], radius: number): Vec3[] {
  const centre = [0, 1, 2].map(
    (axis) =>
      positions.reduce((sum, point) => sum + point[axis], 0) / positions.length,
  );
  const centred = positions.map(
    (point) =>
      [
        point[0] - centre[0],
        point[1] - centre[1],
        point[2] - centre[2],
      ] as Vec3,
  );
  const extent = Math.max(
    1e-9,
    ...centred.map((point) => Math.hypot(point[0], point[1], point[2])),
  );
  return centred.map(
    (point) =>
      [
        (point[0] / extent) * radius,
        (point[1] / extent) * radius,
        (point[2] / extent) * radius,
      ] as Vec3,
  );
}

function segmentsCrossProperly(a: Vec3, b: Vec3, c: Vec3, d: Vec3): boolean {
  const r = subtract2(b, a);
  const s = subtract2(d, c);
  const denominator = cross2(r, s);
  if (Math.abs(denominator) < 1e-10) return false;
  const offset = subtract2(c, a);
  const t = cross2(offset, s) / denominator;
  const u = cross2(offset, r) / denominator;
  return t > 1e-8 && t < 1 - 1e-8 && u > 1e-8 && u < 1 - 1e-8;
}
