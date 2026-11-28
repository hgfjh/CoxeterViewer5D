import { RotateCcw } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import type { SceneRevisionSet } from "../app/stableHash";
import {
  createGpuPickMaterial,
  cssPointInElement,
  GpuIdPicker,
  gpuPickIdToColor,
} from "./gpuPicking";
import {
  applyDenseLabelCap,
  blendOver,
  compactLabelText,
  denseLabelPinLimit,
  ensureTextContrast,
  type LabelDensityBudget,
  labelDensityBudget,
  parseHexColor,
  type PickedLabelEntry,
  rgbToHex,
  selectLabelBudget,
  selectSegmentLabelBudget,
  semanticEdgeLabelText,
} from "./labels";
import { triangulateCellBoundary } from "./cellPolygon";
import {
  dashPattern,
  medianLength,
  polylinePointAt,
  pushPolylineSegments,
  quadraticBezierPoints,
  type SceneLineStyle,
} from "./edgePath";
import {
  intersectPickingCandidateTriangles,
  PickingSpatialIndex,
  type PickingRay,
  type PickingSpatialItem,
} from "./pickingSpatialIndex";
import {
  buildSdfGlyphAtlas,
  checkSdfTextCapability,
  createSdfTextBatch,
  type SdfGlyphAtlas,
  type SdfTextBatch,
  type SdfTextLabel,
} from "./sdfTextBatch";
import {
  fallbackGeneratorColor,
  type SceneColorScheme,
  selectionColor,
  selectionNeighborColor,
  shellColor,
} from "./scenePalette";

export type LabelScope = "off" | "focused" | "budgeted";
export type LocalCellRenderMode =
  | "in-graph"
  | "lifted-panels"
  | "petals"
  | "outline-only";
export type OcclusionMode = "hide-far" | "fade-far" | "x-ray";
export type { SceneLineStyle } from "./edgePath";

export interface SceneNode {
  id: string;
  label?: string;
  compactLabel?: string;
  length: number;
  localDistance?: number;
  position?: [number, number, number];
  isRelationBoundary?: boolean;
  colorHint?: string;
  nodeScale?: number;
  stateRole?: "in-state" | "out-of-state";
  alwaysLabel?: boolean;
  labelPriority?: number;
  /** Drawing-only size multiplier for labels that must remain legible at a wide camera frame. */
  labelScale?: number;
  /**
   * Colour this vertex as generator `generatorColorIndex` (e.g. a Gamma
   * vertex is a generator) when it has no colorHint.
   */
  generatorColorIndex?: number;
  ghost?: boolean;
  hidden?: boolean;
  drawingOnly?: boolean;
}

export interface SceneEdge {
  id: string;
  source: string;
  target: string;
  generator: number;
  compactLabel?: string;
  /** Explicit semantic meaning for views whose edge labels are not generators. */
  semanticLabelKind?: "generator" | "coxeter-order";
  colorHint?: string;
  alwaysLabel?: boolean;
  isRelationBoundary?: boolean;
  labelAnchor?: [number, number, number];
  labelPosition?: [number, number, number];
  labelLeader?: boolean;
  labelPriority?: number;
  /** Drawing-only size multiplier; it does not change the semantic edge label. */
  labelScale?: number;
  suppressSemanticLabel?: boolean;
  emphasis?: "readable-boundary";
  /**
   * Why an edge is emphasised: "relation-boundary" (on a shown relation
   * cell's attaching cycle) or "wall-dual" (crossed by the selected wall).
   * Wall-dual edges are drawn in their own colorHint with a heavier dashed
   * stroke, never with the black readable-boundary stroke.
   */
  emphasisRole?: "relation-boundary" | "wall-dual";
  /** Dash cue paired with colour (walls, Gamma Coxeter orders). */
  lineStyle?: SceneLineStyle;
  /**
   * Quadratic Bézier control point; the edge is drawn as a curve pulled
   * toward it. Arrowheads, labels and picking follow the curve.
   */
  drawingControlPoint?: [number, number, number];
  selectedHighlight?: "color" | "outline";
  ghost?: boolean;
  directed?: boolean;
  /** A wall-induced direction, drawn more prominently than a generic directed edge. */
  coorientationArrow?: boolean;
  visualOffset?: number;
  drawingOnly?: boolean;
  /** Drawing aid that must remain visible above translucent cell surfaces. */
  readabilityOverlay?: boolean;
}

export interface SceneCell {
  id: string;
  generatorPair: [number, number];
  boundaryNodeIds: string[];
  localDistance?: number;
  isRelationBoundary?: boolean;
  dimension?: number;
  sourceCellId?: string;
  readabilityRole?: "focus" | "incident" | "context" | "hidden-by-cutaway";
  colorHint?: string;
  drawingOnly?: boolean;
  /**
   * Drawing-only subdivision point for a bent disk. The exact cell boundary
   * remains `boundaryNodeIds`; this point is never a vertex of the complex.
   */
  drawingInteriorPoint?: [number, number, number];
  /** Interior fold ring used to spread a disk while its true boundary stays glued. */
  drawingInteriorRing?: Array<[number, number, number]>;
}

export interface SceneGenerator {
  label: string;
  colorHint?: string;
}

export interface SceneFrameSample {
  frame: number;
  deltaMs: number;
}

export interface SpatialPickSphere {
  id: string;
  center: [number, number, number];
  radius: number;
}

export interface SpatialPickPrefilterStats {
  total: number;
  candidates: number;
  rejected: number;
  usedPrefilter: boolean;
  minimumEntryCount: number;
  padding: number;
  strategy?: "linear" | "sphere-prefilter" | "bvh" | "gpu";
  buildMs?: number;
  queryMs?: number;
}

export interface SceneRenderStats {
  runtimeId: string;
  mode: "global" | "on-graph";
  graphNodes: number;
  graphEdges: number;
  graphCells: number;
  renderedNodes: number;
  renderedEdgeSegments: number;
  renderedCells: number;
  renderedNodeLabels: number;
  renderedEdgeLabels: number;
  renderedLabelLeaders: number;
  /** Zoom level of the dense label rule at the last label rebuild. */
  labelZoomLevel?: number;
  labelRenderer: "sprite" | "sdf-batch";
  labelRendererFallbackReason?: string;
  drawCalls: number;
  triangles: number;
  frame: number;
  frameSamples: SceneFrameSample[];
  lastGraphUpdateMs: number;
  localCellRenderMode: LocalCellRenderMode;
  occlusionMode: OcclusionMode;
  renderReason: string;
  renderCount: number;
  lodNodes: {
    high: number;
    low: number;
  };
  stateNodeHighlights: {
    inState: number;
    outOfState: number;
  };
  omittedTransparentFills: number;
  /** Cells drawn as outline only because their drawn boundary crosses itself. */
  unfillableCells?: number;
  picking: SpatialPickPrefilterStats;
  workerGenerationMs?: number;
  revisions?: SceneRevisionSet;
  performanceTrace: PerformanceTraceSummary;
}

export interface PerformanceTraceSummary {
  longTaskCount: number;
  longTaskTotalMs: number;
  longTaskMaxMs: number;
  longTaskDurations: number[];
  estimatedSceneBytes: number;
}

export interface SceneViewProps {
  nodes: SceneNode[];
  edges: SceneEdge[];
  cells: SceneCell[];
  generators: SceneGenerator[];
  /**
   * Mesh topology/position version. Changing this rebuilds buffers and pick
   * proxies; ordinary selection and label changes should not touch it.
   */
  structureVersion: string;
  /**
   * Material, label, and highlight version over the current structure.
   */
  appearanceVersion: string;
  revisionSet?: SceneRevisionSet;
  /**
   * Parent-layout version. It only schedules a resize after CSS or fullscreen
   * changes so the WebGL canvas follows the restored viewer dimensions.
   */
  layoutVersion?: string | number;
  selectedNodeId?: string;
  /**
   * Extra scale for the selected node.  Lets scene builders keep node arrays
   * independent of selection, so a click is an appearance-only update.
   */
  selectedNodeScale?: number;
  selectedCellId?: string;
  showCells: boolean;
  showNodeLabels?: boolean;
  showEdgeLabels?: boolean;
  showReferenceBall?: boolean;
  referenceBallRadius?: number;
  labelScope?: LabelScope;
  activeGeneratorPair?: [number, number];
  localCellRenderMode?: LocalCellRenderMode;
  occlusionMode?: OcclusionMode;
  cellOpacity?: number;
  panelOffsetStrength?: number;
  topologyMode?: boolean;
  semanticLabelsOnly?: boolean;
  cameraFocusTarget?: [number, number, number];
  cameraFocusOffset?: [number, number, number];
  cameraPreset?: "global" | "on-graph";
  resetSignal?: number;
  focusNodeId?: string;
  focusSignal?: number;
  maxNodeLabels?: number;
  maxEdgeLabels?: number;
  pickingEnabled?: boolean;
  workerGenerationMs?: number;
  colorScheme?: SceneColorScheme;
  sceneLabel?: string;
  /**
   * Show the generator colour key. Hide it when edge colours mean something
   * else (e.g. edges coloured by wall).
   */
  showGeneratorLegend?: boolean;
  /**
   * Optional edge picking: called with the id of the edge nearest the click
   * (screen-space tolerance) when no vertex was hit.
   */
  onSelectEdge?: (edgeId: string) => void;
  onCapturePngReady?: (capture: (() => Promise<string>) | undefined) => void;
  onRenderStats?: (stats: SceneRenderStats) => void;
  onHoverCell?: (cellId: string | undefined) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectCell: (cellId: string) => void;
}

const sceneBackgroundColor: Record<SceneColorScheme, string> = {
  light: "#f6f7f9",
  dark: "#0d1117",
};
const defaultMaxNodeLabels = 80;
const defaultMaxEdgeLabels = 120;
const gpuPickingEntryThreshold = 2_500;
const sdfLabelBatchThreshold = 96;
const semanticSdfLabelBatchThreshold = 64;
const sdfAtlasCacheByteBudget = 24 * 1024 * 1024;
const unitY = new Vector3(0, 1, 0);
const unitZ = new Vector3(0, 0, 1);
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const cameraMoveFastMultiplier = 2.4;
const cameraMoveMinimumSpeed = 0.35;
const cameraMoveDistanceScale = 0.18;
const cameraMoveDirectionalScale = {
  forward: 0.72,
  strafe: 0.28,
  vertical: 0.42,
};

export interface CameraMovementIntent {
  forward: number;
  strafe: number;
  vertical: number;
  fast: boolean;
}

export interface CameraMovementAxes {
  forward: Vector3;
  right: Vector3;
  vertical: Vector3;
}

export interface CameraMovementDirectionalScale {
  forward: number;
  strafe: number;
  vertical: number;
}

function SceneViewComponent({
  nodes,
  edges,
  cells,
  generators,
  structureVersion,
  appearanceVersion,
  revisionSet,
  layoutVersion = 0,
  selectedNodeId,
  selectedNodeScale = 1,
  selectedCellId,
  showCells,
  showNodeLabels = false,
  showEdgeLabels = false,
  showReferenceBall = false,
  referenceBallRadius = 1,
  labelScope = "budgeted",
  activeGeneratorPair,
  localCellRenderMode = "in-graph",
  occlusionMode = "hide-far",
  cellOpacity = 0.24,
  panelOffsetStrength = 0.18,
  topologyMode = false,
  semanticLabelsOnly = false,
  cameraFocusTarget,
  cameraFocusOffset,
  cameraPreset = "global",
  resetSignal = 0,
  focusNodeId,
  focusSignal = 0,
  maxNodeLabels = defaultMaxNodeLabels,
  maxEdgeLabels = defaultMaxEdgeLabels,
  pickingEnabled = true,
  workerGenerationMs,
  colorScheme = "light",
  sceneLabel = "Coxeter viewer scene",
  showGeneratorLegend = true,
  onSelectEdge,
  onCapturePngReady,
  onRenderStats,
  onHoverCell,
  onSelectNode,
  onSelectCell,
}: SceneViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererStateRef = useRef<SceneRuntime | null>(null);

  const nodePositions = useMemo(() => {
    const positions = new Map<string, Vector3>();
    for (const node of nodes) {
      const position = node.position ?? [0, 0, 0];
      positions.set(
        node.id,
        new Vector3(position[0], position[1], position[2]),
      );
    }
    return positions;
  }, [nodes]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const runtime = createRuntime(mount);
    if (!runtime) {
      // Three owns the canvas inside this mount. Leave the rest of the app
      // available when the browser cannot provide the renderer's WebGL context.
      const message = document.createElement("p");
      message.className = "warning-inline";
      message.setAttribute("role", "alert");
      message.textContent =
        "The 3D view needs WebGL 2. Enable hardware acceleration or open the viewer in a browser with WebGL 2 support.";
      mount.appendChild(message);
      return () => message.remove();
    }
    rendererStateRef.current = runtime;

    return () => {
      rendererStateRef.current = null;
      runtime.dispose();
    };
  }, []);

  useEffect(() => {
    const runtime = rendererStateRef.current;
    if (!runtime) {
      return;
    }
    runtime.updateGraph({
      nodes,
      edges,
      cells,
      generators,
      structureVersion,
      appearanceVersion,
      revisionSet,
      layoutVersion: String(layoutVersion),
      selectedNodeId,
      selectedNodeScale,
      selectedCellId,
      showCells,
      showNodeLabels,
      showEdgeLabels,
      showReferenceBall,
      referenceBallRadius,
      labelScope,
      activeGeneratorPair,
      localCellRenderMode,
      occlusionMode,
      cellOpacity,
      panelOffsetStrength,
      topologyMode,
      semanticLabelsOnly,
      cameraFocusTarget,
      cameraFocusOffset,
      cameraPreset,
      resetSignal,
      focusNodeId,
      focusSignal,
      maxNodeLabels,
      maxEdgeLabels,
      pickingEnabled,
      workerGenerationMs,
      colorScheme,
      onRenderStats,
      onHoverCell,
      nodePositions,
      onSelectNode,
      onSelectCell,
      onSelectEdge,
    });
  }, [
    appearanceVersion,
    cells,
    edges,
    generators,
    layoutVersion,
    nodePositions,
    nodes,
    onSelectCell,
    onSelectEdge,
    onSelectNode,
    maxEdgeLabels,
    maxNodeLabels,
    onRenderStats,
    onHoverCell,
    pickingEnabled,
    selectedCellId,
    selectedNodeId,
    selectedNodeScale,
    colorScheme,
    showReferenceBall,
    referenceBallRadius,
    labelScope,
    activeGeneratorPair,
    localCellRenderMode,
    occlusionMode,
    cellOpacity,
    panelOffsetStrength,
    topologyMode,
    semanticLabelsOnly,
    cameraFocusTarget,
    cameraFocusOffset,
    cameraPreset,
    resetSignal,
    focusNodeId,
    focusSignal,
    structureVersion,
    revisionSet,
    workerGenerationMs,
    showCells,
    showEdgeLabels,
    showNodeLabels,
  ]);

  useEffect(() => {
    const runtime = rendererStateRef.current;
    onCapturePngReady?.(runtime ? () => runtime.capturePng() : undefined);
    return () => onCapturePngReady?.(undefined);
  }, [onCapturePngReady]);

  return (
    <section className="scene-shell" aria-label={sceneLabel}>
      <div ref={mountRef} className="scene-canvas" data-testid="scene-canvas" />
      <button
        type="button"
        className="icon-button scene-reset"
        aria-label="Reset camera"
        title="Reset camera"
        onClick={() => rendererStateRef.current?.resetCamera()}
      >
        <RotateCcw size={18} aria-hidden="true" />
      </button>
      {showGeneratorLegend ? (
        <GeneratorLegend generators={generators} colorScheme={colorScheme} />
      ) : null}
    </section>
  );
}

const legendTheme: Record<
  SceneColorScheme,
  { background: string; border: string; text: string; muted: string }
> = {
  light: {
    background: "rgba(255, 255, 255, 0.92)",
    border: "rgba(36, 41, 47, 0.18)",
    text: "#1f2328",
    muted: "#57606a",
  },
  dark: {
    background: "rgba(17, 24, 39, 0.9)",
    border: "rgba(148, 163, 184, 0.35)",
    text: "#e6edf3",
    muted: "#9ba7b4",
  },
};

/**
 * Collapsible key from generator colour to generator label. Labels are
 * listed next to every swatch, so the key does not rely on colour alone.
 */
function GeneratorLegend({
  generators,
  colorScheme,
}: {
  generators: SceneGenerator[];
  colorScheme: SceneColorScheme;
}) {
  const [open, setOpen] = useState(true);
  if (generators.length === 0) {
    return null;
  }
  const theme = legendTheme[colorScheme];
  return (
    <div
      className="scene-generator-legend"
      data-testid="scene-generator-legend"
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        zIndex: 2,
        maxWidth: "min(46%, 260px)",
        maxHeight: "40%",
        overflowY: "auto",
        padding: "6px 8px",
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: theme.background,
        color: theme.text,
        font: "500 12px/1.3 system-ui, sans-serif",
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="scene-generator-legend-list"
        onClick={() => setOpen((value) => !value)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "block",
          color: theme.muted,
          fontWeight: 600,
        }}
      >
        {open ? "Generators ▾" : "Generators ▸"}
      </button>
      {open ? (
        <ul
          id="scene-generator-legend-list"
          aria-label="Generator colors"
          style={{
            listStyle: "none",
            margin: "4px 0 0",
            padding: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: "3px 10px",
          }}
        >
          {generators.map((generator, index) => (
            <li
              key={`${index}:${generator.label}`}
              style={{ display: "flex", alignItems: "center", gap: 5 }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 4,
                  borderRadius: 2,
                  background: generatorColor(generators, index, colorScheme),
                }}
              />
              <span>{generator.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Most application controls do not change scene props. Memoization keeps those
// React updates out of the renderer boundary altogether; revision tokens still
// decide which Three.js layers need work when a scene prop does change.
export const SceneView = memo(SceneViewComponent);
SceneView.displayName = "SceneView";

interface GraphUpdate {
  nodes: SceneNode[];
  edges: SceneEdge[];
  cells: SceneCell[];
  generators: SceneGenerator[];
  structureVersion: string;
  appearanceVersion: string;
  revisionSet?: SceneRevisionSet;
  layoutVersion: string;
  selectedNodeId?: string;
  selectedNodeScale: number;
  selectedCellId?: string;
  showCells: boolean;
  showNodeLabels: boolean;
  showEdgeLabels: boolean;
  showReferenceBall: boolean;
  referenceBallRadius: number;
  labelScope: LabelScope;
  activeGeneratorPair?: [number, number];
  localCellRenderMode: LocalCellRenderMode;
  occlusionMode: OcclusionMode;
  cellOpacity: number;
  panelOffsetStrength: number;
  topologyMode: boolean;
  semanticLabelsOnly: boolean;
  cameraFocusTarget?: [number, number, number];
  cameraFocusOffset?: [number, number, number];
  cameraPreset: "global" | "on-graph";
  resetSignal: number;
  focusNodeId?: string;
  focusSignal: number;
  maxNodeLabels: number;
  maxEdgeLabels: number;
  pickingEnabled: boolean;
  workerGenerationMs?: number;
  colorScheme: SceneColorScheme;
  onRenderStats?: (stats: SceneRenderStats) => void;
  onHoverCell?: (cellId: string | undefined) => void;
  nodePositions: Map<string, Vector3>;
  onSelectNode: (nodeId: string) => void;
  onSelectCell: (cellId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
}

interface CellVisualBucket {
  pairKey: string;
  pair: [number, number];
  styleCell: SceneCell;
  fillMaterial?: MeshBasicMaterial;
  outlineMaterial?: LineBasicMaterial;
}

interface ArrowHeadBucket {
  color: string;
  ghost: boolean;
  coorientation: boolean;
  matrices: Matrix4[];
}

interface NodeMeshBucket {
  mesh: InstancedMesh;
  nodeIds: string[];
}

interface LabelFadeEntry {
  anchor: Vector3;
  /** Selection context labels never fade. */
  pinned: boolean;
  sprite?: Sprite;
  sdfId?: string;
  opacity: number;
  /** Extra factor, e.g. for labels outside the "fade-far" focus. */
  scale?: number;
}

interface GpuPickRecord {
  kind: "node" | "cell";
  id: string;
}

interface EdgeLabelCandidate {
  edge: SceneEdge;
  label: string;
  priority: number;
}

interface EdgeLabelPlacement {
  labelPosition: Vector3;
  anchor: Vector3;
}

declare global {
  interface Window {
    __coxeterSceneStats?: SceneRenderStats;
  }
}

let nextSceneRuntimeId = 1;

class SceneRuntime {
  private readonly runtimeId = `scene-runtime-${nextSceneRuntimeId++}`;
  private readonly scene = new Scene();
  private readonly gpuPickingScene = new Scene();
  private readonly gpuNodePickingScene = new Scene();
  private readonly camera = new PerspectiveCamera(55, 1, 0.1, 10_000);
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly gpuIdPicker = new GpuIdPicker();
  private readonly pointer = new Vector2();
  private pointerDownPosition: { x: number; y: number } | undefined;
  private readonly nodeGroup = new Group();
  private readonly edgeGroup = new Group();
  private readonly edgeOverlayGroup = new Group();
  private readonly cellGroup = new Group();
  private readonly cellOverlayGroup = new Group();
  private readonly labelGroup = new Group();
  private readonly referenceGroup = new Group();
  private readonly resizeObserver: ResizeObserver;
  private resizeFrame: number | undefined;
  private readonly resizeFallbacks = new Set<number>();
  private viewportWidth = 0;
  private viewportHeight = 0;
  private viewportPixelRatio = 0;
  private animationFrame: number | undefined;
  private dampingFramesRemaining = 0;
  private framedGraphKey = "";
  /** Camera-to-target distance chosen by the last automatic framing. */
  private framedCameraDistance = 0;
  /** Camera position of the last automatic framing (undefined until the first frame). */
  private framedCameraPosition: Vector3 | undefined;
  private labelZoomLevelBuilt = 0;
  private labelZoomTimer: number | undefined;
  private appliedLabelScreenScale = 1;
  private lastStructureKey = "";
  private lastAppearanceKey = "";
  private lastRevisionSet: SceneRevisionSet | undefined;
  private lastLayoutVersion = "";
  private lastResetSignal = 0;
  private lastFocusSignal = 0;
  private nodeMeshes: NodeMeshBucket[] = [];
  private cellBuckets: CellVisualBucket[] = [];
  private cellGeometryCache = new Map<string, BufferGeometry>();
  private cellVerticesById = new Map<string, Vector3[]>();
  /** Cells with a drawn hit area (see addCells); others are not pickable. */
  private pickableCellIds = new Set<string>();
  private readonly cellPickingIndex = new PickingSpatialIndex<SceneCell>({
    leafSize: 8,
  });
  private cellPickingBuildMs = 0;
  private readonly gpuPickRecords = new Map<number, GpuPickRecord>();
  private gpuPickingActive = false;
  private gpuPickEpoch = 0;
  private gpuHoverRequest = 0;
  private nodeLookupSource: SceneNode[] | undefined;
  private nodesById = new Map<string, SceneNode>();
  private adjacencySource: SceneEdge[] | undefined;
  private neighborIdsByNode = new Map<string, Set<string>>();
  private readonly emptyNeighborIds = new Set<string>();
  private onSelectNode: (nodeId: string) => void = () => undefined;
  private onSelectCell: (cellId: string) => void = () => undefined;
  private onSelectEdge: ((edgeId: string) => void) | undefined;
  private onHoverCell: ((cellId: string | undefined) => void) | undefined;
  private hoveredCellId: string | undefined;
  private pendingHoverPoint: { x: number; y: number } | undefined;
  private hoverFrame: number | undefined;
  private onRenderStats: ((stats: SceneRenderStats) => void) | undefined;
  private pickingEnabled = true;
  private stats: SceneRenderStats = emptySceneStats(this.runtimeId);
  private lastDetailedStatsPublishAt = 0;
  private notifyStatsOnNextRender = false;
  private longTaskObserver: PerformanceObserver | undefined;
  private frame = 0;
  private previousFrameTime = performance.now();
  private lastGraphUpdate: GraphUpdate | undefined;
  private readonly movementKeys = new Set<string>();
  private fastCameraMove = false;
  private cameraInteractionActive = false;
  private colorScheme: SceneColorScheme = "light";
  private readonly sdfTextCapability = checkSdfTextCapability();
  private sdfTextAvailable = this.sdfTextCapability.supported;
  private sdfTextFallbackReason = this.sdfTextCapability.reason;
  private activeSdfBatch: SdfTextBatch | undefined;
  /** Labels whose opacity follows their depth behind the orbit target. */
  private labelFadeEntries: LabelFadeEntry[] = [];
  private labelFadeCameraKey = "";
  /** Radius of the last automatic framing, the depth scale of label fading. */
  private framedSceneRadius = 1;
  /** Median drawn edge length; dash patterns are measured in this unit. */
  private edgeDashUnit = 1;
  private readonly sdfAtlasCache = new Map<string, SdfGlyphAtlas>();
  private sdfAtlasCacheBytes = 0;

  constructor(
    private readonly mount: HTMLDivElement,
    private readonly renderer: WebGLRenderer,
  ) {
    this.stats.labelRendererFallbackReason = this.sdfTextFallbackReason;
    this.setColorScheme("light");
    this.camera.position.set(0, -9, 6);

    this.viewportPixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.viewportWidth = Math.max(1, mount.clientWidth);
    this.viewportHeight = Math.max(1, mount.clientHeight);
    this.renderer.setPixelRatio(this.viewportPixelRatio);
    this.renderer.setSize(this.viewportWidth, this.viewportHeight);
    mount.appendChild(this.renderer.domElement);
    // Shader error checking reads program info logs synchronously after every
    // compile, stalling the GPU pipeline.  Keep it for development only.
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.installLongTaskObserver();

    const ambient = new AmbientLight("#ffffff", 1.9);
    const directional = new DirectionalLight("#ffffff", 1.8);
    directional.position.set(6, -8, 8);
    this.scene.add(
      ambient,
      directional,
      this.referenceGroup,
      this.cellGroup,
      this.cellOverlayGroup,
      this.edgeGroup,
      this.edgeOverlayGroup,
      this.nodeGroup,
      this.labelGroup,
    );

    this.renderer.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
    );
    this.renderer.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
    );
    this.renderer.domElement.addEventListener(
      "pointermove",
      this.handlePointerMove,
    );
    this.controls.addEventListener("start", this.handleControlsStart);
    this.controls.addEventListener("change", this.handleControlsChange);
    this.controls.addEventListener("end", this.handleControlsEnd);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleWindowBlur);
    this.resizeObserver = new ResizeObserver(() => this.resize("resize"));
    this.resizeObserver.observe(mount);
    this.requestRender("init");
  }

  updateGraph(update: GraphUpdate) {
    this.lastGraphUpdate = update;
    this.onSelectNode = update.onSelectNode;
    this.onSelectCell = update.onSelectCell;
    this.onSelectEdge = update.onSelectEdge;
    this.onHoverCell = update.onHoverCell;
    this.onRenderStats = update.onRenderStats;
    this.pickingEnabled = update.pickingEnabled;
    // Theme is not part of the revision keys, so a theme switch must force
    // the node colors and label chips to be rebuilt here.
    const themeChanged = this.setColorScheme(update.colorScheme);
    this.ensureSceneLookups(update);
    if (update.layoutVersion !== this.lastLayoutVersion) {
      this.lastLayoutVersion = update.layoutVersion;
      this.scheduleResize("layout-change");
    }
    const structureKey = update.structureVersion;
    const appearanceKey = update.appearanceVersion;
    // The renderer is demand-driven. A stable structure/appearance pair means
    // React re-rendered controls, not the Three.js scene.
    if (
      !themeChanged &&
      structureKey === this.lastStructureKey &&
      appearanceKey === this.lastAppearanceKey
    ) {
      this.handleCameraSignals(update);
      this.publishStats();
      return;
    }

    const updateStartedAt = performance.now();
    const structureChanged = structureKey !== this.lastStructureKey;
    const previousRevisions = this.lastRevisionSet;
    if (structureChanged) {
      this.lastStructureKey = structureKey;
      this.rebuildStructure(update);
    }

    this.lastAppearanceKey = appearanceKey;
    // Frame before building labels: edge-label collision checks project
    // through the camera, and density caps read the framed distance.
    this.frameGraph(update);
    const appearanceLayerChanged =
      themeChanged ||
      structureChanged ||
      !update.revisionSet ||
      !previousRevisions ||
      update.revisionSet.appearanceVersion !==
        previousRevisions.appearanceVersion;
    const labelLayerChanged =
      themeChanged ||
      structureChanged ||
      !update.revisionSet ||
      !previousRevisions ||
      update.revisionSet.labelVersion !== previousRevisions.labelVersion;
    if (appearanceLayerChanged) {
      this.updateVisualAppearance(update);
    }
    if (labelLayerChanged) {
      this.updateLabelAppearance(update);
    }
    this.lastRevisionSet = update.revisionSet;
    this.handleCameraSignals(update);
    this.stats = {
      ...this.stats,
      mode: update.cameraPreset,
      graphNodes: update.nodes.length,
      graphEdges: update.edges.length,
      graphCells: update.cells.length,
      lastGraphUpdateMs: performance.now() - updateStartedAt,
      localCellRenderMode: update.localCellRenderMode,
      occlusionMode: update.occlusionMode,
      workerGenerationMs: update.workerGenerationMs,
      revisions: update.revisionSet,
    };
    this.notifyStatsOnNextRender = true;
    this.requestRender("scene-update");
  }

  resetCamera() {
    if (this.lastGraphUpdate) {
      this.framedGraphKey = "";
      this.frameGraph(this.lastGraphUpdate);
      this.requestRender("camera-reset");
      return;
    }

    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, -9, 6);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.requestRender("camera-reset");
  }

  async capturePng(): Promise<string> {
    const width = Math.max(1, this.renderer.domElement.width);
    const height = Math.max(1, this.renderer.domElement.height);
    const renderTarget = new WebGLRenderTarget(width, height);
    const pixels = new Uint8Array(width * height * 4);
    // Screenshots render into a temporary target so preserveDrawingBuffer can
    // stay disabled during normal interaction.
    this.renderer.setRenderTarget(renderTarget);
    this.render("screenshot");
    this.renderer.readRenderTargetPixels(
      renderTarget,
      0,
      0,
      width,
      height,
      pixels,
    );
    this.renderer.setRenderTarget(null);
    renderTarget.dispose();

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2D canvas context is required for screenshot export.");
    }
    const imageData = context.createImageData(width, height);
    for (let row = 0; row < height; row += 1) {
      const sourceRow = height - row - 1;
      const sourceOffset = sourceRow * width * 4;
      const targetOffset = row * width * 4;
      imageData.data.set(
        pixels.subarray(sourceOffset, sourceOffset + width * 4),
        targetOffset,
      );
    }
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  dispose() {
    if (this.animationFrame !== undefined) {
      window.cancelAnimationFrame(this.animationFrame);
    }
    if (this.hoverFrame !== undefined) {
      window.cancelAnimationFrame(this.hoverFrame);
    }
    if (this.labelZoomTimer !== undefined) {
      window.clearTimeout(this.labelZoomTimer);
    }
    if (this.resizeFrame !== undefined) {
      window.cancelAnimationFrame(this.resizeFrame);
    }
    for (const timeoutId of this.resizeFallbacks) {
      window.clearTimeout(timeoutId);
    }
    this.resizeFallbacks.clear();
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
    );
    this.renderer.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
    );
    this.renderer.domElement.removeEventListener(
      "pointermove",
      this.handlePointerMove,
    );
    this.controls.removeEventListener("start", this.handleControlsStart);
    this.controls.removeEventListener("change", this.handleControlsChange);
    this.controls.removeEventListener("end", this.handleControlsEnd);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleWindowBlur);
    this.longTaskObserver?.disconnect();
    this.controls.dispose();
    this.releaseLabelSprites();
    for (const atlas of this.sdfAtlasCache.values()) {
      atlas.dispose();
    }
    this.sdfAtlasCache.clear();
    this.sdfAtlasCacheBytes = 0;
    clearGroup(this.scene);
    clearGroup(this.gpuPickingScene);
    clearGroup(this.gpuNodePickingScene);
    this.gpuIdPicker.dispose();
    this.cellPickingIndex.clear();
    for (const geometry of this.cellGeometryCache.values()) {
      geometry.dispose();
    }
    this.cellGeometryCache.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private installLongTaskObserver() {
    if (typeof PerformanceObserver === "undefined") {
      return;
    }
    try {
      this.longTaskObserver = new PerformanceObserver((list) => {
        let longTaskCount = this.stats.performanceTrace.longTaskCount;
        let longTaskTotalMs = this.stats.performanceTrace.longTaskTotalMs;
        let longTaskMaxMs = this.stats.performanceTrace.longTaskMaxMs;
        const longTaskDurations = [
          ...this.stats.performanceTrace.longTaskDurations,
        ];
        for (const entry of list.getEntries()) {
          longTaskCount += 1;
          longTaskTotalMs += entry.duration;
          longTaskMaxMs = Math.max(longTaskMaxMs, entry.duration);
          longTaskDurations.push(Number(entry.duration.toFixed(3)));
        }
        this.stats = {
          ...this.stats,
          performanceTrace: {
            ...this.stats.performanceTrace,
            longTaskCount,
            longTaskTotalMs,
            longTaskMaxMs,
            longTaskDurations,
          },
        };
        this.publishStats();
      });
      this.longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      this.longTaskObserver = undefined;
    }
  }

  private rebuildStructure(update: GraphUpdate) {
    clearGroup(this.nodeGroup);
    clearGroup(this.edgeGroup);
    clearGroup(this.edgeOverlayGroup);
    this.clearCellVisualGroup();
    clearGroup(this.cellOverlayGroup);
    this.releaseLabelSprites();
    clearGroup(this.referenceGroup);
    this.cellPickingIndex.clear();
    clearGroup(this.gpuPickingScene);
    clearGroup(this.gpuNodePickingScene);
    this.gpuPickRecords.clear();
    this.gpuPickEpoch += 1;
    this.gpuPickingActive =
      update.nodes.length + (update.showCells ? update.cells.length : 0) >=
      gpuPickingEntryThreshold;
    this.nodeMeshes = [];
    this.cellBuckets = [];
    this.cellVerticesById = new Map();
    this.pickableCellIds = new Set();

    this.edgeDashUnit = sceneDashUnit(update);
    this.addReferenceBall(update);
    const renderedCells = this.addCells(update);
    const renderedEdgeSegments = this.addEdges(update);
    const renderedNodes = this.addNodes(update);
    if (this.gpuPickingActive) {
      this.buildGpuPickingScene(update);
    }
    this.stats = {
      ...this.stats,
      renderedNodes,
      renderedEdgeSegments,
      renderedCells,
      renderedNodeLabels: 0,
      renderedEdgeLabels: 0,
      renderedLabelLeaders: 0,
      picking: emptySpatialPickStats(),
      performanceTrace: {
        ...this.stats.performanceTrace,
        estimatedSceneBytes: estimateSceneBytes(update),
      },
    };
  }

  private buildGpuPickingScene(update: GraphUpdate): void {
    let nextPickId = 1;
    const visibleNodes = update.nodes.filter((node) => !node.hidden);
    if (visibleNodes.length > 0) {
      const geometry = new SphereGeometry(0.1, 6, 4);
      const colors = new Float32Array(visibleNodes.length * 3);
      const mesh = new InstancedMesh(
        geometry,
        createGpuPickMaterial(true),
        visibleNodes.length,
      );
      const transform = new Object3D();
      visibleNodes.forEach((node, index) => {
        const position = update.nodePositions.get(node.id);
        if (!position) {
          transform.scale.setScalar(0);
        } else {
          transform.position.copy(position);
          // Use the largest ordinary node scale so the adaptive picker does
          // not become harder to hit when appearance-only selection changes.
          transform.scale.setScalar(1.55 * (node.nodeScale ?? 1));
        }
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        const pickId = nextPickId++;
        this.gpuPickRecords.set(pickId, { kind: "node", id: node.id });
        colors.set(gpuPickIdToColor(pickId), index * 3);
      });
      geometry.setAttribute(
        "pickColor",
        new InstancedBufferAttribute(colors, 3),
      );
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.gpuNodePickingScene.add(mesh);
    }

    const positions: number[] = [];
    const colors: number[] = [];
    if (update.showCells) {
      for (const cell of update.cells) {
        const vertices = this.cellVerticesById.get(cell.id);
        if (
          !vertices ||
          vertices.length < 3 ||
          !this.pickableCellIds.has(cell.id)
        ) {
          continue;
        }
        const pickId = nextPickId++;
        const pickColor = gpuPickIdToColor(pickId);
        this.gpuPickRecords.set(pickId, { kind: "cell", id: cell.id });
        const cellCoordinates: number[] = [];
        pushCellFillCoordinates(
          cellCoordinates,
          vertices,
          cellDrawingSurface(cell, update.localCellRenderMode),
        );
        positions.push(...cellCoordinates);
        for (let index = 0; index < cellCoordinates.length / 3; index += 1) {
          colors.push(...pickColor);
        }
      }
    }
    if (positions.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(positions), 3),
      );
      geometry.setAttribute(
        "pickColor",
        new BufferAttribute(new Float32Array(colors), 3),
      );
      const mesh = new Mesh(geometry, createGpuPickMaterial(false));
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      this.gpuPickingScene.add(mesh);
    }
  }

  private updateVisualAppearance(update: GraphUpdate) {
    this.updateNodeAppearance(update);
    clearGroup(this.edgeOverlayGroup);
    this.addEdgeOverlays(update);
    this.addSelectionRing(update);
    this.updateCellAppearance(update);
    clearGroup(this.cellOverlayGroup);
    this.addCellSelectionOverlay(update);
  }

  private updateLabelAppearance(update: GraphUpdate) {
    this.releaseLabelSprites();
    this.stats.labelRenderer = "sprite";
    this.stats.labelRendererFallbackReason = this.sdfTextFallbackReason;
    const renderedLabels = this.addLabels(update);
    this.stats = {
      ...this.stats,
      renderedNodeLabels: renderedLabels.nodes,
      renderedEdgeLabels: renderedLabels.edges,
      renderedLabelLeaders: renderedLabels.leaders,
      labelZoomLevel: this.labelZoomLevelBuilt,
    };
  }

  private addNodes(update: GraphUpdate): number {
    const visibleNodes = update.nodes.filter((node) => !node.hidden);
    const highNodes = visibleNodes.filter((node) =>
      isHighDetailNode(node, update),
    );
    const lowNodes = visibleNodes.filter(
      (node) => !isHighDetailNode(node, update),
    );
    this.nodeMeshes = [
      this.createNodeMeshBucket(highNodes, new SphereGeometry(0.09, 12, 8)),
      this.createNodeMeshBucket(lowNodes, new SphereGeometry(0.075, 6, 4)),
    ].filter((bucket) => bucket.nodeIds.length > 0);
    for (const bucket of this.nodeMeshes) {
      this.nodeGroup.add(bucket.mesh);
    }
    this.stats.lodNodes = {
      high: highNodes.length,
      low: lowNodes.length,
    };
    this.stats.stateNodeHighlights = countStateNodeHighlights(visibleNodes);
    this.updateNodeAppearance(update);
    return visibleNodes.length;
  }

  private createNodeMeshBucket(
    nodes: SceneNode[],
    geometry: SphereGeometry,
  ): NodeMeshBucket {
    // Instance colors need no vertexColors flag. With vertexColors=true the
    // shader also multiplies by the sphere's (absent) color attribute, which
    // WebGL reads as black, so every vertex was drawn black in both themes.
    const material = new MeshBasicMaterial();
    const mesh = new InstancedMesh(geometry, material, nodes.length);
    mesh.userData.kind = "nodes";
    return {
      mesh,
      nodeIds: nodes.map((node) => node.id),
    };
  }

  private updateNodeAppearance(update: GraphUpdate) {
    if (this.nodeMeshes.length === 0) {
      return;
    }
    const transform = new Matrix4();
    const color = new Color();
    const temp = new Object3D();
    const selectedNeighbors = this.neighborsFor(update.selectedNodeId);

    for (const bucket of this.nodeMeshes) {
      bucket.nodeIds.forEach((nodeId, index) => {
        const node = this.nodesById.get(nodeId);
        const position = node ? update.nodePositions.get(node.id) : undefined;
        if (!node || node.hidden || !position) {
          temp.scale.setScalar(0);
          temp.updateMatrix();
          bucket.mesh.setMatrixAt(index, temp.matrix);
          return;
        }
        const selected = node.id === update.selectedNodeId;
        const neighbor = selectedNeighbors.has(node.id);
        const scale = selected
          ? 1.85
          : node.isRelationBoundary
            ? 1.45
            : neighbor
              ? 1.28
              : node.ghost
                ? 0.72
                : 1;
        temp.position.copy(position);
        temp.scale.setScalar(
          scale *
            (node.nodeScale ?? 1) *
            (selected ? update.selectedNodeScale : 1),
        );
        temp.updateMatrix();
        transform.copy(temp.matrix);
        bucket.mesh.setMatrixAt(index, transform);
        const dark = update.colorScheme === "dark";
        color.set(
          node.stateRole
            ? nodeColor(
                node,
                update.occlusionMode,
                update.colorScheme,
                update.generators,
              )
            : selected
              ? selectionColor[update.colorScheme]
              : node.isRelationBoundary
                ? dark
                  ? "#ff7b72"
                  : "#b42318"
                : neighbor
                  ? selectionNeighborColor[update.colorScheme]
                  : nodeColor(
                      node,
                      update.occlusionMode,
                      update.colorScheme,
                      update.generators,
                    ),
        );
        bucket.mesh.setColorAt(index, color);
      });

      bucket.mesh.instanceMatrix.needsUpdate = true;
      if (bucket.mesh.instanceColor) {
        bucket.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private clearCellVisualGroup() {
    for (const child of [...this.cellGroup.children]) {
      child.removeFromParent();
      if ("material" in child) {
        const material = child.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => disposeMaterial(entry));
        } else if (material instanceof Material) {
          disposeMaterial(material);
        }
      }
    }
  }

  private releaseLabelSprites() {
    this.activeSdfBatch?.dispose();
    this.activeSdfBatch = undefined;
    for (const entry of this.labelFadeEntries) {
      if (entry.sprite) {
        entry.sprite.material.opacity = 1;
      }
    }
    this.labelFadeEntries = [];
    this.labelFadeCameraKey = "";
    for (const child of [...this.labelGroup.children]) {
      child.removeFromParent();
      if (child instanceof Sprite) {
        releaseTextSprite(child);
        continue;
      }
      if ("geometry" in child && child.geometry instanceof BufferGeometry) {
        child.geometry.dispose();
      }
      if ("material" in child) {
        const material = child.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => disposeMaterial(entry));
        } else if (material instanceof Material) {
          disposeMaterial(material);
        }
      }
    }
  }

  private addEdges(update: GraphUpdate): number {
    const renderEdges = selectRenderableEdges(update);
    const edgeBuckets = new Map<
      string,
      { color: string; coordinates: number[] }
    >();
    const arrowBuckets = new Map<string, ArrowHeadBucket>();
    const arrowDirection = new Vector3();
    const arrowObject = new Object3D();
    let renderedEdgeSegments = 0;

    for (const edge of renderEdges) {
      const source = update.nodePositions.get(edge.source);
      const target = update.nodePositions.get(edge.target);
      if (!source || !target) {
        continue;
      }
      const color = edgeColor(edge, update);
      const tier = edge.ghost
        ? "ghost"
        : this.edgeIsFar(edge, update)
          ? "far"
          : "main";
      const bucketKey = `${color}:${tier}`;
      const bucket = edgeBuckets.get(bucketKey) ?? {
        color,
        coordinates: [],
      };
      const path = edgePathPoints(edge, source, target, update);
      if (path) {
        pushPolylineSegments(
          bucket.coordinates,
          path,
          dashPattern(edge.lineStyle),
          this.edgeDashUnit,
        );
      } else {
        bucket.coordinates.push(
          ...loopEdgeCoordinates(
            source,
            edge.generator,
            update.generators.length,
          ),
        );
      }
      edgeBuckets.set(bucketKey, bucket);
      renderedEdgeSegments += 1;

      const arrowChord = path ? arrowChordForPath(path) : undefined;
      if (edge.directed && arrowChord) {
        const matrix = arrowHeadMatrix(
          arrowChord[0],
          arrowChord[1],
          arrowDirection,
          arrowObject,
          edge.coorientationArrow ? 1.35 : 1,
        );
        if (matrix) {
          const arrowKey = `${color}:${edge.ghost ? "ghost" : "main"}:${edge.coorientationArrow ? "wall" : "edge"}`;
          const arrowBucket = arrowBuckets.get(arrowKey) ?? {
            color,
            ghost: Boolean(edge.ghost),
            coorientation: Boolean(edge.coorientationArrow),
            matrices: [],
          };
          arrowBucket.matrices.push(matrix);
          arrowBuckets.set(arrowKey, arrowBucket);
        }
      }
    }

    // Geometry is batched by rendered material state. Generator identity stays
    // on the edge records used for labels and picking; putting it in this key
    // would only multiply draw calls, and would merge wall colors incorrectly.
    for (const [bucketKey, bucket] of edgeBuckets) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(bucket.coordinates), 3),
      );
      const ghost = bucketKey.endsWith(":ghost");
      const far = bucketKey.endsWith(":far");
      const material = new LineBasicMaterial({
        color: bucket.color,
        transparent: true,
        // Edges are the 1-skeleton and must stay legible over translucent
        // cell fills, so they are drawn nearly opaque.
        opacity: ghost ? 0.14 : far ? farEdgeOpacity : 0.92,
      });
      this.edgeGroup.add(createStableLineSegments(geometry, material));
    }

    for (const bucket of arrowBuckets.values()) {
      const geometry = new ConeGeometry(0.055, arrowConeHeight, 12);
      // Depth tested, so arrows behind other geometry are hidden like the
      // edges they belong to. The polygon offset pulls them slightly toward
      // the camera so they win against the translucent cells they sit on.
      const material = new MeshBasicMaterial({
        color: bucket.color,
        transparent: true,
        opacity: bucket.ghost ? 0.18 : 0.95,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new InstancedMesh(
        geometry,
        material,
        bucket.matrices.length,
      );
      bucket.matrices.forEach((matrix, index) =>
        mesh.setMatrixAt(index, matrix),
      );
      mesh.instanceMatrix.needsUpdate = true;
      // Instanced arrowheads are tiny meshes spread across the whole graph.
      // Three.js bounds them by the source cone unless we opt out, which can
      // make directed edges disappear while orbiting dense local views.
      mesh.frustumCulled = false;
      mesh.renderOrder = bucket.coorientation ? 40 : 0;
      mesh.userData.kind = "edge-arrowheads";
      this.edgeGroup.add(mesh);
    }

    return renderedEdgeSegments;
  }

  private addEdgeOverlays(update: GraphUpdate): void {
    // Edges at the selected vertex keep their generator colour (the point of
    // selecting a vertex is to read its generators); they are only redrawn
    // opaque above the translucent cells.
    const highlightByColor = new Map<string, number[]>();
    const outlineHighlightCoordinates: number[] = [];
    const boundaryCoordinates: number[] = [];
    const readableBoundaryCoordinates: number[] = [];
    const wallDualOverlays = new Map<string, number[]>();
    const readabilityOverlays = new Map<
      string,
      { color: string; ghost: boolean; coordinates: number[] }
    >();

    for (const edge of update.edges) {
      const source = update.nodePositions.get(edge.source);
      const target = update.nodePositions.get(edge.target);
      if (!source || !target) {
        continue;
      }
      const coordinates = edgeCoordinates(
        edge,
        source,
        target,
        update,
        this.edgeDashUnit,
      );
      // Gamma edges are relations drawn in a neutral colour with a dash cue
      // for the order; the red/black relation-boundary strokes would hide
      // that cue, so they are not applied to coxeter-order edges.
      const relationOrderEdge = edge.semanticLabelKind === "coxeter-order";
      const wallDual = edge.emphasisRole === "wall-dual";

      if (edge.isRelationBoundary && !edge.colorHint && !relationOrderEdge) {
        boundaryCoordinates.push(...coordinates);
      }
      if (
        edge.emphasis === "readable-boundary" &&
        !relationOrderEdge &&
        !wallDual
      ) {
        readableBoundaryCoordinates.push(...coordinates);
      }
      if (wallDual) {
        const color = edgeColor(edge, update);
        const bucket = wallDualOverlays.get(color) ?? [];
        pushWallDualCoordinates(
          bucket,
          edge,
          source,
          target,
          update,
          this.edgeDashUnit,
        );
        wallDualOverlays.set(color, bucket);
      }
      if (edge.readabilityOverlay) {
        const color = edgeColor(edge, update);
        const key = `${color}:${edge.ghost ? "ghost" : "main"}`;
        const bucket = readabilityOverlays.get(key) ?? {
          color,
          ghost: Boolean(edge.ghost),
          coordinates: [],
        };
        bucket.coordinates.push(...coordinates);
        readabilityOverlays.set(key, bucket);
      }

      const incidentToSelection =
        update.selectedNodeId !== undefined &&
        (edge.source === update.selectedNodeId ||
          edge.target === update.selectedNodeId);
      if (incidentToSelection) {
        if (edge.selectedHighlight === "outline") {
          outlineHighlightCoordinates.push(...coordinates);
        } else {
          const color = edgeColor(edge, update);
          const bucket = highlightByColor.get(color) ?? [];
          bucket.push(...coordinates);
          highlightByColor.set(color, bucket);
        }
      }
    }

    if (boundaryCoordinates.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(boundaryCoordinates), 3),
      );
      this.edgeOverlayGroup.add(
        createStableLineSegments(
          geometry,
          edgeOverlayMaterial("#b42318", 0.98),
          20,
        ),
      );
    }

    if (readableBoundaryCoordinates.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(readableBoundaryCoordinates), 3),
      );
      this.edgeOverlayGroup.add(
        createStableLineSegments(
          geometry,
          edgeOverlayMaterial(readableBoundaryEdgeColor(update), 1),
          21,
        ),
      );
    }

    for (const [color, coordinates] of wallDualOverlays) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(coordinates), 3),
      );
      this.edgeOverlayGroup.add(
        createStableLineSegments(geometry, edgeOverlayMaterial(color, 1), 21),
      );
    }

    for (const bucket of readabilityOverlays.values()) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(bucket.coordinates), 3),
      );
      this.edgeOverlayGroup.add(
        createStableLineSegments(
          geometry,
          edgeOverlayMaterial(bucket.color, bucket.ghost ? 0.18 : 0.96),
          19,
        ),
      );
    }

    for (const [color, coordinates] of highlightByColor) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(coordinates), 3),
      );
      this.edgeOverlayGroup.add(
        createStableLineSegments(geometry, edgeOverlayMaterial(color, 1), 22),
      );
    }

    if (outlineHighlightCoordinates.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(outlineHighlightCoordinates), 3),
      );
      this.edgeOverlayGroup.add(
        createStableLineSegments(
          geometry,
          edgeOverlayMaterial(selectedEdgeOutlineColor(update), 0.96, 3),
          23,
        ),
      );
    }
  }

  /**
   * Shape cue for the selected vertex: a screen-facing amber ring, so the
   * selection is recognisable without relying on colour alone.
   */
  private addSelectionRing(update: GraphUpdate) {
    const nodeId = update.selectedNodeId;
    const node = nodeId ? this.nodesById.get(nodeId) : undefined;
    const position = nodeId ? update.nodePositions.get(nodeId) : undefined;
    if (!node || node.hidden || !position) {
      return;
    }
    const material = new SpriteMaterial({
      map: selectionRingTexture(selectionColor[update.colorScheme]),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const ring = new Sprite(material);
    const diameter =
      0.09 * 2 * 1.85 * 1.7 * (node.nodeScale ?? 1) * update.selectedNodeScale;
    ring.scale.set(diameter, diameter, 1);
    ring.position.copy(position);
    ring.renderOrder = 30;
    ring.userData.kind = "selection-ring";
    this.edgeOverlayGroup.add(ring);
  }

  private addReferenceBall(update: GraphUpdate) {
    if (!update.showReferenceBall) {
      return;
    }

    // The ideal boundary is drawn as a faint silhouette, not a wireframe: a
    // dense lattice of meridians covered the projected chambers. The back
    // faces of a nearly transparent sphere give a soft disk whose rim is the
    // boundary sphere's outline from any viewpoint; one equator ring adds a
    // depth cue while orbiting.
    const radius = update.referenceBallRadius;
    // One neutral grey reads on both canvases (theme changes do not rebuild it).
    const referenceBallColor = "#7c8794";
    const shell = new Mesh(
      new SphereGeometry(radius, 48, 32),
      new MeshBasicMaterial({
        color: referenceBallColor,
        transparent: true,
        opacity: 0.065,
        side: BackSide,
        depthWrite: false,
      }),
    );
    shell.renderOrder = -2;
    this.referenceGroup.add(shell);
    const equator: number[] = [];
    const segments = 96;
    for (let index = 0; index < segments; index += 1) {
      const a = (2 * Math.PI * index) / segments;
      const b = (2 * Math.PI * (index + 1)) / segments;
      equator.push(
        radius * Math.cos(a),
        radius * Math.sin(a),
        0,
        radius * Math.cos(b),
        radius * Math.sin(b),
        0,
      );
    }
    const ringGeometry = new BufferGeometry();
    ringGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(equator), 3),
    );
    this.referenceGroup.add(
      createStableLineSegments(
        ringGeometry,
        new LineBasicMaterial({
          color: referenceBallColor,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
        -1,
      ),
    );
  }

  private addLabels(update: GraphUpdate): {
    nodes: number;
    edges: number;
    leaders: number;
  } {
    // Bring the screen-size factor up to date first: dense label collision
    // checks need the size the chips will actually be drawn at.
    this.applyLabelScreenScale();
    const density = this.labelDensity(update);
    this.labelZoomLevelBuilt = density.zoomLevel;
    const nodeEntries = this.nodeLabelEntries(update, density);
    const edgeEntries = selectEdgeLabelCandidates(update, {
      budget: density,
      cameraPosition: this.camera.position,
    });
    const sdfThreshold = update.semanticLabelsOnly
      ? semanticSdfLabelBatchThreshold
      : sdfLabelBatchThreshold;
    if (
      this.sdfTextAvailable &&
      nodeEntries.length + edgeEntries.length >= sdfThreshold
    ) {
      try {
        return this.addSdfLabels(update, nodeEntries, edgeEntries);
      } catch (error) {
        // Dense labels must remain complete when canvas/SDF creation fails.
        this.sdfTextAvailable = false;
        this.sdfTextFallbackReason =
          error instanceof Error ? error.message : String(error);
        this.stats.labelRendererFallbackReason = this.sdfTextFallbackReason;
      }
    }
    const edgeLabels = this.addEdgeLabels(update, edgeEntries);
    return {
      nodes: this.addNodeLabels(update, nodeEntries),
      edges: edgeLabels.edges,
      leaders: edgeLabels.leaders,
    };
  }

  private labelDensity(update: GraphUpdate): LabelDensityBudget {
    let visibleNodeCount = 0;
    for (const node of update.nodes) {
      if (!node.hidden) {
        visibleNodeCount += 1;
      }
    }
    return labelDensityBudget({
      visibleNodeCount,
      maxNodeLabels: update.maxNodeLabels,
      maxEdgeLabels: update.maxEdgeLabels,
      zoomRatio: this.currentZoomRatio(),
    });
  }

  /** framedDistance / currentDistance; above 1 once the user zooms in. */
  private currentZoomRatio(): number {
    const distance = this.camera.position.distanceTo(this.controls.target);
    return this.framedCameraDistance > 0 && distance > 0
      ? this.framedCameraDistance / distance
      : 1;
  }

  private nodeLabelEntries(
    update: GraphUpdate,
    density = this.labelDensity(update),
  ): Array<PickedLabelEntry<SceneNode>> {
    const selectedNeighbors = this.neighborsFor(update.selectedNodeId);
    const cameraPosition = this.camera.position;
    const pinned = (node: SceneNode) =>
      node.alwaysLabel === true || node.isRelationBoundary === true;
    // Some scene builders pin every label (alwaysLabel on all of hat X). Pins
    // only bypass the dense cap while they are few enough to mean "this one".
    const pinsExempt =
      density.dense &&
      countAtMost(update.nodes, pinned, denseLabelPinLimit) <=
        denseLabelPinLimit;
    const exempt = (node: SceneNode) =>
      node.id === update.selectedNodeId ||
      selectedNeighbors.has(node.id) ||
      (pinsExempt && pinned(node));
    const picked = selectLabelBudget(
      update.nodes.filter((node) => !node.hidden),
      {
        enabled: update.showNodeLabels && update.labelScope !== "off",
        // Dense mode ranks every candidate: the collision check below may
        // reject many, and the hard maximum is enforced after it.
        maxLabels: density.dense ? update.nodes.length : update.maxNodeLabels,
        maxCharacters: 14,
        getLabel: (node) => {
          if (node.drawingOnly && !node.alwaysLabel) {
            return undefined;
          }
          if (
            update.semanticLabelsOnly &&
            node.isRelationBoundary &&
            node.id !== update.selectedNodeId &&
            !node.alwaysLabel
          ) {
            return undefined;
          }
          if (
            update.labelScope === "focused" &&
            node.id !== update.selectedNodeId &&
            !selectedNeighbors.has(node.id) &&
            !node.isRelationBoundary &&
            !node.alwaysLabel
          ) {
            return undefined;
          }
          return node.compactLabel ?? node.label ?? node.id;
        },
        getPriority: (node) => {
          const base =
            (node.labelPriority ?? 0) +
            (node.alwaysLabel ? 80_000 : 0) +
            (node.isRelationBoundary ? 15_000 : 0) +
            (node.id === update.selectedNodeId ? 10_000 : 0);
          if (!density.dense) {
            return base - node.length;
          }
          // Dense scenes: label the selection's neighbours, then the vertices
          // nearest the camera, which are the least likely to be hidden
          // behind the rest of the ball.
          const position = update.nodePositions.get(node.id);
          return (
            base +
            (selectedNeighbors.has(node.id) ? 5_000 : 0) -
            (position ? position.distanceTo(cameraPosition) : 1_000)
          );
        },
      },
    );
    if (!density.dense) {
      return picked;
    }
    // Dense balls put most candidates behind one another near the middle of
    // the view. A screen-space occupancy check spreads the capped labels out
    // instead of stacking them; selection context is always placed.
    const occupancy = new ScreenLabelOccupancy(this.camera);
    return applyDenseLabelCap(
      picked,
      density.nodeCap,
      update.maxNodeLabels,
      (entry) => exempt(entry.item),
      (entry, isExempt) => {
        const position = update.nodePositions.get(entry.item.id);
        return position
          ? occupancy.reserve(position, entry.label, {
              force: isExempt,
              onScreenOnly: true,
              chip: nodeLabelChipSize(
                entry.label,
                (entry.item.labelScale ?? 1) * this.appliedLabelScreenScale,
              ),
            })
          : false;
      },
    );
  }

  private addNodeLabels(
    update: GraphUpdate,
    entries = this.nodeLabelEntries(update),
  ): number {
    for (const { item: node, label } of entries) {
      const position = update.nodePositions.get(node.id);
      if (!position) {
        continue;
      }

      const style = nodeLabelStyle(node, update.colorScheme);
      const sprite = createTextSprite(label, {
        textColor: cssColor(style.foreground),
        backgroundColor: cssColor(style.background),
        borderColor: cssColor(style.border),
        fontSize: 28,
        paddingX: 8,
        paddingY: 5,
        worldHeight: 0.28 * (node.labelScale ?? 1),
      });
      sprite.center.set(0.5, 0);
      sprite.position.copy(position);
      sprite.position.z += 0.13 * (node.labelScale ?? 1);
      sprite.renderOrder = 20;
      this.addScaledLabelSprite(sprite);
      this.labelFadeEntries.push({
        anchor: position,
        pinned: this.isSelectionContextNode(node.id, update),
        sprite,
        opacity: 1,
        scale: farLabelScale(node, update),
      });
    }

    return entries.length;
  }

  private addScaledLabelSprite(sprite: Sprite) {
    sprite.userData.baseScale = [sprite.scale.x, sprite.scale.y];
    const factor = this.appliedLabelScreenScale;
    sprite.scale.set(sprite.scale.x * factor, sprite.scale.y * factor, 1);
    this.labelGroup.add(sprite);
  }

  private addEdgeLabels(
    update: GraphUpdate,
    entries = selectEdgeLabelCandidates(update),
  ): {
    edges: number;
    leaders: number;
  } {
    const labelOccupancy = new ScreenLabelOccupancy(this.camera);
    let placedLabels = 0;
    let placedLeaders = 0;
    const leaderCoordinates: number[] = [];
    for (const { edge, label } of entries) {
      const source = update.nodePositions.get(edge.source);
      const target = update.nodePositions.get(edge.target);
      if (!source || !target) {
        continue;
      }

      const position = this.placeEdgeLabel(
        edge,
        label,
        source,
        target,
        labelOccupancy,
        importantEdgeLabel(edge, update),
      );
      if (!position) {
        continue;
      }

      const style = edgeLabelStyle(edge, update);
      const sprite = createTextSprite(label, {
        textColor: cssColor(style.foreground),
        backgroundColor: cssColor(style.background),
        borderColor: cssColor(style.border),
        fontSize: 22,
        paddingX: 6,
        paddingY: 3,
        worldHeight: 0.2 * (edge.labelScale ?? 1),
      });
      sprite.center.set(0.5, 0.5);
      sprite.position.copy(position.labelPosition);
      sprite.renderOrder = 18;
      this.addScaledLabelSprite(sprite);
      this.labelFadeEntries.push({
        anchor: position.labelPosition.clone(),
        pinned: edgeIncidentToSelection(edge, update),
        sprite,
        opacity: 1,
      });
      if (shouldDrawEdgeLabelLeader(edge, update)) {
        const drewLeader = pushLabelLeaderCoordinates(
          leaderCoordinates,
          position.anchor,
          position.labelPosition,
          edge.id.startsWith("Gamma:e:") ? 0.62 : 0.38,
        );
        if (drewLeader) {
          placedLeaders += 1;
        }
      }
      placedLabels += 1;
    }

    if (leaderCoordinates.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(leaderCoordinates), 3),
      );
      const material = new LineBasicMaterial({
        color: labelLeaderColor(update),
        transparent: true,
        opacity: update.semanticLabelsOnly ? 0.68 : 0.46,
      });
      this.labelGroup.add(createStableLineSegments(geometry, material, 17));
    }

    return { edges: placedLabels, leaders: placedLeaders };
  }

  private addSdfLabels(
    update: GraphUpdate,
    nodeEntries: Array<PickedLabelEntry<SceneNode>>,
    edgeEntries: EdgeLabelCandidate[],
  ): { nodes: number; edges: number; leaders: number } {
    const labels: SdfTextLabel[] = [];
    for (const { item: node, label } of nodeEntries) {
      const position = update.nodePositions.get(node.id);
      if (!position) {
        continue;
      }
      const style = sdfStyle(nodeLabelStyle(node, update.colorScheme));
      this.labelFadeEntries.push({
        anchor: position,
        pinned: this.isSelectionContextNode(node.id, update),
        sdfId: `node:${node.id}`,
        opacity: 1,
        scale: farLabelScale(node, update),
      });
      labels.push({
        id: `node:${node.id}`,
        text: label,
        anchor: [
          position.x,
          position.y,
          position.z + 0.13 * (node.labelScale ?? 1),
        ],
        worldHeight: 0.28 * (node.labelScale ?? 1),
        foreground: style.foreground,
        background: style.background,
        border: style.border,
        center: [0.5, 0],
        padding: [0.28, 0.18],
        borderWidth: 0.035,
      });
    }

    const labelOccupancy = new ScreenLabelOccupancy(this.camera);
    const leaderCoordinates: number[] = [];
    let edgeLabelCount = 0;
    let leaderCount = 0;
    for (const { edge, label } of edgeEntries) {
      const source = update.nodePositions.get(edge.source);
      const target = update.nodePositions.get(edge.target);
      if (!source || !target) {
        continue;
      }
      const placement = this.placeEdgeLabel(
        edge,
        label,
        source,
        target,
        labelOccupancy,
        importantEdgeLabel(edge, update),
      );
      if (!placement) {
        continue;
      }
      const style = sdfStyle(edgeLabelStyle(edge, update));
      this.labelFadeEntries.push({
        anchor: placement.labelPosition.clone(),
        pinned: edgeIncidentToSelection(edge, update),
        sdfId: `edge:${edge.id}`,
        opacity: 1,
      });
      labels.push({
        id: `edge:${edge.id}`,
        text: label,
        anchor: vectorToArray(placement.labelPosition),
        worldHeight: 0.2 * (edge.labelScale ?? 1),
        foreground: style.foreground,
        background: style.background,
        border: style.border,
        center: [0.5, 0.5],
        padding: [0.27, 0.14],
        borderWidth: 0.04,
      });
      if (
        shouldDrawEdgeLabelLeader(edge, update) &&
        pushLabelLeaderCoordinates(
          leaderCoordinates,
          placement.anchor,
          placement.labelPosition,
          edge.id.startsWith("Gamma:e:") ? 0.62 : 0.38,
        )
      ) {
        leaderCount += 1;
      }
      edgeLabelCount += 1;
    }

    if (labels.length === 0) {
      return { nodes: 0, edges: 0, leaders: 0 };
    }
    const atlas = this.sdfAtlasFor(labels.map((label) => label.text));
    this.activeSdfBatch = createSdfTextBatch(atlas, labels, {
      renderOrder: 18,
      depthTest: false,
    });
    this.activeSdfBatch.setLabelScale(this.appliedLabelScreenScale);
    this.labelGroup.add(this.activeSdfBatch.group);

    if (leaderCoordinates.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(leaderCoordinates), 3),
      );
      const material = new LineBasicMaterial({
        color: labelLeaderColor(update),
        transparent: true,
        opacity: update.semanticLabelsOnly ? 0.68 : 0.46,
      });
      this.labelGroup.add(createStableLineSegments(geometry, material, 17));
    }
    this.stats.labelRenderer = "sdf-batch";
    this.stats.labelRendererFallbackReason = undefined;
    return {
      nodes: labels.length - edgeLabelCount,
      edges: edgeLabelCount,
      leaders: leaderCount,
    };
  }

  private sdfAtlasFor(texts: string[]): SdfGlyphAtlas {
    const characters = [...new Set(texts.flatMap((text) => [...text]))].sort();
    const key = characters.join("");
    const cached = this.sdfAtlasCache.get(key);
    if (cached) {
      this.sdfAtlasCache.delete(key);
      this.sdfAtlasCache.set(key, cached);
      return cached;
    }
    const atlas = buildSdfGlyphAtlas(characters, {
      fontFamily: "system-ui, sans-serif",
      fontWeight: 600,
      fontSize: 48,
      spread: 8,
    });
    this.sdfAtlasCache.set(key, atlas);
    this.sdfAtlasCacheBytes += atlas.data.byteLength;
    while (
      this.sdfAtlasCache.size > 6 ||
      (this.sdfAtlasCacheBytes > sdfAtlasCacheByteBudget &&
        this.sdfAtlasCache.size > 1)
    ) {
      const oldest = this.sdfAtlasCache.entries().next().value as
        | [string, SdfGlyphAtlas]
        | undefined;
      if (!oldest) {
        break;
      }
      this.sdfAtlasCache.delete(oldest[0]);
      this.sdfAtlasCacheBytes -= oldest[1].data.byteLength;
      oldest[1].dispose();
    }
    return atlas;
  }

  private placeEdgeLabel(
    edge: SceneEdge,
    label: string,
    source: Vector3,
    target: Vector3,
    occupancy: ScreenLabelOccupancy,
    force: boolean,
  ): EdgeLabelPlacement | undefined {
    // Curved edges are labelled on a chord through the middle of the curve.
    const path = edge.drawingControlPoint
      ? edgePathPoints(edge, source, target, this.lastGraphUpdate!)
      : undefined;
    const chord = path ? labelChordForPath(path) : undefined;
    const candidates = edgeLabelCandidates(
      edge,
      chord?.[0] ?? source,
      chord?.[1] ?? target,
      this.camera,
    );
    for (const candidate of candidates) {
      if (occupancy.reserve(candidate.labelPosition, label)) {
        return candidate;
      }
    }
    if (force) {
      const fallback = candidates.at(-1);
      if (fallback) {
        occupancy.reserve(fallback.labelPosition, label, { force: true });
      }
      return fallback;
    }
    return undefined;
  }

  private addCells(update: GraphUpdate): number {
    if (!update.showCells) {
      this.stats.omittedTransparentFills = 0;
      return 0;
    }

    let renderedCells = 0;
    const fillBuckets = new Map<
      string,
      {
        pairKey: string;
        pair: [number, number];
        styleCell: SceneCell;
        coordinates: number[];
      }
    >();
    const outlineBuckets = new Map<
      string,
      {
        pairKey: string;
        pair: [number, number];
        styleCell: SceneCell;
        coordinates: number[];
      }
    >();
    const usedGeometryKeys = new Set<string>();
    const transparentFillBudget = update.topologyMode ? 240 : 140;
    const applyFillBudget =
      update.localCellRenderMode !== "outline-only" &&
      update.cells.length > transparentFillBudget;
    const nearestFillIds = applyFillBudget
      ? nearestCellsForFillBudget(update, transparentFillBudget)
      : undefined;
    let filledTransparentCells = 0;
    let omittedTransparentFills = 0;
    let unfillableCells = 0;
    const pickingItems: PickingSpatialItem<SceneCell>[] = [];

    for (const cell of update.cells) {
      let vertices = cell.boundaryNodeIds
        .map((nodeId) => update.nodePositions.get(nodeId))
        .filter((position): position is Vector3 => Boolean(position));
      if (
        vertices.length !== cell.boundaryNodeIds.length ||
        vertices.length < 3
      ) {
        continue;
      }

      const pairActive =
        update.activeGeneratorPair !== undefined &&
        pairKey(cell.generatorPair) === pairKey(update.activeGeneratorPair);
      vertices =
        update.localCellRenderMode === "petals"
          ? petalCellVertices(cell, vertices, update)
          : update.localCellRenderMode === "lifted-panels"
            ? liftedCellVertices(cell, vertices, update, pairActive)
            : vertices.map((vertex) => vertex.clone());
      const drawingSurface = cellDrawingSurface(
        cell,
        update.localCellRenderMode,
      );
      this.cellVerticesById.set(cell.id, vertices);

      const cellPairKey = pairKey(cell.generatorPair);
      const bucketStyle = cellBucketStyleKey(cell);
      const outlineKey = `${cellPairKey}:${bucketStyle}`;
      const outlineBucket = outlineBuckets.get(outlineKey) ?? {
        pairKey: cellPairKey,
        pair: cell.generatorPair,
        styleCell: cell,
        coordinates: [],
      };
      pushCellOutlineCoordinates(
        outlineBucket.coordinates,
        vertices,
        drawingSurface,
      );
      outlineBuckets.set(outlineKey, outlineBucket);

      // A cell is pickable only where something is drawn for it: its fill,
      // or (outline-only mode) the interior of a fillable outline. Cells whose
      // fill was dropped by the budget, or whose drawn boundary crosses
      // itself, register no hit area, so clicking empty space cannot select
      // an invisible cell.
      if (
        update.localCellRenderMode === "outline-only" ||
        !shouldFillTransparentCell(
          cell,
          update,
          applyFillBudget,
          filledTransparentCells,
          transparentFillBudget,
          nearestFillIds,
        )
      ) {
        if (update.localCellRenderMode !== "outline-only") {
          omittedTransparentFills += 1;
        } else if (cellHasFill(vertices, drawingSurface)) {
          this.pickableCellIds.add(cell.id);
        }
      } else {
        const fillKey = `${cellPairKey}:${bucketStyle}`;
        const fillBucket = fillBuckets.get(fillKey) ?? {
          pairKey: cellPairKey,
          pair: cell.generatorPair,
          styleCell: cell,
          coordinates: [],
        };
        if (
          pushCellFillCoordinates(
            fillBucket.coordinates,
            vertices,
            drawingSurface,
          )
        ) {
          fillBuckets.set(fillKey, fillBucket);
          filledTransparentCells += 1;
          this.pickableCellIds.add(cell.id);
        } else {
          unfillableCells += 1;
        }
      }
      if (!this.gpuPickingActive && this.pickableCellIds.has(cell.id)) {
        const item = createCellPickingItem(cell, vertices, drawingSurface);
        if (item) {
          pickingItems.push(item);
        }
      }
      renderedCells += 1;
    }
    this.stats.omittedTransparentFills = omittedTransparentFills;
    this.stats.unfillableCells = unfillableCells;
    if (!this.gpuPickingActive) {
      const pickingStartedAt = performance.now();
      this.cellPickingIndex.build(pickingItems);
      this.cellPickingBuildMs = performance.now() - pickingStartedAt;
    }

    for (const [bucketKey, bucket] of fillBuckets) {
      const geometryKey = `fill:${bucketKey}`;
      usedGeometryKeys.add(geometryKey);
      const geometry = this.cachedCellGeometry(
        geometryKey,
        bucket.coordinates,
        true,
      );
      const material = new MeshBasicMaterial({
        color: cellColor(
          update.generators,
          bucket.styleCell,
          update.colorScheme,
        ),
        opacity: cellOpacity(bucket.styleCell, update, false),
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
      });
      const mesh = new Mesh(geometry, material);
      this.cellBuckets.push({
        pairKey: bucket.pairKey,
        pair: bucket.pair,
        styleCell: bucket.styleCell,
        fillMaterial: material,
      });
      this.cellGroup.add(mesh);
    }

    for (const [bucketKey, bucket] of outlineBuckets) {
      const geometryKey = `outline:${bucketKey}`;
      usedGeometryKeys.add(geometryKey);
      const geometry = this.cachedCellGeometry(
        geometryKey,
        bucket.coordinates,
        false,
      );
      const material = new LineBasicMaterial({
        color: cellColor(
          update.generators,
          bucket.styleCell,
          update.colorScheme,
        ),
        transparent: true,
        opacity: cellOutlineOpacity(bucket.styleCell, update, false),
        linewidth: cellOutlineWidth(bucket.styleCell, update, false),
      });
      const outline = createStableLineSegments(geometry, material);
      this.cellBuckets.push({
        pairKey: bucket.pairKey,
        pair: bucket.pair,
        styleCell: bucket.styleCell,
        outlineMaterial: material,
      });
      this.cellGroup.add(outline);
    }
    this.sweepCellGeometryCache(usedGeometryKeys);
    this.updateCellAppearance(update);
    return renderedCells;
  }

  private cachedCellGeometry(
    key: string,
    coordinates: number[],
    computeNormals: boolean,
  ): BufferGeometry {
    const existing = this.cellGeometryCache.get(key);
    const existingAttribute = existing?.getAttribute("position");
    if (
      existing &&
      existingAttribute instanceof BufferAttribute &&
      existingAttribute.array.length === coordinates.length
    ) {
      const target = existingAttribute.array as Float32Array;
      target.set(coordinates);
      existingAttribute.needsUpdate = true;
      existing.setDrawRange(0, coordinates.length / 3);
      existing.computeBoundingSphere();
      if (computeNormals) {
        existing.computeVertexNormals();
      }
      return existing;
    }

    existing?.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(coordinates), 3),
    );
    geometry.setDrawRange(0, coordinates.length / 3);
    geometry.computeBoundingSphere();
    if (computeNormals) {
      geometry.computeVertexNormals();
    }
    this.cellGeometryCache.set(key, geometry);
    return geometry;
  }

  private sweepCellGeometryCache(usedKeys: Set<string>) {
    for (const [key, geometry] of this.cellGeometryCache) {
      if (!usedKeys.has(key)) {
        geometry.dispose();
        this.cellGeometryCache.delete(key);
      }
    }
  }

  private updateCellAppearance(update: GraphUpdate) {
    const activePairKey = update.activeGeneratorPair
      ? pairKey(update.activeGeneratorPair)
      : undefined;
    for (const bucket of this.cellBuckets) {
      const active = activePairKey === bucket.pairKey;
      // The active pair is emphasised by opacity and outline width, not by a
      // new hue, so its cells keep reading as their two generators.
      const color = cellColor(
        update.generators,
        bucket.styleCell,
        update.colorScheme,
      );
      bucket.fillMaterial?.color.set(color);
      if (bucket.fillMaterial) {
        bucket.fillMaterial.opacity = cellOpacity(
          bucket.styleCell,
          update,
          active,
        );
        bucket.fillMaterial.needsUpdate = true;
      }
      if (bucket.outlineMaterial) {
        bucket.outlineMaterial.color.set(color);
        bucket.outlineMaterial.opacity = cellOutlineOpacity(
          bucket.styleCell,
          update,
          active,
        );
        bucket.outlineMaterial.linewidth = cellOutlineWidth(
          bucket.styleCell,
          update,
          active,
        );
        bucket.outlineMaterial.needsUpdate = true;
      }
    }
  }

  private addCellSelectionOverlay(update: GraphUpdate) {
    if (!update.selectedCellId) {
      return;
    }
    for (const cell of update.cells) {
      if (!isSelectedCell(cell, update.selectedCellId)) {
        continue;
      }
      const vertices = this.cellVerticesById.get(cell.id);
      if (!vertices || vertices.length < 3) {
        continue;
      }
      const fillGeometry =
        update.localCellRenderMode !== "outline-only"
          ? createCellFillGeometry(
              vertices,
              cellDrawingSurface(cell, update.localCellRenderMode),
            )
          : undefined;
      if (fillGeometry) {
        const fill = new Mesh(
          fillGeometry,
          new MeshBasicMaterial({
            color: selectionColor[update.colorScheme],
            opacity: Math.max(update.cellOpacity, 0.38),
            transparent: true,
            side: DoubleSide,
            depthWrite: false,
          }),
        );
        fill.renderOrder = 12;
        this.cellOverlayGroup.add(fill);
      }

      const outlineCoordinates: number[] = [];
      pushCellOutlineCoordinates(
        outlineCoordinates,
        vertices,
        cellDrawingSurface(cell, update.localCellRenderMode),
      );
      const outlineGeometry = new BufferGeometry();
      outlineGeometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(outlineCoordinates), 3),
      );
      const outline = createStableLineSegments(
        outlineGeometry,
        edgeOverlayMaterial(selectionColor[update.colorScheme], 1, 4),
        13,
      );
      outline.renderOrder = 13;
      this.cellOverlayGroup.add(outline);
    }
  }

  private frameGraph(update: GraphUpdate) {
    const { nodePositions } = update;
    if (nodePositions.size === 0) {
      return;
    }

    // Revision-aware callers have already hashed layout coordinates. The
    // fallback walk remains for standalone SceneView consumers.
    const frameKey =
      update.revisionSet?.cameraVersion ??
      [...nodePositions.entries()]
        .map(
          ([nodeId, position]) =>
            `${nodeId}:${position.x.toFixed(3)},${position.y.toFixed(3)},${position.z.toFixed(3)}`,
        )
        .join("|");
    const cameraFrameKey = [
      update.cameraPreset,
      `reference:${update.showReferenceBall}`,
      `radius:${update.referenceBallRadius}`,
      `focus:${update.cameraFocusTarget?.join(",") ?? ""}`,
      `offset:${update.cameraFocusOffset?.join(",") ?? ""}`,
      frameKey,
    ].join(":");
    if (cameraFrameKey === this.framedGraphKey) {
      return;
    }
    this.framedGraphKey = cameraFrameKey;

    let maxRadius = update.showReferenceBall ? update.referenceBallRadius : 1;
    const center = new Vector3();
    for (const position of nodePositions.values()) {
      if (!update.showReferenceBall) {
        center.add(position);
      }
      maxRadius = Math.max(maxRadius, position.length());
    }
    if (!update.showReferenceBall) {
      center.multiplyScalar(1 / nodePositions.size);
    }
    const oneVertexCellBouquet =
      nodePositions.size <= 2 &&
      update.cells.some((cell) => new Set(cell.boundaryNodeIds).size <= 1);
    if (oneVertexCellBouquet) {
      maxRadius = Math.max(maxRadius, 4.6);
    }
    this.camera.near = Math.max(0.01, maxRadius / 200);
    this.camera.far = Math.max(1000, maxRadius * 20);

    if (update.cameraFocusTarget && update.cameraFocusOffset) {
      this.camera.fov = 55;
      this.camera.updateProjectionMatrix();
      this.focusPosition(
        new Vector3(...update.cameraFocusTarget),
        update.cameraFocusOffset,
      );
      // Caller-chosen offsets are still the "framed" view for the dense
      // label zoom rule.
      this.recordAutomaticFrame();
      return;
    }

    if (update.cameraPreset === "on-graph") {
      const distance = Math.max(2.2, Math.min(7.5, maxRadius * 1.25 + 1.3));
      this.camera.fov = 66;
      this.camera.updateProjectionMatrix();
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, -distance, distance * 0.45);
      this.recordAutomaticFrame();
      this.controls.update();
      this.scheduleDampingFrames("camera-frame", 18);
      return;
    }

    this.camera.fov = update.showReferenceBall ? referenceBallFov : 55;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.framedSceneRadius = maxRadius;
    if (update.showReferenceBall) {
      // Projection views are framed on the whole model ball (radius R about
      // the origin), seen from outside at ~2.8R with a moderate field of view,
      // so near chambers are not magnified into blobs by a wide-angle camera
      // sitting on the ball's surface.
      const ballPoints = [
        new Vector3(maxRadius, 0, 0),
        new Vector3(-maxRadius, 0, 0),
        new Vector3(0, maxRadius, 0),
        new Vector3(0, -maxRadius, 0),
        new Vector3(0, 0, maxRadius),
        new Vector3(0, 0, -maxRadius),
      ];
      const framing = computeSceneFraming(
        ballPoints,
        this.camera.fov,
        this.camera.aspect,
        referenceBallFrameFill,
      );
      this.controls.target.copy(framing.center);
      this.camera.position
        .copy(framing.center)
        .addScaledVector(framing.direction, framing.distance);
      this.camera.near = Math.max(0.01, framing.distance / 200);
      this.camera.far = Math.max(1000, framing.distance * 20);
      this.camera.updateProjectionMatrix();
    } else if (oneVertexCellBouquet) {
      this.camera.position.set(
        center.x + maxRadius * 0.95,
        center.y - maxRadius * 1.55,
        center.z + maxRadius * 1.2,
      );
    } else {
      const framing = computeSceneFraming(
        [...nodePositions.values()],
        this.camera.fov,
        this.camera.aspect,
      );
      this.controls.target.copy(framing.center);
      this.camera.position
        .copy(framing.center)
        .addScaledVector(framing.direction, framing.distance);
      this.camera.near = Math.max(0.01, framing.distance / 200);
      this.camera.far = Math.max(1000, framing.distance * 20);
      this.camera.updateProjectionMatrix();
      this.framedSceneRadius = framing.radius;
    }
    this.recordAutomaticFrame();
    this.controls.update();
    this.scheduleDampingFrames("camera-frame", 18);
  }

  private resize(reason: string) {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    if (
      width === this.viewportWidth &&
      height === this.viewportHeight &&
      pixelRatio === this.viewportPixelRatio
    ) {
      return false;
    }
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.viewportPixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    // The fitted distance depends on the aspect ratio, so the automatic
    // framing is redone when the viewer changes shape. A camera the user has
    // orbited, panned or zoomed is left where it is.
    if (this.lastGraphUpdate && this.cameraAtAutomaticFrame()) {
      this.framedGraphKey = "";
      this.frameGraph(this.lastGraphUpdate);
      // Dense label selection is camera-dependent (proximity and screen
      // collisions), so rebuild it for the refitted camera.
      if (this.labelDensity(this.lastGraphUpdate).dense) {
        this.updateLabelAppearance(this.lastGraphUpdate);
      }
    }
    this.requestRender(reason);
    return true;
  }

  private recordAutomaticFrame() {
    this.framedCameraDistance = this.camera.position.distanceTo(
      this.controls.target,
    );
    this.framedCameraPosition = this.camera.position.clone();
  }

  /** True while the user has not orbited, panned or zoomed since framing. */
  private cameraAtAutomaticFrame(): boolean {
    return (
      this.framedCameraPosition !== undefined &&
      this.camera.position.distanceTo(this.framedCameraPosition) <
        1e-3 * Math.max(1, this.framedCameraDistance)
    );
  }

  private scheduleResize(reason: string) {
    if (this.resizeFrame !== undefined) {
      window.cancelAnimationFrame(this.resizeFrame);
    }
    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = window.requestAnimationFrame(() => {
        this.resizeFrame = undefined;
        this.resize(reason);
      });
    });

    // Tauri and fullscreen CSS transitions can settle after ResizeObserver's
    // first notification. The fallbacks remeasure, but resize() is a no-op
    // when the canvas dimensions and device scale are already current.
    for (const delay of [80, 240]) {
      const timeoutId = window.setTimeout(() => {
        this.resizeFallbacks.delete(timeoutId);
        this.resize(reason);
      }, delay);
      this.resizeFallbacks.add(timeoutId);
    }
  }

  private handleCameraSignals(update: GraphUpdate) {
    if (update.resetSignal !== this.lastResetSignal) {
      this.lastResetSignal = update.resetSignal;
      this.resetCamera();
    }

    if (update.focusSignal !== this.lastFocusSignal) {
      this.lastFocusSignal = update.focusSignal;
      const focusId = update.focusNodeId ?? update.selectedNodeId;
      const position = update.cameraFocusTarget
        ? new Vector3(
            update.cameraFocusTarget[0],
            update.cameraFocusTarget[1],
            update.cameraFocusTarget[2],
          )
        : focusId
          ? update.nodePositions.get(focusId)
          : undefined;
      if (position) {
        this.focusPosition(position, update.cameraFocusOffset);
      }
    }
  }

  private focusPosition(
    position: Vector3,
    focusOffset?: [number, number, number],
  ) {
    const offset = focusOffset
      ? new Vector3(focusOffset[0], focusOffset[1], focusOffset[2])
      : new Vector3(0, -4.2, 2.6);
    this.controls.target.copy(position);
    this.camera.position.copy(position).add(offset);
    this.controls.update();
    this.scheduleDampingFrames("camera-focus", 18);
  }

  private readonly handleControlsStart = () => {
    this.cameraInteractionActive = true;
    this.pendingHoverPoint = undefined;
    this.gpuHoverRequest += 1;
    this.scheduleDampingFrames("camera-start", 36);
  };

  private readonly handleControlsChange = () => {
    this.requestRender("camera-change");
    this.scheduleLabelZoomCheck();
  };

  /**
   * Dense scenes cap labels at the framed view and relax the cap at each 2x
   * zoom step. The check is debounced so labels are rebuilt once the camera
   * settles, not on every damping frame.
   */
  private scheduleLabelZoomCheck() {
    if (this.labelZoomTimer !== undefined) {
      window.clearTimeout(this.labelZoomTimer);
    }
    this.labelZoomTimer = window.setTimeout(() => {
      this.labelZoomTimer = undefined;
      const update = this.lastGraphUpdate;
      if (!update || this.cameraInteractionActive) {
        return;
      }
      const density = this.labelDensity(update);
      if (!density.dense || density.zoomLevel === this.labelZoomLevelBuilt) {
        return;
      }
      this.updateLabelAppearance(update);
      this.requestRender("label-zoom");
    }, 220);
  }

  private readonly handleControlsEnd = () => {
    this.cameraInteractionActive = false;
    this.scheduleDampingFrames("camera-end", 18);
    this.scheduleLabelZoomCheck();
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (isEditableKeyboardTarget(event.target)) {
      return;
    }

    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      this.fastCameraMove = true;
      if (this.isCameraMovementActive()) {
        this.requestRender("camera-key-move");
      }
      return;
    }

    if (!cameraMovementKeyCodes.has(event.code)) {
      return;
    }

    // Plain E moves the camera upward. Shift+E is reserved by the app shell for
    // edge-label toggling, so the renderer must leave that chord alone.
    if (event.code === "KeyE" && event.shiftKey) {
      return;
    }

    event.preventDefault();
    this.fastCameraMove = this.fastCameraMove || event.shiftKey;
    const previousSize = this.movementKeys.size;
    this.movementKeys.add(event.code);
    if (previousSize !== this.movementKeys.size) {
      this.cameraInteractionActive = true;
      this.pendingHoverPoint = undefined;
      this.gpuHoverRequest += 1;
      this.requestRender("camera-key-move");
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      this.fastCameraMove = event.shiftKey;
      return;
    }

    if (cameraMovementKeyCodes.has(event.code)) {
      this.movementKeys.delete(event.code);
      this.fastCameraMove = event.shiftKey;
      if (this.movementKeys.size === 0) {
        this.cameraInteractionActive = false;
      }
    }
  };

  private readonly handleWindowBlur = () => {
    this.movementKeys.clear();
    this.fastCameraMove = false;
    this.cameraInteractionActive = false;
  };

  /** Returns true when the scheme actually changed. */
  private setColorScheme(colorScheme: SceneColorScheme): boolean {
    if (this.colorScheme === colorScheme && this.scene.background) {
      return false;
    }
    this.colorScheme = colorScheme;
    this.scene.background = new Color(sceneBackgroundColor[colorScheme]);
    this.requestRender("theme");
    return true;
  }

  private isCameraMovementActive(): boolean {
    if (
      this.movementKeys.size === 0 ||
      isEditableKeyboardTarget(document.activeElement)
    ) {
      return false;
    }
    const intent = this.cameraMovementIntent();
    return intent.forward !== 0 || intent.strafe !== 0 || intent.vertical !== 0;
  }

  private cameraMovementIntent(): CameraMovementIntent {
    return {
      forward:
        Number(this.movementKeys.has("KeyW")) -
        Number(this.movementKeys.has("KeyS")),
      strafe:
        Number(this.movementKeys.has("KeyD")) -
        Number(this.movementKeys.has("KeyA")),
      vertical:
        Number(this.movementKeys.has("KeyE")) -
        Number(this.movementKeys.has("KeyQ")),
      fast: this.fastCameraMove,
    };
  }

  private applyCameraMovement(deltaMs: number): boolean {
    if (!this.isCameraMovementActive()) {
      return false;
    }

    const forward = new Vector3();
    const right = new Vector3();
    this.camera.getWorldDirection(forward);
    right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const speed = Math.max(
      cameraMoveMinimumSpeed,
      this.camera.position.distanceTo(this.controls.target) *
        cameraMoveDistanceScale,
    );
    const delta = cameraLocalMovementDelta(
      { forward, right, vertical: unitZ },
      this.cameraMovementIntent(),
      Math.min(deltaMs, 100) / 1000,
      speed,
      cameraMoveFastMultiplier,
      cameraMoveDirectionalScale,
    );
    if (delta.lengthSq() === 0) {
      return false;
    }

    this.camera.position.add(delta);
    this.controls.target.add(delta);
    return true;
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    this.pointerDownPosition = { x: event.clientX, y: event.clientY };
  };

  private ensureSceneLookups(update: GraphUpdate): void {
    if (this.nodeLookupSource !== update.nodes) {
      this.nodeLookupSource = update.nodes;
      this.nodesById = new Map(update.nodes.map((node) => [node.id, node]));
    }
    if (this.adjacencySource !== update.edges) {
      this.adjacencySource = update.edges;
      const adjacency = new Map<string, Set<string>>();
      for (const edge of update.edges) {
        const sourceNeighbors = adjacency.get(edge.source) ?? new Set<string>();
        sourceNeighbors.add(edge.target);
        adjacency.set(edge.source, sourceNeighbors);
        const targetNeighbors = adjacency.get(edge.target) ?? new Set<string>();
        targetNeighbors.add(edge.source);
        adjacency.set(edge.target, targetNeighbors);
      }
      this.neighborIdsByNode = adjacency;
    }
  }

  private neighborsFor(nodeId: string | undefined): ReadonlySet<string> {
    return nodeId
      ? (this.neighborIdsByNode.get(nodeId) ?? this.emptyNeighborIds)
      : this.emptyNeighborIds;
  }

  private readonly handlePointerUp = async (event: PointerEvent) => {
    const start = this.pointerDownPosition;
    this.pointerDownPosition = undefined;
    if (!this.pickingEnabled || event.button !== 0) {
      return;
    }
    if (
      !start ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4
    ) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    const pickPoint = cssPointInElement(event, rect);
    this.pointer.copy(pickPoint.normalized);
    if (this.gpuPickingActive) {
      try {
        const epoch = this.gpuPickEpoch;
        const startedAt = performance.now();
        let pickId = await this.gpuIdPicker.pick(
          this.renderer,
          this.gpuNodePickingScene,
          this.camera,
          rect,
          pickPoint.pixel,
        );
        if (pickId === 0 && this.pickEdgeAt(pickPoint.pixel, rect)) {
          return;
        }
        if (pickId === 0) {
          pickId = await this.gpuIdPicker.pick(
            this.renderer,
            this.gpuPickingScene,
            this.camera,
            rect,
            pickPoint.pixel,
          );
        }
        if (epoch !== this.gpuPickEpoch) {
          return;
        }
        const record = this.gpuPickRecords.get(pickId);
        this.stats = {
          ...this.stats,
          picking: {
            total: this.gpuPickRecords.size,
            candidates: record ? 1 : 0,
            rejected: Math.max(0, this.gpuPickRecords.size - (record ? 1 : 0)),
            usedPrefilter: true,
            minimumEntryCount: gpuPickingEntryThreshold,
            padding: 0,
            strategy: "gpu",
            queryMs: performance.now() - startedAt,
          },
        };
        this.publishStats();
        if (record?.kind === "node") {
          this.onSelectNode(record.id);
          this.requestRender("pick-node-gpu");
        } else if (record?.kind === "cell") {
          this.onSelectCell(record.id);
          this.requestRender("pick-cell-gpu");
        }
        return;
      } catch {
        // A context can lose readback support while ordinary rendering keeps
        // working. Switch this scene to the retained CPU index without making
        // selection unavailable for the rest of the session.
        this.gpuPickingActive = false;
        this.ensureCellPickingIndex();
      }
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);

    let nearestNode: { distance: number; nodeId: string } | undefined;
    for (const bucket of this.nodeMeshes) {
      const nodeHits = this.raycaster.intersectObject(bucket.mesh);
      const hit = nodeHits[0];
      if (hit?.instanceId !== undefined) {
        const nodeId = bucket.nodeIds[hit.instanceId];
        if (
          nodeId &&
          (nearestNode === undefined || hit.distance < nearestNode.distance)
        ) {
          nearestNode = { distance: hit.distance, nodeId };
        }
      }
    }
    if (nearestNode) {
      this.onSelectNode(nearestNode.nodeId);
      this.requestRender("pick-node");
      return;
    }
    if (this.pickEdgeAt(pickPoint.pixel, rect)) {
      return;
    }

    const cellId = this.pickCellWithBvh();
    if (cellId) {
      this.onSelectCell(cellId);
      this.requestRender("pick-cell");
    }
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (!this.onHoverCell || this.cameraInteractionActive) {
      return;
    }
    this.pendingHoverPoint = { x: event.clientX, y: event.clientY };
    if (this.hoverFrame !== undefined) {
      return;
    }
    this.hoverFrame = window.requestAnimationFrame(this.processHover);
  };

  private readonly processHover = async () => {
    this.hoverFrame = undefined;
    const point = this.pendingHoverPoint;
    this.pendingHoverPoint = undefined;
    if (!this.onHoverCell || !point || this.cameraInteractionActive) {
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pickPoint = cssPointInElement(
      { clientX: point.x, clientY: point.y },
      rect,
    );
    this.pointer.copy(pickPoint.normalized);
    if (this.gpuPickingActive) {
      try {
        const request = ++this.gpuHoverRequest;
        const epoch = this.gpuPickEpoch;
        const startedAt = performance.now();
        const pickId = await this.gpuIdPicker.pick(
          this.renderer,
          this.gpuPickingScene,
          this.camera,
          rect,
          pickPoint.pixel,
        );
        if (request !== this.gpuHoverRequest || epoch !== this.gpuPickEpoch) {
          return;
        }
        const record = this.gpuPickRecords.get(pickId);
        this.stats = {
          ...this.stats,
          picking: {
            total: this.gpuPickRecords.size,
            candidates: record ? 1 : 0,
            rejected: Math.max(0, this.gpuPickRecords.size - (record ? 1 : 0)),
            usedPrefilter: true,
            minimumEntryCount: gpuPickingEntryThreshold,
            padding: 0,
            strategy: "gpu",
            queryMs: performance.now() - startedAt,
          },
        };
        this.publishStats();
        const nextCellId = record?.kind === "cell" ? record.id : undefined;
        if (nextCellId !== this.hoveredCellId) {
          this.hoveredCellId = nextCellId;
          this.onHoverCell(nextCellId);
          this.requestRender("hover-cell-gpu");
        }
        return;
      } catch {
        this.gpuPickingActive = false;
        this.ensureCellPickingIndex();
      }
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const nextCellId = this.pickCellWithBvh();
    if (nextCellId !== this.hoveredCellId) {
      this.hoveredCellId = nextCellId;
      this.onHoverCell(nextCellId);
      this.requestRender("hover-cell");
    }
  };

  /**
   * Edge picking in screen space: the drawn edge whose projected segment
   * passes within edgePickTolerancePx of the click wins (nearest in pixels,
   * then nearest in depth). Lines are 1px wide, so a ray test against the
   * 3D segments would almost never hit. Runs only when a caller listens.
   */
  private pickEdgeAt(
    pixel: { x: number; y: number },
    rect: Pick<DOMRect, "width" | "height">,
  ): boolean {
    const update = this.lastGraphUpdate;
    if (!this.onSelectEdge || !update) {
      return false;
    }
    const segments: ScreenSegment[] = [];
    const projected = new Vector3();
    const toScreen = (point: Vector3): [number, number, number] | undefined => {
      projected.copy(point).project(this.camera);
      if (projected.z < -1 || projected.z > 1) {
        return undefined;
      }
      return [
        ((projected.x + 1) / 2) * rect.width,
        ((1 - projected.y) / 2) * rect.height,
        projected.z,
      ];
    };
    for (const edge of selectRenderableEdges(update)) {
      if (edge.ghost) {
        continue;
      }
      const source = update.nodePositions.get(edge.source);
      const target = update.nodePositions.get(edge.target);
      if (!source || !target || source.equals(target)) {
        continue;
      }
      const path = edgePathPoints(edge, source, target, update);
      if (!path) {
        continue;
      }
      for (let index = 1; index < path.length; index += 1) {
        const a = toScreen(path[index - 1]);
        const b = toScreen(path[index]);
        if (a && b) {
          segments.push({ id: edge.id, a, b });
        }
      }
    }
    const edgeId = nearestScreenSegment(
      [pixel.x, pixel.y],
      segments,
      edgePickTolerancePx,
    );
    if (!edgeId) {
      return false;
    }
    this.onSelectEdge(edgeId);
    this.requestRender("pick-edge");
    return true;
  }

  private pickCellWithBvh(): string | undefined {
    const startedAt = performance.now();
    const ray: PickingRay = {
      origin: [
        this.raycaster.ray.origin.x,
        this.raycaster.ray.origin.y,
        this.raycaster.ray.origin.z,
      ],
      direction: [
        this.raycaster.ray.direction.x,
        this.raycaster.ray.direction.y,
        this.raycaster.ray.direction.z,
      ],
    };
    const result = this.cellPickingIndex.queryRay(ray, {
      padding: 0.12,
      maxCandidates: 96,
    });
    let selectedId: string | undefined;
    let selectedDistance = Number.POSITIVE_INFINITY;
    for (const candidate of result.candidates) {
      const hit = intersectPickingCandidateTriangles(ray, candidate, {
        cullBackfaces: false,
      });
      if (
        hit &&
        (hit.distance < selectedDistance ||
          (hit.distance === selectedDistance &&
            (selectedId === undefined || hit.id.localeCompare(selectedId) < 0)))
      ) {
        selectedId = hit.id;
        selectedDistance = hit.distance;
      }
    }
    this.stats = {
      ...this.stats,
      picking: {
        total: result.stats.totalItems,
        candidates: result.stats.returnedCount,
        rejected: Math.max(
          0,
          result.stats.totalItems - result.stats.candidateCount,
        ),
        usedPrefilter: result.stats.totalItems > 0,
        minimumEntryCount: 1,
        padding: 0.12,
        strategy: "bvh",
        buildMs: this.cellPickingBuildMs,
        queryMs: performance.now() - startedAt,
      },
    };
    this.publishStats();
    return selectedId;
  }

  private ensureCellPickingIndex(): void {
    if (this.cellPickingIndex.getStats().itemCount > 0) {
      return;
    }
    const update = this.lastGraphUpdate;
    if (!update?.showCells) {
      return;
    }
    const items: PickingSpatialItem<SceneCell>[] = [];
    for (const cell of update.cells) {
      const vertices = this.cellVerticesById.get(cell.id);
      if (
        vertices &&
        vertices.length >= 3 &&
        this.pickableCellIds.has(cell.id)
      ) {
        const item = createCellPickingItem(
          cell,
          vertices,
          cellDrawingSurface(cell, update.localCellRenderMode),
        );
        if (item) {
          items.push(item);
        }
      }
    }
    const startedAt = performance.now();
    this.cellPickingIndex.build(items);
    this.cellPickingBuildMs = performance.now() - startedAt;
  }

  private requestRender(reason: string, dampingFrames = 0) {
    this.stats.renderReason = reason;
    this.dampingFramesRemaining = Math.max(
      this.dampingFramesRemaining,
      dampingFrames,
    );
    if (this.animationFrame !== undefined) {
      return;
    }
    // A demand-driven renderer may sit idle for minutes. Start the timing
    // window when work is requested so the next sample measures the active
    // frame cadence rather than the intentional idle interval.
    this.previousFrameTime = performance.now();
    this.animationFrame = window.requestAnimationFrame(() =>
      this.renderFrame(reason),
    );
  }

  private scheduleDampingFrames(reason: string, frameCount = 24) {
    this.requestRender(reason, frameCount);
  }

  private readonly renderFrame = (reason: string) => {
    this.animationFrame = undefined;
    const now = performance.now();
    const deltaMs = now - this.previousFrameTime;
    this.previousFrameTime = now;
    this.frame += 1;
    this.stats.frame = this.frame;
    this.stats.frameSamples = appendFrameSample(this.stats.frameSamples, {
      frame: this.frame,
      deltaMs,
    });
    const movedByKeyboard = this.applyCameraMovement(deltaMs);
    const controlsChanged = this.controls.update();
    this.render(movedByKeyboard ? "camera-key-move" : reason);
    if (this.dampingFramesRemaining > 0) {
      this.dampingFramesRemaining -= 1;
    }
    const continueDamping = controlsChanged && this.dampingFramesRemaining > 0;
    if (movedByKeyboard || this.isCameraMovementActive() || continueDamping) {
      this.animationFrame = window.requestAnimationFrame(() =>
        this.renderFrame(
          this.isCameraMovementActive() ? "camera-key-move" : "camera-damping",
        ),
      );
    }
  };

  private readonly render = (reason: string) => {
    this.applyLabelScreenScale();
    this.applyLabelDepthFade();
    this.renderer.render(this.scene, this.camera);
    this.stats.renderReason = reason;
    this.stats.renderCount += 1;
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    const notifyCallback = this.notifyStatsOnNextRender;
    this.notifyStatsOnNextRender = false;
    this.publishStats({ notifyCallback, force: notifyCallback });
  };

  /**
   * Labels are sized in world units, so a large or far-away scene can shrink
   * them to a few pixels. Scale every label up so an edge label is at least
   * minimumEdgeLabelPixels tall at the orbit target's depth.
   */
  private applyLabelScreenScale() {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const factor = labelScreenScale(
      this.viewportHeight,
      distance,
      this.camera.fov,
    );
    if (Math.abs(factor - this.appliedLabelScreenScale) < 0.01) {
      return;
    }
    this.appliedLabelScreenScale = factor;
    this.rescaleLabels();
  }

  /**
   * Labels draw without depth testing so they are never cut by edges, which
   * also lets labels of far vertices sit over nearer geometry. They are faded
   * by depth instead: full opacity up to the orbit target, then down to
   * labelFadeMinimumOpacity one framed radius further back. Labels of the
   * selected vertex, its neighbours and its edges stay opaque.
   */
  private applyLabelDepthFade() {
    if (this.labelFadeEntries.length === 0) {
      return;
    }
    const camera = this.camera.position;
    const target = this.controls.target;
    const key = `${camera.x.toFixed(3)},${camera.y.toFixed(3)},${camera.z.toFixed(3)}:${target.x.toFixed(3)},${target.y.toFixed(3)},${target.z.toFixed(3)}`;
    if (key === this.labelFadeCameraKey) {
      return;
    }
    this.labelFadeCameraKey = key;
    const focusDistance = camera.distanceTo(target);
    for (const entry of this.labelFadeEntries) {
      const opacity = entry.pinned
        ? 1
        : (entry.scale ?? 1) *
          labelDepthOpacity(
            camera.distanceTo(entry.anchor),
            focusDistance,
            this.framedSceneRadius,
          );
      if (Math.abs(opacity - entry.opacity) < 0.02) {
        continue;
      }
      entry.opacity = opacity;
      if (entry.sprite) {
        entry.sprite.material.opacity = opacity;
      } else if (entry.sdfId) {
        this.activeSdfBatch?.setLabelOpacity(entry.sdfId, opacity);
      }
    }
  }

  /**
   * "fade-far" focus: an edge recedes when both endpoints are at graph
   * distance >= 2 from the selection (SceneNode.localDistance). Nodes without
   * localDistance count as near, so the mode is a no-op until the caller
   * supplies distances.
   */
  private edgeIsFar(edge: SceneEdge, update: GraphUpdate): boolean {
    if (update.occlusionMode !== "fade-far") {
      return false;
    }
    return (
      isFarNode(this.nodesById.get(edge.source)) &&
      isFarNode(this.nodesById.get(edge.target))
    );
  }

  private isSelectionContextNode(nodeId: string, update: GraphUpdate) {
    return (
      nodeId === update.selectedNodeId ||
      this.neighborsFor(update.selectedNodeId).has(nodeId)
    );
  }

  private rescaleLabels() {
    const factor = this.appliedLabelScreenScale;
    for (const child of this.labelGroup.children) {
      if (child instanceof Sprite) {
        const base = child.userData.baseScale as [number, number] | undefined;
        if (base) {
          child.scale.set(base[0] * factor, base[1] * factor, 1);
        }
      }
    }
    this.activeSdfBatch?.setLabelScale(factor);
  }

  private publishStats(
    options: { notifyCallback?: boolean; force?: boolean } = {},
  ) {
    // Keep the cheap global reference current for tests and diagnostics, but
    // avoid DOM writes and bubbling events on every camera frame. Four updates
    // per second are ample for visible statistics; scene changes force one
    // publication after the corresponding WebGL render has completed.
    window.__coxeterSceneStats = this.stats;
    const now = performance.now();
    if (!options.force && now - this.lastDetailedStatsPublishAt < 250) {
      return;
    }
    this.lastDetailedStatsPublishAt = now;
    const stats = { ...this.stats, frameSamples: [...this.stats.frameSamples] };
    window.__coxeterSceneStats = stats;
    this.mount.dataset.sceneMode = stats.mode;
    this.mount.dataset.renderedNodes = String(stats.renderedNodes);
    this.mount.dataset.renderedEdges = String(stats.renderedEdgeSegments);
    this.mount.dataset.renderedCells = String(stats.renderedCells);
    this.mount.dataset.nodeLabels = String(stats.renderedNodeLabels);
    this.mount.dataset.edgeLabels = String(stats.renderedEdgeLabels);
    this.mount.dataset.labelLeaders = String(stats.renderedLabelLeaders);
    this.mount.dataset.labelRenderer = stats.labelRenderer;
    this.mount.dataset.labelRendererFallbackReason =
      stats.labelRendererFallbackReason ?? "";
    this.mount.dataset.pickingStrategy = stats.picking.strategy ?? "linear";
    this.mount.dataset.stateNodesIn = String(stats.stateNodeHighlights.inState);
    this.mount.dataset.stateNodesOut = String(
      stats.stateNodeHighlights.outOfState,
    );
    this.mount.dataset.cellRenderMode = stats.localCellRenderMode;
    this.mount.dataset.occlusionMode = stats.occlusionMode;
    this.mount.dataset.topologyVersion = stats.revisions?.topologyVersion ?? "";
    this.mount.dataset.cellGeometryVersion =
      stats.revisions?.cellGeometryVersion ?? "";
    this.mount.dataset.labelVersion = stats.revisions?.labelVersion ?? "";
    this.mount.dataset.longTasks = String(stats.performanceTrace.longTaskCount);
    this.mount.dataset.estimatedSceneBytes = String(
      stats.performanceTrace.estimatedSceneBytes,
    );
    this.mount.dataset.frame = String(stats.frame);
    this.mount.dispatchEvent(
      new CustomEvent<SceneRenderStats>("coxeter:scene-stats", {
        bubbles: true,
        detail: stats,
      }),
    );
    if (options.notifyCallback) {
      this.onRenderStats?.(stats);
    }
  }
}

function emptySceneStats(runtimeId = "unmounted"): SceneRenderStats {
  return {
    runtimeId,
    mode: "global",
    graphNodes: 0,
    graphEdges: 0,
    graphCells: 0,
    renderedNodes: 0,
    renderedEdgeSegments: 0,
    renderedCells: 0,
    renderedNodeLabels: 0,
    renderedEdgeLabels: 0,
    renderedLabelLeaders: 0,
    labelRenderer: "sprite",
    labelRendererFallbackReason: undefined,
    drawCalls: 0,
    triangles: 0,
    frame: 0,
    frameSamples: [],
    renderReason: "init",
    renderCount: 0,
    lodNodes: { high: 0, low: 0 },
    stateNodeHighlights: { inState: 0, outOfState: 0 },
    omittedTransparentFills: 0,
    picking: emptySpatialPickStats(),
    lastGraphUpdateMs: 0,
    localCellRenderMode: "in-graph",
    occlusionMode: "hide-far",
    performanceTrace: {
      longTaskCount: 0,
      longTaskTotalMs: 0,
      longTaskMaxMs: 0,
      longTaskDurations: [],
      estimatedSceneBytes: 0,
    },
  };
}

function estimateSceneBytes(update: GraphUpdate): number {
  const nodeBytes = update.nodes.length * 96;
  const edgeBytes = update.edges.length * 128;
  const cellVertexCount = update.cells.reduce(
    (total, cell) => total + cell.boundaryNodeIds.length,
    0,
  );
  const cellBytes = cellVertexCount * 3 * Float32Array.BYTES_PER_ELEMENT * 2;
  const labelBytes =
    (update.showNodeLabels ? update.maxNodeLabels : 0) * 2048 +
    (update.showEdgeLabels ? update.maxEdgeLabels : 0) * 2048;
  return nodeBytes + edgeBytes + cellBytes + labelBytes;
}

function emptySpatialPickStats(): SpatialPickPrefilterStats {
  return {
    total: 0,
    candidates: 0,
    rejected: 0,
    usedPrefilter: false,
    minimumEntryCount: 32,
    padding: 0,
    strategy: "linear",
    buildMs: 0,
    queryMs: 0,
  };
}

const cameraMovementKeyCodes = new Set([
  "KeyW",
  "KeyS",
  "KeyA",
  "KeyD",
  "KeyQ",
  "KeyE",
]);

// eslint-disable-next-line react-refresh/only-export-components
export function cameraLocalMovementDelta(
  axes: CameraMovementAxes,
  intent: CameraMovementIntent,
  deltaSeconds: number,
  speed: number,
  fastMultiplier = cameraMoveFastMultiplier,
  directionalScale: CameraMovementDirectionalScale = {
    forward: 1,
    strafe: 1,
    vertical: 1,
  },
): Vector3 {
  const delta = new Vector3();
  const scale = deltaSeconds * speed * (intent.fast ? fastMultiplier : 1);
  if (scale <= 0) {
    return delta;
  }

  addScaledNormal(
    delta,
    axes.forward,
    intent.forward * scale * directionalScale.forward,
  );
  addScaledNormal(
    delta,
    axes.right,
    intent.strafe * scale * directionalScale.strafe,
  );
  addScaledNormal(
    delta,
    axes.vertical,
    intent.vertical * scale * directionalScale.vertical,
  );
  return delta;
}

function addScaledNormal(delta: Vector3, axis: Vector3, scale: number) {
  const lengthSquared = axis.lengthSq();
  if (scale === 0 || lengthSquared === 0) {
    return;
  }
  delta.addScaledVector(axis, scale / Math.sqrt(lengthSquared));
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (
    target.closest(
      '[contenteditable="true"], [contenteditable="plaintext-only"]',
    )
  ) {
    return true;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

// eslint-disable-next-line react-refresh/only-export-components
export function prefilterSpatialPickSpheres<T extends SpatialPickSphere>(
  entries: readonly T[],
  distanceSqToPoint: (point: readonly [number, number, number]) => number,
  options: { minimumEntryCount?: number; padding?: number; target?: T[] } = {},
): { candidates: T[]; stats: SpatialPickPrefilterStats } {
  const minimumEntryCount = options.minimumEntryCount ?? 32;
  const padding = options.padding ?? 0;
  if (entries.length < minimumEntryCount) {
    const candidates = options.target ?? [];
    candidates.length = 0;
    candidates.push(...entries);
    return {
      candidates,
      stats: {
        total: entries.length,
        candidates: entries.length,
        rejected: 0,
        usedPrefilter: false,
        minimumEntryCount,
        padding,
      },
    };
  }

  const candidates = options.target ?? [];
  candidates.length = 0;
  for (const entry of entries) {
    const radius = entry.radius + padding;
    if (distanceSqToPoint(entry.center) <= radius * radius) {
      candidates.push(entry);
    }
  }
  return {
    candidates,
    stats: {
      total: entries.length,
      candidates: candidates.length,
      rejected: entries.length - candidates.length,
      usedPrefilter: true,
      minimumEntryCount,
      padding,
    },
  };
}

/** Screen-space tolerance for edge picking, in CSS pixels. */
const edgePickTolerancePx = 6;

export interface ScreenSegment {
  id: string;
  /** Endpoints as [x, y, ndcDepth] in CSS pixels. */
  a: readonly [number, number, number];
  b: readonly [number, number, number];
}

/**
 * Id of the segment nearest to `point` within `tolerance` pixels, ties
 * (within 0.5 px) broken by the depth of the closest point on the segment.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function nearestScreenSegment(
  point: readonly [number, number],
  segments: readonly ScreenSegment[],
  tolerance: number,
): string | undefined {
  let bestId: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestDepth = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    const dx = segment.b[0] - segment.a[0];
    const dy = segment.b[1] - segment.a[1];
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq > 0
        ? Math.min(
            1,
            Math.max(
              0,
              ((point[0] - segment.a[0]) * dx +
                (point[1] - segment.a[1]) * dy) /
                lengthSq,
            ),
          )
        : 0;
    const x = segment.a[0] + t * dx;
    const y = segment.a[1] + t * dy;
    const distance = Math.hypot(point[0] - x, point[1] - y);
    if (distance > tolerance) {
      continue;
    }
    const depth = segment.a[2] + t * (segment.b[2] - segment.a[2]);
    if (
      distance < bestDistance - 0.5 ||
      (Math.abs(distance - bestDistance) <= 0.5 && depth < bestDepth)
    ) {
      bestId = segment.id;
      bestDistance = distance;
      bestDepth = depth;
    }
  }
  return bestId;
}

/** Fraction of the shorter viewport side the fitted bounding sphere spans. */
const sceneFrameFill = 0.7;
/** Projection views: vertical field of view and fill for the model ball. */
const referenceBallFov = 45;
const referenceBallFrameFill = 0.92;
/** Lower bound on the framed radius so one or two vertices are not giant. */
const minimumFramedRadius = 0.6;
/** Planarity test: thinnest/widest principal spread below this is "flat". */
const coplanarSpreadRatio = 0.12;
/** Tilt off the plane normal, so flat scenes keep a little depth cue. */
const coplanarViewTilt = (12 * Math.PI) / 180;
/** Default oblique view direction of the global preset (camera - target). */
const defaultFrameDirection = new Vector3(0, -2.6, 1.5).normalize();

export interface SceneFraming {
  center: Vector3;
  /** Unit vector from the orbit target toward the camera. */
  direction: Vector3;
  distance: number;
  radius: number;
  coplanar: boolean;
}

/**
 * Camera framing for the global preset. Node positions are never moved.
 *
 * The bounding sphere (about the bounding-box center) is fitted so it spans
 * ~70% of the shorter viewport side. When the points are (nearly) coplanar,
 * as for a single Davis 2m-gon or a planar Gamma drawing, the camera looks
 * along the plane normal, tilted slightly toward the default view so the
 * polygon is seen face-on rather than edge-on. Collinear points are viewed
 * perpendicular to their line.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function computeSceneFraming(
  points: readonly Vector3[],
  fovDegrees: number,
  aspect: number,
  fill = sceneFrameFill,
): SceneFraming {
  const center = new Vector3();
  if (points.length > 0) {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const point of points) {
      min.min(point);
      max.max(point);
    }
    center.addVectors(min, max).multiplyScalar(0.5);
  }
  let radius = 0;
  for (const point of points) {
    radius = Math.max(radius, point.distanceTo(center));
  }
  radius = Math.max(radius, minimumFramedRadius);

  const normal = planeNormalIfCoplanar(points);
  const direction = defaultFrameDirection.clone();
  if (normal) {
    if (normal.dot(direction) < 0) {
      normal.negate();
    }
    // Tangent part of the default direction gives the tilt axis; when the
    // default direction is the normal itself any perpendicular will do.
    const tangent = direction
      .clone()
      .addScaledVector(normal, -direction.dot(normal));
    if (tangent.lengthSq() < 1e-8) {
      tangent.set(1, 0, 0).addScaledVector(normal, -normal.x);
    }
    tangent.normalize();
    direction
      .copy(normal)
      .multiplyScalar(Math.cos(coplanarViewTilt))
      .addScaledVector(tangent, Math.sin(coplanarViewTilt))
      .normalize();
  } else {
    // A collinear drawing seen along the default direction can collapse to
    // a short stub; look perpendicular to the line instead.
    const axis = lineAxisIfCollinear(points);
    if (axis) {
      direction.addScaledVector(axis, -direction.dot(axis));
      if (direction.lengthSq() < 1e-8) {
        direction.set(0, 0, 1).addScaledVector(axis, -axis.z);
      }
      direction.normalize();
    }
  }

  const halfVertical = (Math.max(1, fovDegrees) * Math.PI) / 360;
  const tanVertical = Math.tan(halfVertical);
  const tanHalf =
    Math.min(tanVertical, tanVertical * Math.max(0.05, aspect || 1)) *
    Math.min(1, Math.max(0.05, fill));
  // A sphere of radius r at distance d subtends tan(theta) = r / sqrt(d^2 - r^2).
  const distance = radius * Math.sqrt(1 + 1 / (tanHalf * tanHalf));
  return {
    center,
    direction,
    distance,
    radius,
    coplanar: normal !== undefined,
  };
}

interface PointSpread {
  /** Covariance eigenvalues, ascending (clamped at 0). */
  values: [number, number, number];
  /** Matching unit eigenvectors. */
  axes: [Vector3, Vector3, Vector3];
}

function principalSpread(points: readonly Vector3[]): PointSpread | undefined {
  if (points.length < 2) {
    return undefined;
  }
  const mean = new Vector3();
  for (const point of points) {
    mean.add(point);
  }
  mean.multiplyScalar(1 / points.length);
  const c = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const point of points) {
    const d = [point.x - mean.x, point.y - mean.y, point.z - mean.z];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        c[i][j] += d[i] * d[j];
      }
    }
  }
  const { values, vectors } = symmetricEigen3(c);
  const order = [0, 1, 2].sort((a, b) => values[a] - values[b]);
  const axis = (k: number) =>
    new Vector3(vectors[0][k], vectors[1][k], vectors[2][k]).normalize();
  return {
    values: order.map((k) => Math.max(0, values[k])) as [
      number,
      number,
      number,
    ],
    axes: order.map(axis) as [Vector3, Vector3, Vector3],
  };
}

/**
 * Unit normal of the best-fit plane when the point cloud is flat, otherwise
 * undefined. Uses the eigenvector of the smallest covariance eigenvalue;
 * collinear or tiny inputs have no well-defined plane and return undefined.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function planeNormalIfCoplanar(
  points: readonly Vector3[],
): Vector3 | undefined {
  const spread = points.length >= 3 ? principalSpread(points) : undefined;
  if (!spread) {
    return undefined;
  }
  const [smallest, middle, largest] = spread.values;
  if (largest <= 1e-12 || middle <= 1e-6 * largest) {
    return undefined;
  }
  if (Math.sqrt(smallest / largest) >= coplanarSpreadRatio) {
    return undefined;
  }
  return spread.axes[0];
}

/**
 * Unit direction of the best-fit line when the points are (nearly)
 * collinear, e.g. a two-vertex defining graph; otherwise undefined.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function lineAxisIfCollinear(
  points: readonly Vector3[],
): Vector3 | undefined {
  const spread = principalSpread(points);
  if (!spread) {
    return undefined;
  }
  const [, middle, largest] = spread.values;
  if (largest <= 1e-12 || Math.sqrt(middle / largest) >= coplanarSpreadRatio) {
    return undefined;
  }
  return spread.axes[2];
}

/** Cyclic Jacobi eigen-decomposition of a symmetric 3x3 matrix. */
function symmetricEigen3(matrix: number[][]): {
  values: number[];
  vectors: number[][];
} {
  const a = matrix.map((row) => [...row]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 32; sweep += 1) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off < 1e-20) {
      break;
    }
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-30) {
        continue;
      }
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t =
        Math.sign(theta || 1) /
        (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const cos = 1 / Math.sqrt(t * t + 1);
      const sin = t * cos;
      for (let k = 0; k < 3; k += 1) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = cos * akp - sin * akq;
        a[k][q] = sin * akp + cos * akq;
      }
      for (let k = 0; k < 3; k += 1) {
        const apk = a[p][k];
        const aqk = a[q][k];
        a[p][k] = cos * apk - sin * aqk;
        a[q][k] = sin * apk + cos * aqk;
      }
      for (let k = 0; k < 3; k += 1) {
        const vkp = v[k][p];
        const vkq = v[k][q];
        v[k][p] = cos * vkp - sin * vkq;
        v[k][q] = sin * vkp + cos * vkq;
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
}

/**
 * Approximate drawn size of a node-label sprite (28px semibold text, 8/5px
 * padding, 0.28 world units tall), for screen-space collision checks.
 */
function nodeLabelChipSize(label: string, scale: number) {
  return {
    worldHeight: 0.28 * scale,
    aspect: (label.length * 0.6 * 28 + 16) / 38,
    anchorBottom: true,
  };
}

/** Smallest on-screen height, in CSS pixels, of an edge-label chip. */
const minimumEdgeLabelPixels = 16;
const edgeLabelWorldHeight = 0.2;
const maximumLabelScreenScale = 2.5;

/**
 * Uniform label scale so an edge label (0.2 world units) is at least
 * minimumEdgeLabelPixels tall at the given camera distance. Capped so a
 * fully zoomed-out view does not turn into a wall of chips.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function labelScreenScale(
  viewportHeight: number,
  distance: number,
  fovDegrees: number,
): number {
  if (!(viewportHeight > 0) || !(distance > 0) || !(fovDegrees > 0)) {
    return 1;
  }
  const worldPerPixel =
    (2 * distance * Math.tan((fovDegrees * Math.PI) / 360)) / viewportHeight;
  const pixels = edgeLabelWorldHeight / worldPerPixel;
  return Math.min(
    maximumLabelScreenScale,
    Math.max(1, minimumEdgeLabelPixels / pixels),
  );
}

function nodeColor(
  node: SceneNode,
  occlusionMode: OcclusionMode,
  colorScheme: SceneColorScheme = "light",
  generators: readonly SceneGenerator[] = [],
) {
  const dark = colorScheme === "dark";
  // Word length is encoded by lightness only; hue stays free for generators.
  const base = shellColor(node.length, colorScheme);
  if (node.stateRole && node.colorHint) {
    return node.colorHint;
  }
  if (node.colorHint && !node.ghost) {
    return node.colorHint;
  }
  if (node.generatorColorIndex !== undefined && !node.ghost) {
    return generatorColor(generators, node.generatorColorIndex, colorScheme);
  }
  // Ghost and far vertices recede toward the background in either theme.
  if (node.ghost) {
    return dark
      ? occlusionMode === "x-ray"
        ? "#334155"
        : "#475569"
      : occlusionMode === "x-ray"
        ? "#e5eaf0"
        : "#cbd5e1";
  }
  if (occlusionMode === "fade-far" && (node.localDistance ?? 0) >= 2) {
    return dark ? "#64748b" : "#9aa7b5";
  }
  if (occlusionMode === "x-ray" && (node.localDistance ?? 0) >= 2) {
    return dark ? "#475569" : "#d5dbe3";
  }
  return base;
}

function countStateNodeHighlights(nodes: readonly SceneNode[]) {
  let inState = 0;
  let outOfState = 0;
  for (const node of nodes) {
    if (node.stateRole === "in-state") {
      inState += 1;
    } else if (node.stateRole === "out-of-state") {
      outOfState += 1;
    }
  }
  return { inState, outOfState };
}

function isHighDetailNode(node: SceneNode, update: GraphUpdate): boolean {
  return (
    node.stateRole !== undefined ||
    node.id === update.selectedNodeId ||
    node.isRelationBoundary === true ||
    ((node.localDistance ?? 0) <= 1 && node.ghost !== true)
  );
}

/**
 * Fill budget fallback for scenes whose cells carry no localDistance (e.g.
 * bar X with all relation families): the `budget` cells whose boundary
 * centroid is nearest the selected vertex, or the centre of the drawing when
 * nothing is selected. Undefined when localDistance is available, so the
 * graph-distance rule applies.
 */
function nearestCellsForFillBudget(
  update: GraphUpdate,
  budget: number,
): Set<string> | undefined {
  if (update.cells.some((cell) => cell.localDistance !== undefined)) {
    return undefined;
  }
  let focus = update.selectedNodeId
    ? update.nodePositions.get(update.selectedNodeId)
    : undefined;
  if (!focus) {
    focus = new Vector3();
    for (const position of update.nodePositions.values()) {
      focus.add(position);
    }
    focus.multiplyScalar(1 / Math.max(1, update.nodePositions.size));
  }
  const ranked: Array<{ id: string; distance: number }> = [];
  const centroid = new Vector3();
  for (const cell of update.cells) {
    centroid.set(0, 0, 0);
    let count = 0;
    for (const nodeId of cell.boundaryNodeIds) {
      const position = update.nodePositions.get(nodeId);
      if (position) {
        centroid.add(position);
        count += 1;
      }
    }
    if (count === 0) continue;
    centroid.multiplyScalar(1 / count);
    ranked.push({ id: cell.id, distance: centroid.distanceToSquared(focus) });
  }
  ranked.sort(
    (left, right) =>
      left.distance - right.distance || left.id.localeCompare(right.id),
  );
  return new Set(ranked.slice(0, budget).map((entry) => entry.id));
}

function shouldFillTransparentCell(
  cell: SceneCell,
  update: GraphUpdate,
  applyBudget: boolean,
  filledCount: number,
  budget: number,
  nearestFillIds?: ReadonlySet<string>,
): boolean {
  if (!applyBudget) {
    return true;
  }
  const activePairKey = update.activeGeneratorPair
    ? pairKey(update.activeGeneratorPair)
    : undefined;
  if (
    isSelectedCell(cell, update.selectedCellId) ||
    cell.isRelationBoundary ||
    (activePairKey !== undefined &&
      pairKey(cell.generatorPair) === activePairKey)
  ) {
    return true;
  }
  if (nearestFillIds) {
    return nearestFillIds.has(cell.id);
  }
  if ((cell.localDistance ?? Number.POSITIVE_INFINITY) > 1) {
    return false;
  }
  return filledCount < budget;
}

interface CellDrawingSurface {
  center?: Vector3;
  ring?: Vector3[];
}

function createCellFillGeometry(
  vertices: Vector3[],
  surface?: CellDrawingSurface,
) {
  const coordinates: number[] = [];
  if (!pushCellFillCoordinates(coordinates, vertices, surface)) {
    return undefined;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(coordinates), 3),
  );
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Appends fill triangles for one drawn cell and returns false when the cell
 * gets no fill. Scene-builder surfaces (interior point / fold ring) are used
 * as given; otherwise the boundary is triangulated so the fill stays inside
 * the drawn boundary cycle (see cellPolygon.ts).
 */
function pushCellFillCoordinates(
  coordinates: number[],
  vertices: Vector3[],
  surface?: CellDrawingSurface,
): boolean {
  if (surface?.ring?.length === vertices.length) {
    const ring = surface.ring;
    vertices.forEach((vertex, index) => {
      const next = vertices[(index + 1) % vertices.length];
      const rim = ring[index];
      const nextRim = ring[(index + 1) % ring.length];
      coordinates.push(
        ...vectorToArray(vertex),
        ...vectorToArray(next),
        ...vectorToArray(nextRim),
        ...vectorToArray(vertex),
        ...vectorToArray(nextRim),
        ...vectorToArray(rim),
      );
    });
    if (surface.center) {
      ring.forEach((rim, index) => {
        coordinates.push(
          ...vectorToArray(surface.center!),
          ...vectorToArray(rim),
          ...vectorToArray(ring[(index + 1) % ring.length]),
        );
      });
    } else {
      for (let index = 1; index < ring.length - 1; index += 1) {
        coordinates.push(
          ...vectorToArray(ring[0]),
          ...vectorToArray(ring[index]),
          ...vectorToArray(ring[index + 1]),
        );
      }
    }
    return true;
  }
  if (surface?.center) {
    vertices.forEach((vertex, index) => {
      const next = vertices[(index + 1) % vertices.length];
      coordinates.push(
        ...vectorToArray(surface.center!),
        ...vectorToArray(vertex),
        ...vectorToArray(next),
      );
    });
    return true;
  }
  const triangulation = triangulateCellBoundary(vertices.map(vectorToArray));
  if (!triangulation) {
    return false;
  }
  const corner = (index: number) =>
    index === triangulation.centroidIndex && triangulation.centroid
      ? triangulation.centroid
      : vectorToArray(vertices[index]);
  for (const [a, b, c] of triangulation.triangles) {
    coordinates.push(...corner(a), ...corner(b), ...corner(c));
  }
  return true;
}

/** True when the cell has a fill that stays inside its drawn boundary. */
function cellHasFill(
  vertices: Vector3[],
  surface: CellDrawingSurface | undefined,
): boolean {
  if (surface?.ring?.length === vertices.length || surface?.center) {
    return true;
  }
  return triangulateCellBoundary(vertices.map(vectorToArray)) !== undefined;
}

function pushCellOutlineCoordinates(
  coordinates: number[],
  vertices: Vector3[],
  surface?: CellDrawingSurface,
) {
  // Spread disks reuse the exact graph edges as their boundary. Drawing that
  // boundary once per incident cell stacks several colored lines on the same
  // rail, so the cell layer contributes only its folds and reading rim.
  // The unsplit case still draws its own polygon outline as before.
  if (!surface?.ring || surface.ring.length !== vertices.length) {
    vertices.forEach((vertex, index) => {
      const next = vertices[(index + 1) % vertices.length];
      coordinates.push(...vectorToArray(vertex), ...vectorToArray(next));
    });
  }
  if (surface?.ring?.length === vertices.length) {
    surface.ring.forEach((rim, index) => {
      const nextRim = surface.ring![(index + 1) % surface.ring!.length];
      coordinates.push(...vectorToArray(rim), ...vectorToArray(nextRim));
      coordinates.push(
        ...vectorToArray(vertices[index]),
        ...vectorToArray(rim),
      );
    });
  }
}

function createCellPickingItem(
  cell: SceneCell,
  vertices: Vector3[],
  surface?: CellDrawingSurface,
): PickingSpatialItem<SceneCell> | undefined {
  const surfaceVertices = [
    ...vertices,
    ...(surface?.ring ?? []),
    ...(surface?.center ? [surface.center] : []),
  ];
  const minimum = surfaceVertices[0].clone();
  const maximum = surfaceVertices[0].clone();
  for (let index = 1; index < surfaceVertices.length; index += 1) {
    minimum.min(surfaceVertices[index]);
    maximum.max(surfaceVertices[index]);
  }
  const center = minimum.clone().add(maximum).multiplyScalar(0.5);
  let radiusSquared = 0;
  for (const vertex of surfaceVertices) {
    radiusSquared = Math.max(radiusSquared, center.distanceToSquared(vertex));
  }
  const fillCoordinates: number[] = [];
  if (!pushCellFillCoordinates(fillCoordinates, vertices, surface)) {
    return undefined;
  }
  const triangles = [];
  for (let index = 0; index < fillCoordinates.length; index += 9) {
    triangles.push({
      a: fillCoordinates.slice(index, index + 3) as [number, number, number],
      b: fillCoordinates.slice(index + 3, index + 6) as [
        number,
        number,
        number,
      ],
      c: fillCoordinates.slice(index + 6, index + 9) as [
        number,
        number,
        number,
      ],
    });
  }
  return {
    id: cell.id,
    aabb: {
      min: vectorToArray(minimum),
      max: vectorToArray(maximum),
    },
    sphere: {
      center: vectorToArray(center),
      radius: Math.sqrt(radiusSquared),
    },
    triangles,
    data: cell,
  };
}

function cellDrawingSurface(
  cell: SceneCell,
  renderMode: LocalCellRenderMode,
): CellDrawingSurface | undefined {
  if (renderMode !== "in-graph") return undefined;
  const center = cell.drawingInteriorPoint
    ? new Vector3(...cell.drawingInteriorPoint)
    : undefined;
  const ring = cell.drawingInteriorRing?.map((point) => new Vector3(...point));
  return center || ring ? { center, ring } : undefined;
}

function cellBucketStyleKey(cell: SceneCell): string {
  return [
    cell.dimension ?? 2,
    cell.localDistance ?? 0,
    cell.isRelationBoundary ? "boundary" : "plain",
    cell.readabilityRole ?? "normal",
    cell.colorHint ?? "",
  ].join(":");
}

function cellOutlineOpacity(
  cell: SceneCell,
  update: GraphUpdate,
  active: boolean,
) {
  if (cell.readabilityRole === "focus") {
    return 1;
  }
  if (cell.readabilityRole === "incident") {
    return active || isSelectedCell(cell, update.selectedCellId) ? 0.96 : 0.82;
  }
  if (cell.readabilityRole === "context") {
    return update.topologyMode ? 0.28 : 0.38;
  }
  if (update.topologyMode) {
    return active || isSelectedCell(cell, update.selectedCellId) ? 1 : 0.86;
  }
  if (active || isSelectedCell(cell, update.selectedCellId)) {
    return 0.98;
  }
  return update.occlusionMode === "x-ray" && (cell.localDistance ?? 0) >= 2
    ? 0.42
    : 0.78;
}

function cellOutlineWidth(
  cell: SceneCell,
  update: GraphUpdate,
  active: boolean,
) {
  if (cell.readabilityRole === "focus") {
    return 4;
  }
  if (cell.readabilityRole === "incident") {
    return 3;
  }
  if (cell.readabilityRole === "context") {
    return 1;
  }
  return update.topologyMode || active || cell.isRelationBoundary ? 3 : 1;
}

function liftedCellVertices(
  cell: SceneCell,
  vertices: Vector3[],
  update: GraphUpdate,
  active: boolean,
) {
  const normal = cellNormal(vertices);
  const pairDirection = pairOffsetDirection(
    cell.generatorPair,
    update.generators.length,
  );
  const lift =
    0.08 +
    update.panelOffsetStrength * (active ? 2.4 : 1) +
    pairSpread(cell.generatorPair) * 0.03;
  return vertices.map((vertex) =>
    vertex
      .clone()
      .addScaledVector(normal, lift)
      .addScaledVector(pairDirection, update.panelOffsetStrength * 0.65),
  );
}

function petalCellVertices(
  cell: SceneCell,
  vertices: Vector3[],
  update: GraphUpdate,
) {
  const collapsedBoundary = vertices.every(
    (vertex) => vertex.distanceToSquared(vertices[0]) < 0.000001,
  );
  const pairDirection = pairOffsetDirection(
    cell.generatorPair,
    update.generators.length,
  );
  const center = collapsedBoundary
    ? vertices[0]
        .clone()
        .addScaledVector(
          pairDirection,
          2.85 + pairSpread(cell.generatorPair) * 0.12,
        )
    : pairDirection
        .clone()
        .multiplyScalar(2.35 + pairSpread(cell.generatorPair) * 0.1);
  const normal = pairDirection.clone().normalize();
  const basisX = orthogonalVector(normal);
  const basisY = new Vector3().crossVectors(normal, basisX).normalize();
  const radius = collapsedBoundary
    ? Math.max(0.5, Math.min(1.08, vertices.length * 0.075))
    : Math.max(0.38, Math.min(0.9, vertices.length * 0.055));
  const zLift = collapsedBoundary ? 0.02 : 0.18 + update.panelOffsetStrength;
  return vertices.map((_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / vertices.length;
    return center
      .clone()
      .addScaledVector(basisX, Math.cos(angle) * radius)
      .addScaledVector(basisY, Math.sin(angle) * radius)
      .addScaledVector(normal, zLift);
  });
}

const plainCellFillScale = 0.8;

function cellOpacity(cell: SceneCell, update: GraphUpdate, active: boolean) {
  if (cell.readabilityRole === "focus") {
    return Math.max(0.24, Math.min(update.cellOpacity, 0.38));
  }
  if (cell.readabilityRole === "incident") {
    return Math.max(0.12, Math.min(update.cellOpacity * 0.85, 0.24));
  }
  if (cell.readabilityRole === "context") {
    return Math.max(0.025, Math.min(update.cellOpacity * 0.22, 0.075));
  }
  if (update.topologyMode) {
    if (isSelectedCell(cell, update.selectedCellId) || active) {
      return Math.max(0.18, Math.min(update.cellOpacity, 0.26));
    }
    return Math.max(0.035, Math.min(update.cellOpacity * 0.35, 0.1));
  }
  if (cell.dimension === 3) {
    if (isSelectedCell(cell, update.selectedCellId)) {
      return Math.max(0.38, update.cellOpacity);
    }
    if (active) {
      return Math.max(0.34, update.cellOpacity);
    }
    return Math.min(0.08, Math.max(0.035, update.cellOpacity * 0.22));
  }
  const base = isSelectedCell(cell, update.selectedCellId)
    ? Math.max(update.cellOpacity, 0.36)
    : active
      ? Math.max(update.cellOpacity, 0.3)
      : // Ordinary fills are kept a little below the caller's opacity so the
        // boundary edges (the 1-skeleton) stay the strongest mark.
        update.cellOpacity * plainCellFillScale;
  if (update.occlusionMode === "x-ray" && (cell.localDistance ?? 0) >= 2) {
    return Math.min(base, 0.12);
  }
  if (update.occlusionMode === "fade-far" && (cell.localDistance ?? 0) >= 2) {
    return Math.min(base, 0.16);
  }
  return base;
}

function isSelectedCell(
  cell: SceneCell,
  selectedCellId: string | undefined,
): boolean {
  return (
    selectedCellId !== undefined &&
    (cell.id === selectedCellId || cell.sourceCellId === selectedCellId)
  );
}

function cellNormal(vertices: Vector3[]) {
  const origin = vertices[0] ?? new Vector3();
  for (let index = 1; index < vertices.length - 1; index += 1) {
    const left = vertices[index].clone().sub(origin);
    const right = vertices[index + 1].clone().sub(origin);
    const normal = new Vector3().crossVectors(left, right);
    if (normal.lengthSq() > 0.00001) {
      return normal.normalize();
    }
  }
  return new Vector3(0, 0, 1);
}

function pairOffsetDirection(pair: [number, number], generatorCount = 1) {
  const left = generatorDirection3D(pair[0], generatorCount);
  const right = generatorDirection3D(pair[1], generatorCount);
  const combined = left.clone().add(right);
  if (combined.lengthSq() > 0.0001) {
    return combined.normalize();
  }

  const angle =
    -Math.PI / 2 + ((pair[0] * 17 + pair[1] * 31) % 360) * (Math.PI / 180);
  return new Vector3(Math.cos(angle), Math.sin(angle), 0.42).normalize();
}

function pairSpread(pair: [number, number]) {
  return ((pair[0] * 13 + pair[1] * 7) % 9) - 4;
}

function edgeCoordinates(
  edge: SceneEdge,
  source: Vector3,
  target: Vector3,
  update: GraphUpdate,
  dashUnit = 1,
): number[] {
  const path = edgePathPoints(edge, source, target, update);
  if (!path) {
    return loopEdgeCoordinates(
      source,
      edge.generator,
      update.generators.length,
    );
  }
  const coordinates: number[] = [];
  pushPolylineSegments(
    coordinates,
    path,
    dashPattern(edge.lineStyle),
    dashUnit,
  );
  return coordinates;
}

/**
 * Drawn path of a non-loop edge: the visual endpoints (with any lane
 * offset), bent through drawingControlPoint when present. Undefined for a
 * loop, which is drawn by loopEdgeCoordinates.
 */
function edgePathPoints(
  edge: SceneEdge,
  source: Vector3,
  target: Vector3,
  update: GraphUpdate,
): Vector3[] | undefined {
  const [visualSource, visualTarget] = visualEdgeEndpoints(
    edge,
    source,
    target,
    update,
  );
  if (visualSource.equals(visualTarget)) {
    return undefined;
  }
  if (edge.drawingControlPoint) {
    const offset = visualSource.clone().sub(source);
    const control = new Vector3(...edge.drawingControlPoint).add(offset);
    return quadraticBezierPoints(visualSource, control, visualTarget);
  }
  return [visualSource, visualTarget];
}

/**
 * A straight chord standing in for the path near its middle, scaled to the
 * path length, so arrowHeadMatrix and the label placer (which work on
 * straight edges) put arrows and labels on the drawn curve.
 */
function arrowChordForPath(
  path: readonly Vector3[],
): [Vector3, Vector3] | undefined {
  if (path.length === 2) {
    return [path[0], path[1]];
  }
  const sample = polylinePointAt(path, 0.6);
  if (!sample) {
    return undefined;
  }
  return [
    sample.point.clone().addScaledVector(sample.tangent, -0.6 * sample.length),
    sample.point.clone().addScaledVector(sample.tangent, 0.4 * sample.length),
  ];
}

/** Short straight chord around the middle of a curved path, for labels. */
function labelChordForPath(
  path: readonly Vector3[],
): [Vector3, Vector3] | undefined {
  if (path.length === 2) {
    return [path[0], path[1]];
  }
  const sample = polylinePointAt(path, 0.5);
  if (!sample) {
    return undefined;
  }
  const half = 0.5 * path[0].distanceTo(path[path.length - 1]);
  return [
    sample.point.clone().addScaledVector(sample.tangent, -half),
    sample.point.clone().addScaledVector(sample.tangent, half),
  ];
}

/**
 * Wall-dual stroke: the edge's own (wall) colour, dashed unless the wall
 * already has a style, and doubled by a parallel copy offset across the
 * view so it reads heavier than ordinary 1px edges (WebGL ignores
 * linewidth on most platforms).
 */
function pushWallDualCoordinates(
  out: number[],
  edge: SceneEdge,
  source: Vector3,
  target: Vector3,
  update: GraphUpdate,
  dashUnit: number,
) {
  const path = edgePathPoints(edge, source, target, update);
  if (!path) {
    return;
  }
  const pattern = dashPattern(
    edge.lineStyle && edge.lineStyle !== "solid" ? edge.lineStyle : "dashed",
  );
  pushPolylineSegments(out, path, pattern, dashUnit);
  const chord = path[path.length - 1].clone().sub(path[0]);
  let side = chord.clone().cross(new Vector3(0, 0, 1));
  if (side.lengthSq() < 1e-10) {
    side = chord.clone().cross(new Vector3(0, 1, 0));
  }
  side.normalize().multiplyScalar(0.012 * Math.max(dashUnit, 0.2));
  pushPolylineSegments(
    out,
    path.map((point) => point.clone().add(side)),
    pattern,
    dashUnit,
  );
}

/** Median drawn length of the scene's non-loop edges (dash unit). */
function sceneDashUnit(update: GraphUpdate): number {
  const lengths: number[] = [];
  for (const edge of update.edges) {
    const source = update.nodePositions.get(edge.source);
    const target = update.nodePositions.get(edge.target);
    if (source && target) {
      lengths.push(source.distanceTo(target));
    }
    if (lengths.length >= 4096) break;
  }
  return medianLength(lengths);
}

function visualEdgeEndpoints(
  edge: SceneEdge,
  source: Vector3,
  target: Vector3,
  update: GraphUpdate,
): [Vector3, Vector3] {
  if (!edge.visualOffset || source.equals(target)) {
    return [source, target];
  }

  const direction = target.clone().sub(source).normalize();
  const viewDirection = update.cameraFocusTarget
    ? new Vector3(...update.cameraFocusTarget).sub(source).normalize()
    : new Vector3(0, 0, 1);
  let side = direction.clone().cross(viewDirection);
  if (side.lengthSq() < 0.0001) {
    side = direction.clone().cross(new Vector3(0, 0, 1));
  }
  if (side.lengthSq() < 0.0001) {
    side = stableLabelSide(edge.generator);
  } else {
    side.normalize();
  }
  const lift = stableLabelSide(edge.generator).multiplyScalar(
    Math.abs(edge.visualOffset) * 0.22,
  );
  const offset = side.multiplyScalar(edge.visualOffset).add(lift);
  return [source.clone().add(offset), target.clone().add(offset)];
}

function loopEdgeCoordinates(
  center: Vector3,
  generator: number,
  generatorCount: number,
): number[] {
  const coordinates: number[] = [];
  const segments = 18;
  const radial = generatorDirection3D(generator, generatorCount);
  const tangent = orthogonalVector(radial);
  const bitangent = new Vector3().crossVectors(radial, tangent).normalize();
  const loopCenter = center
    .clone()
    .addScaledVector(radial, 0.56 + (generator % 3) * 0.04);
  const radius = 0.24;

  for (let index = 0; index < segments; index += 1) {
    const leftAngle = (2 * Math.PI * index) / segments;
    const rightAngle = (2 * Math.PI * (index + 1)) / segments;
    const left = loopCenter
      .clone()
      .addScaledVector(tangent, Math.cos(leftAngle) * radius)
      .addScaledVector(bitangent, Math.sin(leftAngle) * radius);
    const right = loopCenter
      .clone()
      .addScaledVector(tangent, Math.cos(rightAngle) * radius)
      .addScaledVector(bitangent, Math.sin(rightAngle) * radius);
    coordinates.push(...vectorToArray(left), ...vectorToArray(right));
  }

  return coordinates;
}

function generatorDirection3D(generator: number, generatorCount: number) {
  if (generatorCount <= 1) {
    return new Vector3(0, 0, 1);
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * (generator + 0.5)) / Math.max(1, generatorCount);
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = generator * goldenAngle - Math.PI / 2;
  return new Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
    y,
  ).normalize();
}

function orthogonalVector(normal: Vector3) {
  const reference =
    Math.abs(normal.z) < 0.8 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  return new Vector3().crossVectors(normal, reference).normalize();
}

function appendFrameSample(
  samples: SceneFrameSample[],
  sample: SceneFrameSample,
): SceneFrameSample[] {
  samples.push(sample);
  if (samples.length > 120) {
    samples.splice(0, samples.length - 120);
  }
  return samples;
}

function midpointDistanceTo(
  source: Vector3,
  target: Vector3,
  point: Vector3,
): number {
  const x = (source.x + target.x) / 2 - point.x;
  const y = (source.y + target.y) / 2 - point.y;
  const z = (source.z + target.z) / 2 - point.z;
  return Math.sqrt(x * x + y * y + z * z);
}

function midpointLengthSq(source: Vector3, target: Vector3): number {
  const x = (source.x + target.x) * 0.5;
  const y = (source.y + target.y) * 0.5;
  const z = (source.z + target.z) * 0.5;
  return x * x + y * y + z * z;
}

interface ScreenRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

class ScreenLabelOccupancy {
  private readonly buckets = new Map<string, ScreenRect[]>();
  private readonly cellSize = 0.12;
  private readonly projected = new Vector3();
  private readonly projectedTop = new Vector3();

  constructor(private readonly camera: PerspectiveCamera) {
    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();
  }

  reserve(
    position: Vector3,
    label: string,
    options: {
      force?: boolean;
      /** Reject (unforced) labels whose anchor projects outside the view. */
      onScreenOnly?: boolean;
      /**
       * Actual chip size: world height and width/height ratio. Without it a
       * fixed NDC estimate sized for short edge labels is used.
       */
      chip?: { worldHeight: number; aspect: number; anchorBottom?: boolean };
    } = {},
  ): boolean {
    const projected = this.projected.copy(position).project(this.camera);
    if (
      !Number.isFinite(projected.x) ||
      !Number.isFinite(projected.y) ||
      projected.z < -1 ||
      projected.z > 1
    ) {
      return false;
    }
    if (
      options.onScreenOnly &&
      !options.force &&
      (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1)
    ) {
      return false;
    }

    let halfWidth = Math.min(0.18, 0.035 + label.length * 0.009);
    let halfHeight = 0.035;
    let centerY = projected.y;
    if (options.chip) {
      const top = this.projectedTop
        .setFromMatrixColumn(this.camera.matrixWorld, 1)
        .multiplyScalar(options.chip.worldHeight)
        .add(position)
        .project(this.camera);
      halfHeight = Math.abs(top.y - projected.y) / 2;
      // NDC x and y span different pixel counts; convert via the aspect.
      halfWidth =
        (halfHeight * options.chip.aspect) / Math.max(1e-6, this.camera.aspect);
      if (options.chip.anchorBottom) {
        centerY += halfHeight;
      }
    }
    const rect = {
      left: projected.x - halfWidth,
      right: projected.x + halfWidth,
      top: centerY + halfHeight,
      bottom: centerY - halfHeight,
    };
    const bucketKeys = this.bucketKeys(rect);
    if (!options.force) {
      for (const key of bucketKeys) {
        if (
          this.buckets
            .get(key)
            ?.some((occupied) => rectsOverlap(rect, occupied))
        ) {
          return false;
        }
      }
    }
    for (const key of bucketKeys) {
      const bucket = this.buckets.get(key) ?? [];
      bucket.push(rect);
      this.buckets.set(key, bucket);
    }
    return true;
  }

  private bucketKeys(rect: ScreenRect): string[] {
    const left = Math.floor(rect.left / this.cellSize);
    const right = Math.floor(rect.right / this.cellSize);
    const bottom = Math.floor(rect.bottom / this.cellSize);
    const top = Math.floor(rect.top / this.cellSize);
    const keys: string[] = [];
    for (let x = left; x <= right; x += 1) {
      for (let y = bottom; y <= top; y += 1) {
        keys.push(`${x}:${y}`);
      }
    }
    return keys;
  }
}

/**
 * Prioritizes labels before screen-space collision checks.
 *
 * Ordinary graph views use a label budget because full Cayley balls quickly
 * become unreadable. In semantic Y_Gamma views, edge labels are part of the
 * 1-skeleton data, so the renderer keeps one generator-labeled representative
 * for each drawn segment instead of letting several relation cells place
 * competing labels on the same edge.
 */
function edgeLabelPriority(
  edge: SceneEdge,
  update: GraphUpdate,
  cameraPosition?: Vector3,
): number {
  const source = update.nodePositions.get(edge.source);
  const target = update.nodePositions.get(edge.target);
  if (!source || !target) {
    return Number.NEGATIVE_INFINITY;
  }

  const incident =
    update.selectedNodeId !== undefined &&
    (edge.source === update.selectedNodeId ||
      edge.target === update.selectedNodeId);
  const generatorSpine =
    update.semanticLabelsOnly && edge.directed && !edge.isRelationBoundary;

  return (
    (edge.labelPriority ?? 0) +
    (edge.alwaysLabel ? 80_000 : 0) +
    (generatorSpine ? 60_000 : 0) +
    (edge.emphasis === "readable-boundary" ? 22_000 : 0) +
    (edge.isRelationBoundary ? 15_000 : 0) +
    (incident ? 10_000 : 0) -
    (cameraPosition
      ? midpointDistanceTo(source, target, cameraPosition)
      : midpointLengthSq(source, target))
  );
}

interface EdgeLabelDensityContext {
  budget: LabelDensityBudget;
  cameraPosition: Vector3;
}

/** Edge labels that explain the current selection skip the dense cap. */
function edgeLabelExemptFromDensity(
  edge: SceneEdge,
  update: GraphUpdate,
  pinsExempt: boolean,
): boolean {
  return (
    (pinsExempt && edgeLabelPinned(edge)) ||
    (update.selectedNodeId !== undefined &&
      (edge.source === update.selectedNodeId ||
        edge.target === update.selectedNodeId))
  );
}

function edgeLabelPinned(edge: SceneEdge): boolean {
  return (
    edge.alwaysLabel === true ||
    edge.isRelationBoundary === true ||
    edge.emphasis === "readable-boundary"
  );
}

/** Counts matches, stopping once the count passes `limit`. */
function countAtMost<T>(
  items: readonly T[],
  predicate: (item: T) => boolean,
  limit: number,
): number {
  let count = 0;
  for (const item of items) {
    if (predicate(item)) {
      count += 1;
      if (count > limit) {
        break;
      }
    }
  }
  return count;
}

function selectEdgeLabelCandidates(
  update: GraphUpdate,
  density?: EdgeLabelDensityContext,
): EdgeLabelCandidate[] {
  const dense = density?.budget.dense === true;
  if (
    !update.showEdgeLabels ||
    update.labelScope === "off" ||
    update.maxEdgeLabels <= 0
  ) {
    return [];
  }

  const labelEdges = selectLabelableEdges(update);
  const candidates = labelEdges
    .map((edge): EdgeLabelCandidate | undefined => {
      const label = edgeLabelText(edge, update);
      if (!label) {
        return undefined;
      }
      return {
        edge,
        label: compactLabelText(label, 10),
        priority: edgeLabelPriority(
          edge,
          update,
          dense ? density?.cameraPosition : undefined,
        ),
      };
    })
    .filter((candidate): candidate is EdgeLabelCandidate => Boolean(candidate));

  const picked = update.semanticLabelsOnly
    ? selectSemanticEdgeLabelCandidates(candidates, update)
    : candidates
        .sort(compareEdgeLabelCandidates)
        .slice(0, update.maxEdgeLabels);
  if (!dense || !density) {
    return picked;
  }
  const pinsExempt =
    countAtMost(
      picked,
      (candidate) => edgeLabelPinned(candidate.edge),
      denseLabelPinLimit,
    ) <= denseLabelPinLimit;
  return applyDenseLabelCap(
    picked,
    density.budget.edgeCap,
    update.maxEdgeLabels,
    (candidate) =>
      edgeLabelExemptFromDensity(candidate.edge, update, pinsExempt),
  );
}

function selectRenderableEdges(update: GraphUpdate): SceneEdge[] {
  if (!update.semanticLabelsOnly) {
    return update.edges;
  }

  return selectSemanticEdgeRepresentatives(update, () => true);
}

function selectLabelableEdges(update: GraphUpdate): SceneEdge[] {
  if (!update.semanticLabelsOnly) {
    return update.edges;
  }

  return selectSemanticEdgeRepresentatives(
    update,
    (edge) => edge.suppressSemanticLabel !== true || edge.alwaysLabel === true,
  );
}

function selectSemanticEdgeRepresentatives(
  update: GraphUpdate,
  include: (edge: SceneEdge) => boolean,
): SceneEdge[] {
  const selectedBySegment = new Map<string, SceneEdge>();
  for (const edge of update.edges) {
    if (!include(edge)) {
      continue;
    }
    if (
      !(edge.directed || edge.isRelationBoundary || edge.readabilityOverlay)
    ) {
      continue;
    }

    const key = semanticEdgeSegmentKey(edge, update);
    if (!key) {
      continue;
    }

    const previous = selectedBySegment.get(key);
    if (
      !previous ||
      compareSemanticEdgeRepresentatives(edge, previous, update) < 0
    ) {
      selectedBySegment.set(key, edge);
    }
  }

  return [...selectedBySegment.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function compareSemanticEdgeRepresentatives(
  left: SceneEdge,
  right: SceneEdge,
  update: GraphUpdate,
): number {
  const priorityDifference =
    edgeLabelPriority(right, update) - edgeLabelPriority(left, update);
  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const generatorDifference = left.generator - right.generator;
  return generatorDifference === 0
    ? left.id.localeCompare(right.id)
    : generatorDifference;
}

function semanticEdgeSegmentKey(
  edge: SceneEdge,
  update: GraphUpdate,
): string | undefined {
  const source = update.nodePositions.get(edge.source);
  const target = update.nodePositions.get(edge.target);
  if (!source || !target) {
    return undefined;
  }

  if (source.equals(target)) {
    // Loop drawings are generator-specific: two loops based at the same point
    // are placed in different directions by loopEdgeCoordinates().
    return `loop:${vectorLabelKey(source)}:${edge.generator}`;
  }

  const sourceKey = vectorLabelKey(source);
  const targetKey = vectorLabelKey(target);
  const segmentKey =
    sourceKey < targetKey
      ? `${sourceKey}|${targetKey}`
      : `${targetKey}|${sourceKey}`;
  return segmentKey;
}

function vectorLabelKey(position: Vector3): string {
  return [position.x, position.y, position.z]
    .map((value) => value.toFixed(3))
    .join(",");
}

function selectSemanticEdgeLabelCandidates(
  candidates: EdgeLabelCandidate[],
  update: GraphUpdate,
): EdgeLabelCandidate[] {
  return selectSegmentLabelBudget(
    candidates
      .map((candidate) => {
        const segmentKey = semanticEdgeSegmentKey(candidate.edge, update);
        return segmentKey
          ? { ...candidate, id: candidate.edge.id, segmentKey }
          : undefined;
      })
      .filter(
        (
          candidate,
        ): candidate is EdgeLabelCandidate & {
          id: string;
          segmentKey: string;
        } => Boolean(candidate),
      ),
    update.maxEdgeLabels,
  );
}

function edgeLabelText(
  edge: SceneEdge,
  update: GraphUpdate,
): string | undefined {
  if (
    update.semanticLabelsOnly &&
    edge.suppressSemanticLabel === true &&
    edge.alwaysLabel !== true
  ) {
    return undefined;
  }

  if (
    update.semanticLabelsOnly &&
    !edge.directed &&
    !edge.isRelationBoundary &&
    !edge.readabilityOverlay
  ) {
    return undefined;
  }

  const generatorLabel =
    update.generators[edge.generator]?.label ?? `s${edge.generator}`;

  if (update.semanticLabelsOnly) {
    return semanticEdgeLabelText(edge, generatorLabel);
  }

  const incident =
    update.selectedNodeId !== undefined &&
    (edge.source === update.selectedNodeId ||
      edge.target === update.selectedNodeId);
  if (update.labelScope === "focused" && !incident) {
    return edge.isRelationBoundary
      ? (edge.compactLabel ?? generatorLabel)
      : undefined;
  }

  return edge.compactLabel ?? generatorLabel;
}

function compareEdgeLabelCandidates(
  left: EdgeLabelCandidate,
  right: EdgeLabelCandidate,
): number {
  const priorityDifference = right.priority - left.priority;
  return priorityDifference === 0
    ? left.edge.id.localeCompare(right.edge.id)
    : priorityDifference;
}

function importantEdgeLabel(edge: SceneEdge, update: GraphUpdate): boolean {
  return (
    edge.alwaysLabel === true ||
    edge.labelPriority !== undefined ||
    (update.semanticLabelsOnly &&
      edge.suppressSemanticLabel !== true &&
      (edge.directed === true || edge.isRelationBoundary === true))
  );
}

function shouldDrawEdgeLabelLeader(edge: SceneEdge, update: GraphUpdate) {
  return (
    edge.labelLeader === true ||
    edge.alwaysLabel === true ||
    (update.semanticLabelsOnly &&
      edge.suppressSemanticLabel !== true &&
      (edge.directed === true || edge.isRelationBoundary === true))
  );
}

function rectsOverlap(left: ScreenRect, right: ScreenRect): boolean {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.top < right.bottom ||
    left.bottom > right.top
  );
}

function edgeLabelCandidates(
  edge: SceneEdge,
  source: Vector3,
  target: Vector3,
  camera: PerspectiveCamera,
): EdgeLabelPlacement[] {
  const midpoint = source.clone().add(target).multiplyScalar(0.5);
  const direction = target.clone().sub(source);
  if (direction.lengthSq() < 0.0001) {
    return loopEdgeLabelCandidates(edge, source);
  }
  const explicitAnchor = edge.labelAnchor
    ? new Vector3(...edge.labelAnchor)
    : undefined;
  const explicitLabelPosition = edge.labelPosition
    ? new Vector3(...edge.labelPosition)
    : undefined;
  const perimeterAnchoredGammaLabel =
    explicitAnchor !== undefined && edge.id.startsWith("Gamma:e:");
  if (explicitLabelPosition) {
    const anchor = explicitAnchor ?? source.clone().lerp(target, 0.5);
    const radial = explicitLabelPosition.clone();
    if (radial.lengthSq() < 0.0001) {
      radial.set(0, 1, 0);
    } else {
      radial.normalize();
    }
    const tangent = new Vector3(-radial.y, radial.x, 0).normalize();
    return [
      explicitLabelPosition,
      explicitLabelPosition.clone().addScaledVector(radial, 0.5),
      explicitLabelPosition.clone().addScaledVector(tangent, 0.34),
      explicitLabelPosition.clone().addScaledVector(tangent, -0.34),
    ].map((labelPosition) => ({
      labelPosition,
      anchor: anchor.clone(),
    }));
  }

  direction.normalize();
  const labelReference = explicitAnchor ?? midpoint;
  const viewDirection = camera.position.clone().sub(labelReference).normalize();
  let side = direction.clone().cross(viewDirection);
  if (side.lengthSq() < 0.0001) {
    side = stableLabelSide(edge.generator);
  } else {
    side.normalize();
  }
  let outward = labelReference.clone();
  if (outward.lengthSq() < 0.0001) {
    outward = side.clone();
  } else {
    outward.normalize();
  }

  const along = direction.clone();
  const labelLane = semanticLabelLane(edge);
  const laneLift = edge.isRelationBoundary
    ? labelLane * (perimeterAnchoredGammaLabel ? 0.14 : 0.055)
    : 0;
  const laneAlong = edge.isRelationBoundary
    ? labelLane * (perimeterAnchoredGammaLabel ? 0.018 : 0.025)
    : 0;
  const baseLift =
    (edge.directed
      ? 0.22
      : perimeterAnchoredGammaLabel
        ? 0.72
        : edge.isRelationBoundary
          ? 0.16
          : 0.1) +
    Math.abs(laneLift) * 0.5;
  const sideLift =
    (perimeterAnchoredGammaLabel
      ? 0.42
      : edge.isRelationBoundary
        ? 0.2
        : 0.14) + Math.abs(laneLift);
  const fractions = edge.directed
    ? [0.58 + laneAlong, 0.48 - laneAlong, 0.68 + laneAlong]
    : [0.5 + laneAlong, 0.42 - laneAlong, 0.58 + laneAlong];
  return fractions.flatMap((fraction, index) => {
    const clampedFraction = Math.max(0.18, Math.min(0.82, fraction));
    const anchor =
      explicitAnchor ?? source.clone().lerp(target, clampedFraction);
    const lift = baseLift + index * 0.06;
    return [
      anchor
        .clone()
        .addScaledVector(outward, lift)
        .addScaledVector(side, laneLift),
      anchor.clone().addScaledVector(side, sideLift + index * 0.05 + laneLift),
      anchor.clone().addScaledVector(side, -sideLift - index * 0.05 + laneLift),
      anchor
        .clone()
        .addScaledVector(outward, lift + 0.14)
        .addScaledVector(
          side,
          (index % 2 === 0 ? sideLift : -sideLift) + laneLift,
        ),
      anchor
        .clone()
        .addScaledVector(along, 0.12)
        .addScaledVector(outward, lift)
        .addScaledVector(side, laneLift),
    ].map((labelPosition) => ({
      labelPosition,
      anchor: anchor.clone(),
    }));
  });
}

function loopEdgeLabelCandidates(
  edge: SceneEdge,
  source: Vector3,
): EdgeLabelPlacement[] {
  const side = stableLabelSide(edge.generator);
  const up = new Vector3(0, 0, 1);
  const lane = semanticLabelLane(edge);
  const laneOffset = lane * 0.08;
  const anchor = edge.labelAnchor ? new Vector3(...edge.labelAnchor) : source;
  return [
    anchor
      .clone()
      .addScaledVector(side, 0.36 + laneOffset)
      .addScaledVector(up, 0.2),
    anchor
      .clone()
      .addScaledVector(side, -0.36 + laneOffset)
      .addScaledVector(up, 0.2),
    anchor.clone().addScaledVector(side, laneOffset).addScaledVector(up, 0.45),
  ].map((labelPosition) => ({
    labelPosition,
    anchor: anchor.clone(),
  }));
}

function pushLabelLeaderCoordinates(
  coordinates: number[],
  anchor: Vector3,
  labelPosition: Vector3,
  maxLength = 0.38,
): boolean {
  const direction = labelPosition.clone().sub(anchor);
  const distance = direction.length();
  if (distance < 0.12) {
    return false;
  }
  direction.multiplyScalar(1 / distance);
  const start = anchor.clone().addScaledVector(direction, 0.045);
  const end = anchor
    .clone()
    .addScaledVector(
      direction,
      Math.max(0.07, Math.min(maxLength, distance - 0.08)),
    );
  coordinates.push(...vectorToArray(start), ...vectorToArray(end));
  return true;
}

function stableLabelSide(generator: number): Vector3 {
  const angle = generator * GOLDEN_ANGLE;
  return new Vector3(Math.cos(angle), Math.sin(angle), 0.35).normalize();
}

function semanticLabelLane(edge: SceneEdge): number {
  const baseLane = [-2, -1, 0, 1, 2][Math.abs(edge.generator) % 5] ?? 0;
  if (!edge.isRelationBoundary) {
    return baseLane;
  }
  return baseLane * 0.72 + stableEdgeLane(edge.id) * 0.55;
}

function stableEdgeLane(edgeId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < edgeId.length; index += 1) {
    hash ^= edgeId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return [-2, -1, 0, 1, 2][Math.abs(hash) % 5] ?? 0;
}

const labelFadeMinimumOpacity = 0.32;
/** Opacity of edges and labels outside the focus in "fade-far" mode. */
const farEdgeOpacity = 0.22;
const farLabelOpacity = 0.45;

function isFarNode(node: SceneNode | undefined): boolean {
  return (node?.localDistance ?? 0) >= 2;
}

/**
 * Depth fade for an overlay label: 1 in front of the orbit target, falling
 * linearly to labelFadeMinimumOpacity one scene radius behind it.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function labelDepthOpacity(
  labelDistance: number,
  focusDistance: number,
  sceneRadius: number,
): number {
  const behind = labelDistance - focusDistance;
  if (!(behind > 0)) {
    return 1;
  }
  const t = Math.min(1, behind / Math.max(0.25, sceneRadius));
  return 1 - (1 - labelFadeMinimumOpacity) * t;
}

function farLabelScale(node: SceneNode, update: GraphUpdate): number {
  return update.occlusionMode === "fade-far" && isFarNode(node)
    ? farLabelOpacity
    : 1;
}

function edgeIncidentToSelection(edge: SceneEdge, update: GraphUpdate) {
  return (
    update.selectedNodeId !== undefined &&
    (edge.source === update.selectedNodeId ||
      edge.target === update.selectedNodeId)
  );
}

/** Height of the shared arrowhead cone geometry (world units, scale 1). */
const arrowConeHeight = 0.18;
/** Arrowhead centre as a fraction of the edge, measured from the source. */
const arrowHeadEdgeFraction = 0.6;
/** Largest share of the edge length one arrowhead may cover. */
const arrowHeadMaxEdgeShare = 0.28;

/**
 * Instance matrix for a directed-edge arrowhead.
 *
 * The cone sits slightly past the midpoint toward the target, not at the
 * target vertex: cones at the vertex form a fan that hides high-degree
 * vertices, and on the two rails of an inverse pair (hat X) the staggered
 * positions keep opposite arrows from reading as one double-headed arrow.
 * The cone is shrunk on short edges so it never covers more than
 * arrowHeadMaxEdgeShare of the edge.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function arrowHeadMatrix(
  source: Vector3,
  target: Vector3,
  direction: Vector3,
  object: Object3D,
  scale: number,
): Matrix4 | undefined {
  direction.copy(target).sub(source);
  const length = direction.length();
  if (length < 0.08) {
    return undefined;
  }
  direction.multiplyScalar(1 / length);
  const size = Math.min(
    scale,
    (arrowHeadMaxEdgeShare * length) / arrowConeHeight,
  );
  object.position
    .copy(source)
    .addScaledVector(direction, arrowHeadEdgeFraction * length);
  object.quaternion.setFromUnitVectors(unitY, direction);
  object.scale.setScalar(size);
  object.updateMatrix();
  return object.matrix.clone();
}

function createRuntime(mount: HTMLDivElement) {
  const canvas = document.createElement("canvas");
  const attributes = {
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: false,
  };
  // Ask for the actual rendering context once. A failed context request is
  // a browser capability result, and the successful context is reused below.
  const context = canvas.getContext(
    "webgl2",
    attributes,
  ) as WebGL2RenderingContext | null;
  if (!context) return;
  return new SceneRuntime(
    mount,
    new WebGLRenderer({ canvas, context, ...attributes }),
  );
}

function clearGroup(group: Group | Scene) {
  for (const child of [...group.children]) {
    if (child instanceof Group) {
      clearGroup(child);
    }
    child.removeFromParent();
    if ("geometry" in child && child.geometry instanceof BufferGeometry) {
      child.geometry.dispose();
    }
    if ("material" in child) {
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => disposeMaterial(entry));
      } else if (material instanceof Material) {
        disposeMaterial(material);
      }
    }
  }
}

function createStableLineSegments(
  geometry: BufferGeometry,
  material: LineBasicMaterial,
  renderOrder = 0,
) {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const line = new LineSegments(geometry, material);
  // Edge and outline batches often span several non-contiguous relation
  // segments. Per-batch frustum culling saves little here, and stale or tiny
  // bounds are visually disastrous: edges appear to pop while orbiting.
  line.frustumCulled = false;
  line.renderOrder = renderOrder;
  return line;
}

function edgeOverlayMaterial(color: string, opacity: number, linewidth = 1) {
  const material = new LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    linewidth,
  });
  // Relation outlines are explanatory overlays. They should sit above the
  // graph instead of z-fighting with the base generator-colored line.
  material.depthTest = false;
  material.depthWrite = false;
  return material;
}

function readableBoundaryEdgeColor(update: GraphUpdate) {
  return update.colorScheme === "dark" ? "#f8fafc" : "#111827";
}

function selectedEdgeOutlineColor(update: GraphUpdate) {
  return update.colorScheme === "dark" ? "#f8fafc" : "#0f172a";
}

function edgeColor(edge: SceneEdge, update: GraphUpdate) {
  return (
    edge.colorHint ??
    generatorColor(update.generators, edge.generator, update.colorScheme)
  );
}

type SdfRgba = readonly [number, number, number, number];

/** A label color as sRGB hex plus straight alpha. */
interface LabelColor {
  hex: string;
  alpha: number;
}

interface LabelStyle {
  foreground: LabelColor;
  background: LabelColor;
  border: LabelColor;
}

/** Ordinary label chip per theme: near-opaque so text contrast is predictable. */
const labelChip: Record<SceneColorScheme, LabelColor> = {
  light: { hex: "#ffffff", alpha: 0.92 },
  dark: { hex: "#111827", alpha: 0.9 },
};

/**
 * WCAG ratio for generator-colored edge-label text. Above the 4.5:1 minimum
 * because edge chips are small and antialiased glyphs never reach the full
 * text color.
 */
const edgeLabelTextContrast = 6.5;

function labelColor(hex: string, alpha = 1): LabelColor {
  return { hex, alpha };
}

/**
 * Text color that stays recognisably `hex` but reaches edgeLabelTextContrast against
 * the chip as composited over the canvas background.
 */
function readableLabelText(
  hex: string,
  chip: LabelColor,
  colorScheme: SceneColorScheme,
): LabelColor {
  const text = parseHexColor(hex) ?? parseHexColor(cssHex(hex));
  const chipRgb = parseHexColor(chip.hex);
  const canvas = parseHexColor(sceneBackgroundColor[colorScheme]);
  if (!text || !chipRgb || !canvas) {
    return labelColor(hex);
  }
  const effective = blendOver(chipRgb, chip.alpha, canvas);
  return labelColor(
    rgbToHex(ensureTextContrast(text, effective, edgeLabelTextContrast)),
  );
}

function nodeLabelStyle(
  node: SceneNode,
  colorScheme: SceneColorScheme,
): LabelStyle {
  const dark = colorScheme === "dark";
  if (node.stateRole === "in-state") {
    return {
      foreground: labelColor("#083344"),
      background: labelColor("#a5f3fc", 0.96),
      border: labelColor("#0891b2"),
    };
  }
  if (node.stateRole === "out-of-state") {
    return {
      foreground: labelColor("#f8fafc"),
      background: labelColor("#475569", 0.92),
      border: labelColor("#94a3b8"),
    };
  }
  if (node.alwaysLabel) {
    return dark
      ? {
          foreground: labelColor("#ccfbf1"),
          background: labelColor("#042f2e", 0.92),
          border: labelColor("#2dd4bf"),
        }
      : {
          foreground: labelColor("#111827"),
          background: labelColor("#f0fdfa", 0.94),
          border: labelColor("#0f766e"),
        };
  }
  if (node.isRelationBoundary) {
    return dark
      ? {
          foreground: labelColor("#ffb4ab"),
          background: labelColor("#2b1416", 0.92),
          border: labelColor("#f85149"),
        }
      : {
          foreground: labelColor("#b42318"),
          background: labelColor("#fff7ed", 0.92),
          border: labelColor("#b42318"),
        };
  }
  return dark
    ? {
        foreground: labelColor("#e6edf3"),
        background: labelChip.dark,
        border: labelColor("#94a3b8", 0.45),
      }
    : {
        foreground: labelColor("#24292f"),
        background: labelChip.light,
        border: labelColor("#24292f", 0.24),
      };
}

function edgeLabelStyle(edge: SceneEdge, update: GraphUpdate): LabelStyle {
  const dark = update.colorScheme === "dark";
  const color = cssHex(edgeColor(edge, update));
  if (edge.semanticLabelKind === "coxeter-order") {
    // "m=k" labels name a relation order, not a generator or a boundary:
    // neutral ink on the ordinary chip.
    return dark
      ? {
          foreground: labelColor("#e6edf3"),
          background: labelChip.dark,
          border: labelColor("#94a3b8", 0.6),
        }
      : {
          foreground: labelColor("#1f2328"),
          background: labelChip.light,
          border: labelColor("#57606a", 0.5),
        };
  }
  if (edge.isRelationBoundary) {
    const readable = edge.emphasis === "readable-boundary";
    return dark
      ? {
          foreground: labelColor("#ffb4ab"),
          background: readable
            ? labelColor("#111827", 0.95)
            : labelColor("#2b1416", 0.92),
          border: labelColor(readable ? "#f8fafc" : "#f85149"),
        }
      : {
          foreground: labelColor("#b42318"),
          background: readable
            ? labelColor("#ffffff", 0.95)
            : labelColor("#fff7ed", 0.92),
          border: labelColor(readable ? "#111827" : "#b42318"),
        };
  }
  const chip = labelChip[update.colorScheme];
  return {
    // Generator hue is kept for recognition, pushed darker (light theme) or
    // lighter (dark theme) only as far as the contrast target needs.
    foreground: readableLabelText(color, chip, update.colorScheme),
    background: chip,
    border: labelColor(
      edge.emphasis === "readable-boundary"
        ? dark
          ? "#f8fafc"
          : "#111827"
        : color,
    ),
  };
}

function labelLeaderColor(update: GraphUpdate): string {
  const dark = update.colorScheme === "dark";
  if (update.semanticLabelsOnly) {
    return dark ? "#e2e8f0" : "#111827";
  }
  return dark ? "#94a3b8" : "#57606a";
}

function cssHex(value: string): string {
  return `#${new Color(value).getHexString()}`;
}

function cssColor(color: LabelColor): string {
  const rgb = parseHexColor(color.hex);
  if (!rgb) {
    return color.hex;
  }
  const [r, g, b] = rgb.map((channel) => Math.round(channel * 255));
  return color.alpha >= 1
    ? color.hex
    : `rgba(${r}, ${g}, ${b}, ${color.alpha})`;
}

function sdfStyle(style: LabelStyle): {
  foreground: SdfRgba;
  background: SdfRgba;
  border: SdfRgba;
} {
  return {
    foreground: sdfRgba(style.foreground.hex, style.foreground.alpha),
    background: sdfRgba(style.background.hex, style.background.alpha),
    border: sdfRgba(style.border.hex, style.border.alpha),
  };
}

function sdfRgba(colorValue: string, alpha = 1): SdfRgba {
  const color = new Color(colorValue);
  return [color.r, color.g, color.b, alpha];
}

interface TextSpriteOptions {
  textColor: string;
  backgroundColor: string;
  borderColor: string;
  fontSize: number;
  paddingX: number;
  paddingY: number;
  worldHeight: number;
}

interface CachedLabelCanvas {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

const labelCanvasCache = new Map<string, CachedLabelCanvas>();
const maxCachedLabelCanvases = 512;
const labelSpritePool = new Map<string, Sprite[]>();
const maxPooledLabelSprites = 512;
let pooledLabelSpriteCount = 0;

function createTextSprite(text: string, options: TextSpriteOptions) {
  const { canvas, width, height } = cachedLabelCanvas(text, options);
  const poolKey = textSpriteKey(text, options);
  const poolBucket = labelSpritePool.get(poolKey);
  const pooled = poolBucket?.pop();
  if (pooled) {
    pooledLabelSpriteCount -= 1;
    if (poolBucket?.length === 0) {
      labelSpritePool.delete(poolKey);
    }
    const aspect = width / height;
    pooled.scale.set(options.worldHeight * aspect, options.worldHeight, 1);
    pooled.visible = true;
    return pooled;
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new Sprite(material);
  const aspect = width / height;
  sprite.scale.set(options.worldHeight * aspect, options.worldHeight, 1);
  sprite.userData.labelPoolKey = poolKey;
  return sprite;
}

function releaseTextSprite(sprite: Sprite) {
  const poolKey = sprite.userData.labelPoolKey;
  if (typeof poolKey !== "string") {
    disposeSprite(sprite);
    return;
  }
  sprite.visible = false;
  sprite.removeFromParent();
  if (pooledLabelSpriteCount >= maxPooledLabelSprites) {
    disposeSprite(sprite);
    return;
  }
  const bucket = labelSpritePool.get(poolKey) ?? [];
  bucket.push(sprite);
  labelSpritePool.set(poolKey, bucket);
  pooledLabelSpriteCount += 1;
}

function disposeSprite(sprite: Sprite) {
  const material = sprite.material;
  if (Array.isArray(material)) {
    material.forEach((entry) => disposeMaterial(entry));
  } else {
    disposeMaterial(material);
  }
}

function textSpriteKey(text: string, options: TextSpriteOptions): string {
  return [
    text,
    options.textColor,
    options.backgroundColor,
    options.borderColor,
    options.fontSize,
    options.paddingX,
    options.paddingY,
    options.worldHeight,
    Math.min(window.devicePixelRatio || 1, 2),
  ].join("|");
}

function cachedLabelCanvas(
  text: string,
  options: TextSpriteOptions,
): CachedLabelCanvas {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const cacheKey = [
    text,
    options.textColor,
    options.backgroundColor,
    options.borderColor,
    options.fontSize,
    options.paddingX,
    options.paddingY,
    pixelRatio,
  ].join("|");
  const cached = labelCanvasCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas context is required for scene labels.");
  }

  const font = `600 ${options.fontSize}px system-ui, sans-serif`;
  context.font = font;
  const textWidth = Math.ceil(context.measureText(text).width);
  const width = Math.max(1, textWidth + options.paddingX * 2);
  const height = Math.max(1, options.fontSize + options.paddingY * 2);

  canvas.width = Math.ceil(width * pixelRatio);
  canvas.height = Math.ceil(height * pixelRatio);
  context.scale(pixelRatio, pixelRatio);
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";

  drawRoundedRect(context, 0.5, 0.5, width - 1, height - 1, 5);
  context.fillStyle = options.backgroundColor;
  context.fill();
  context.strokeStyle = options.borderColor;
  context.lineWidth = 1;
  context.stroke();

  context.fillStyle = options.textColor;
  context.fillText(text, width / 2, height / 2);

  const entry = { canvas, width: canvas.width, height: canvas.height };
  labelCanvasCache.set(cacheKey, entry);
  if (labelCanvasCache.size > maxCachedLabelCanvases) {
    const oldestKey = labelCanvasCache.keys().next().value;
    if (oldestKey !== undefined) {
      labelCanvasCache.delete(oldestKey);
    }
  }
  return entry;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const clampedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + clampedRadius, y);
  context.lineTo(x + width - clampedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  context.lineTo(x + width, y + height - clampedRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - clampedRadius,
    y + height,
  );
  context.lineTo(x + clampedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  context.lineTo(x, y + clampedRadius);
  context.quadraticCurveTo(x, y, x + clampedRadius, y);
  context.closePath();
}

const selectionRingTextures = new Map<string, CanvasTexture>();

/** Ring texture shared by every selection ring of one colour. */
function selectionRingTexture(color: string): CanvasTexture {
  const cached = selectionRingTextures.get(color);
  if (cached) {
    return cached;
  }
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2 - 12, 0, Math.PI * 2);
    context.lineWidth = 14;
    context.strokeStyle = "rgba(0, 0, 0, 0.35)";
    context.stroke();
    context.lineWidth = 9;
    context.strokeStyle = color;
    context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // Shared across rebuilds; disposeMaterial must not free it.
  texture.userData.shared = true;
  selectionRingTextures.set(color, texture);
  return texture;
}

function disposeMaterial(material: Material) {
  const mappedMaterial = material as Material & {
    map?: { dispose: () => void } | null;
  };
  if (
    !(mappedMaterial.map as { userData?: { shared?: boolean } } | null)
      ?.userData?.shared
  ) {
    mappedMaterial.map?.dispose();
  }
  material.dispose();
}

function vectorToArray(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

/**
 * Example colour hints win; otherwise the theme's categorical palette, which
 * never repeats a colour (see scenePalette.ts).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function generatorColor(
  generators: readonly SceneGenerator[],
  generator: number,
  colorScheme: SceneColorScheme = "light",
) {
  return (
    generators[generator]?.colorHint ??
    fallbackGeneratorColor(generator, colorScheme)
  );
}

function generatorPairColor(
  generators: SceneGenerator[],
  pair: [number, number],
  colorScheme: SceneColorScheme,
) {
  const first = new Color(generatorColor(generators, pair[0], colorScheme));
  const second = new Color(generatorColor(generators, pair[1], colorScheme));
  return first.lerp(second, 0.5).getStyle();
}

function cellColor(
  generators: SceneGenerator[],
  cell: SceneCell,
  colorScheme: SceneColorScheme = "light",
) {
  return (
    cell.colorHint ??
    generatorPairColor(generators, cell.generatorPair, colorScheme)
  );
}

function pairKey(pair: [number, number]) {
  return `${pair[0]}-${pair[1]}`;
}
