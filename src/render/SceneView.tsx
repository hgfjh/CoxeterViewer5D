import { RotateCcw } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import {
  AmbientLight,
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
  compactLabelText,
  type PickedLabelEntry,
  selectLabelBudget,
  selectSegmentLabelBudget,
  semanticEdgeLabelText,
} from "./labels";
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

export type LabelScope = "off" | "focused" | "budgeted";
export type LocalCellRenderMode =
  | "in-graph"
  | "lifted-panels"
  | "petals"
  | "outline-only";
export type OcclusionMode = "hide-far" | "fade-far" | "x-ray";

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
  onCapturePngReady?: (capture: (() => Promise<string>) | undefined) => void;
  onRenderStats?: (stats: SceneRenderStats) => void;
  onHoverCell?: (cellId: string | undefined) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectCell: (cellId: string) => void;
}

const shellPalette = [
  "#1f6feb",
  "#2da44e",
  "#bf8700",
  "#cf222e",
  "#8250df",
  "#0969da",
];
const fallbackGeneratorColors = [
  "#2f81f7",
  "#3fb950",
  "#d29922",
  "#f85149",
  "#a371f7",
  "#56d4dd",
];
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
type SceneColorScheme = "light" | "dark";

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
    onSelectNode,
    maxEdgeLabels,
    maxNodeLabels,
    onRenderStats,
    onHoverCell,
    pickingEnabled,
    selectedCellId,
    selectedNodeId,
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
    </section>
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
  private readonly renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: false,
  });
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
  private readonly sdfAtlasCache = new Map<string, SdfGlyphAtlas>();
  private sdfAtlasCacheBytes = 0;

  constructor(private readonly mount: HTMLDivElement) {
    this.stats.labelRendererFallbackReason = this.sdfTextFallbackReason;
    this.setColorScheme("light");
    this.camera.position.set(0, -9, 6);

    this.viewportPixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.viewportWidth = Math.max(1, mount.clientWidth);
    this.viewportHeight = Math.max(1, mount.clientHeight);
    this.renderer.setPixelRatio(this.viewportPixelRatio);
    this.renderer.setSize(this.viewportWidth, this.viewportHeight);
    mount.appendChild(this.renderer.domElement);

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
    this.onHoverCell = update.onHoverCell;
    this.onRenderStats = update.onRenderStats;
    this.pickingEnabled = update.pickingEnabled;
    this.setColorScheme(update.colorScheme);
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
    const appearanceLayerChanged =
      structureChanged ||
      !update.revisionSet ||
      !previousRevisions ||
      update.revisionSet.appearanceVersion !==
        previousRevisions.appearanceVersion;
    const labelLayerChanged =
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
    this.frameGraph(update);
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
        if (!vertices || vertices.length < 3) {
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
    const material = new MeshBasicMaterial({ vertexColors: true });
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
        temp.scale.setScalar(scale * (node.nodeScale ?? 1));
        temp.updateMatrix();
        transform.copy(temp.matrix);
        bucket.mesh.setMatrixAt(index, transform);
        color.set(
          node.stateRole
            ? nodeColor(node, update.occlusionMode)
            : selected
              ? "#f85149"
              : node.isRelationBoundary
                ? "#b42318"
                : neighbor
                  ? "#0f6b5f"
                  : nodeColor(node, update.occlusionMode),
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
      const bucketKey = `${color}:${edge.ghost ? "ghost" : "main"}`;
      const bucket = edgeBuckets.get(bucketKey) ?? {
        color,
        coordinates: [],
      };
      const [visualSource, visualTarget] = visualEdgeEndpoints(
        edge,
        source,
        target,
        update,
      );
      bucket.coordinates.push(
        ...(visualSource.equals(visualTarget)
          ? loopEdgeCoordinates(
              visualSource,
              edge.generator,
              update.generators.length,
            )
          : [
              visualSource.x,
              visualSource.y,
              visualSource.z,
              visualTarget.x,
              visualTarget.y,
              visualTarget.z,
            ]),
      );
      edgeBuckets.set(bucketKey, bucket);
      renderedEdgeSegments += 1;

      if (edge.directed && !visualSource.equals(visualTarget)) {
        const matrix = arrowHeadMatrix(
          visualSource,
          visualTarget,
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
      const material = new LineBasicMaterial({
        color: bucket.color,
        transparent: true,
        opacity: ghost ? 0.14 : 0.72,
      });
      this.edgeGroup.add(createStableLineSegments(geometry, material));
    }

    for (const bucket of arrowBuckets.values()) {
      const geometry = new ConeGeometry(0.055, 0.18, 12);
      const material = new MeshBasicMaterial({
        color: bucket.color,
        transparent: true,
        opacity: bucket.ghost ? 0.18 : 0.92,
        depthTest: !bucket.coorientation,
        depthWrite: false,
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
    const highlightCoordinates: number[] = [];
    const outlineHighlightCoordinates: number[] = [];
    const boundaryCoordinates: number[] = [];
    const readableBoundaryCoordinates: number[] = [];
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
      const coordinates = edgeCoordinates(edge, source, target, update);

      if (edge.isRelationBoundary && !edge.colorHint) {
        boundaryCoordinates.push(...coordinates);
      }
      if (edge.emphasis === "readable-boundary") {
        readableBoundaryCoordinates.push(...coordinates);
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
          highlightCoordinates.push(...coordinates);
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

    if (highlightCoordinates.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(highlightCoordinates), 3),
      );
      this.edgeOverlayGroup.add(
        createStableLineSegments(
          geometry,
          edgeOverlayMaterial("#0f6b5f", 0.95),
          22,
        ),
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

  private addReferenceBall(update: GraphUpdate) {
    if (!update.showReferenceBall) {
      return;
    }

    const geometry = new SphereGeometry(update.referenceBallRadius, 48, 24);
    const material = new MeshBasicMaterial({
      color: "#6b7280",
      transparent: true,
      opacity: 0.16,
      wireframe: true,
    });
    this.referenceGroup.add(new Mesh(geometry, material));
  }

  private addLabels(update: GraphUpdate): {
    nodes: number;
    edges: number;
    leaders: number;
  } {
    const nodeEntries = this.nodeLabelEntries(update);
    const edgeEntries = selectEdgeLabelCandidates(update);
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

  private nodeLabelEntries(
    update: GraphUpdate,
  ): Array<PickedLabelEntry<SceneNode>> {
    const selectedNeighbors = this.neighborsFor(update.selectedNodeId);
    return selectLabelBudget(
      update.nodes.filter((node) => !node.hidden),
      {
        enabled: update.showNodeLabels && update.labelScope !== "off",
        maxLabels: update.maxNodeLabels,
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
        getPriority: (node) =>
          (node.labelPriority ?? 0) +
          (node.alwaysLabel ? 80_000 : 0) +
          (node.isRelationBoundary ? 15_000 : 0) +
          (node.id === update.selectedNodeId ? 10_000 : 0) -
          node.length,
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

      const sprite = createTextSprite(label, {
        textColor:
          node.stateRole === "in-state"
            ? "#083344"
            : node.stateRole === "out-of-state"
              ? "#f8fafc"
              : node.alwaysLabel
                ? "#111827"
                : node.isRelationBoundary
                  ? "#b42318"
                  : "#24292f",
        backgroundColor:
          node.stateRole === "in-state"
            ? "rgba(165, 243, 252, 0.96)"
            : node.stateRole === "out-of-state"
              ? "rgba(71, 85, 105, 0.86)"
              : node.alwaysLabel
                ? "rgba(240, 253, 250, 0.94)"
                : node.isRelationBoundary
                  ? "rgba(255, 247, 237, 0.92)"
                  : "rgba(255, 255, 255, 0.86)",
        borderColor:
          node.stateRole === "in-state"
            ? "#0891b2"
            : node.stateRole === "out-of-state"
              ? "#94a3b8"
              : node.alwaysLabel
                ? "#0f766e"
                : node.isRelationBoundary
                  ? "#b42318"
                  : "rgba(36, 41, 47, 0.24)",
        fontSize: 28,
        paddingX: 8,
        paddingY: 5,
        worldHeight: 0.28 * (node.labelScale ?? 1),
      });
      sprite.center.set(0.5, 0);
      sprite.position.copy(position);
      sprite.position.z += 0.13 * (node.labelScale ?? 1);
      sprite.renderOrder = 20;
      this.labelGroup.add(sprite);
    }

    return entries.length;
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

      const color = edgeColor(edge, update);
      const sprite = createTextSprite(label, {
        textColor: edge.isRelationBoundary ? "#b42318" : color,
        backgroundColor: edge.isRelationBoundary
          ? edge.emphasis === "readable-boundary"
            ? "rgba(255, 255, 255, 0.95)"
            : "rgba(255, 247, 237, 0.9)"
          : "rgba(255, 255, 255, 0.72)",
        borderColor:
          edge.emphasis === "readable-boundary"
            ? "#111827"
            : edge.isRelationBoundary
              ? "#b42318"
              : color,
        fontSize: 22,
        paddingX: 6,
        paddingY: 3,
        worldHeight: 0.2 * (edge.labelScale ?? 1),
      });
      sprite.center.set(0.5, 0.5);
      sprite.position.copy(position.labelPosition);
      sprite.renderOrder = 18;
      this.labelGroup.add(sprite);
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
        color: update.semanticLabelsOnly ? "#111827" : "#57606a",
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
      const style = sdfNodeLabelStyle(node);
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
      const style = sdfEdgeLabelStyle(edge, update);
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
    this.labelGroup.add(this.activeSdfBatch.group);

    if (leaderCoordinates.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(leaderCoordinates), 3),
      );
      const material = new LineBasicMaterial({
        color: update.semanticLabelsOnly ? "#111827" : "#57606a",
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
    const candidates = edgeLabelCandidates(edge, source, target, this.camera);
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
    let filledTransparentCells = 0;
    let omittedTransparentFills = 0;
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
      if (!this.gpuPickingActive) {
        pickingItems.push(
          createCellPickingItem(cell, vertices, drawingSurface),
        );
      }

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

      if (
        update.localCellRenderMode !== "outline-only" &&
        shouldFillTransparentCell(
          cell,
          update,
          applyFillBudget,
          filledTransparentCells,
          transparentFillBudget,
        )
      ) {
        const fillKey = `${cellPairKey}:${bucketStyle}`;
        const fillBucket = fillBuckets.get(fillKey) ?? {
          pairKey: cellPairKey,
          pair: cell.generatorPair,
          styleCell: cell,
          coordinates: [],
        };
        pushCellFillCoordinates(
          fillBucket.coordinates,
          vertices,
          drawingSurface,
        );
        fillBuckets.set(fillKey, fillBucket);
        filledTransparentCells += 1;
      } else if (update.localCellRenderMode !== "outline-only") {
        omittedTransparentFills += 1;
      }
      renderedCells += 1;
    }
    this.stats.omittedTransparentFills = omittedTransparentFills;
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
        color: cellColor(update.generators, bucket.styleCell),
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
        color: cellColor(update.generators, bucket.styleCell),
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
      const color = active
        ? "#0f6b5f"
        : cellColor(update.generators, bucket.styleCell);
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
      if (update.localCellRenderMode !== "outline-only") {
        const fillGeometry = createCellFillGeometry(
          vertices,
          cellDrawingSurface(cell, update.localCellRenderMode),
        );
        const fill = new Mesh(
          fillGeometry,
          new MeshBasicMaterial({
            color: "#f85149",
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
        edgeOverlayMaterial("#f85149", 1, 4),
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
      return;
    }

    if (update.cameraPreset === "on-graph") {
      const distance = Math.max(2.2, Math.min(7.5, maxRadius * 1.25 + 1.3));
      this.camera.fov = 66;
      this.camera.updateProjectionMatrix();
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, -distance, distance * 0.45);
      this.controls.update();
      this.scheduleDampingFrames("camera-frame", 18);
      return;
    }

    this.camera.fov = update.showReferenceBall ? 74 : 55;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    if (update.showReferenceBall) {
      this.camera.position.set(
        center.x,
        center.y - maxRadius * 1.1,
        center.z + maxRadius * 0.36,
      );
    } else if (oneVertexCellBouquet) {
      this.camera.position.set(
        center.x + maxRadius * 0.95,
        center.y - maxRadius * 1.55,
        center.z + maxRadius * 1.2,
      );
    } else {
      this.camera.position.set(
        center.x,
        center.y - maxRadius * 2.6 - 4,
        center.z + maxRadius * 1.5 + 2,
      );
    }
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
    this.requestRender(reason);
    return true;
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
  };

  private readonly handleControlsEnd = () => {
    this.cameraInteractionActive = false;
    this.scheduleDampingFrames("camera-end", 18);
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

  private setColorScheme(colorScheme: SceneColorScheme) {
    if (this.colorScheme === colorScheme && this.scene.background) {
      return;
    }
    this.colorScheme = colorScheme;
    this.scene.background = new Color(
      colorScheme === "dark" ? "#0d1117" : "#f6f7f9",
    );
    this.requestRender("theme");
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
      if (vertices && vertices.length >= 3) {
        items.push(
          createCellPickingItem(
            cell,
            vertices,
            cellDrawingSurface(cell, update.localCellRenderMode),
          ),
        );
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
    this.renderer.render(this.scene, this.camera);
    this.stats.renderReason = reason;
    this.stats.renderCount += 1;
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    const notifyCallback = this.notifyStatsOnNextRender;
    this.notifyStatsOnNextRender = false;
    this.publishStats({ notifyCallback, force: notifyCallback });
  };

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

function nodeColor(node: SceneNode, occlusionMode: OcclusionMode) {
  const base = shellPalette[node.length % shellPalette.length];
  if (node.stateRole && node.colorHint) {
    return node.colorHint;
  }
  if (node.colorHint && !node.ghost) {
    return node.colorHint;
  }
  if (node.ghost) {
    return occlusionMode === "x-ray" ? "#e5eaf0" : "#cbd5e1";
  }
  if (occlusionMode === "fade-far" && (node.localDistance ?? 0) >= 2) {
    return "#9aa7b5";
  }
  if (occlusionMode === "x-ray" && (node.localDistance ?? 0) >= 2) {
    return "#d5dbe3";
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

function shouldFillTransparentCell(
  cell: SceneCell,
  update: GraphUpdate,
  applyBudget: boolean,
  filledCount: number,
  budget: number,
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
  pushCellFillCoordinates(coordinates, vertices, surface);

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(coordinates), 3),
  );
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  return geometry;
}

function pushCellFillCoordinates(
  coordinates: number[],
  vertices: Vector3[],
  surface?: CellDrawingSurface,
) {
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
    return;
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
    return;
  }
  for (let i = 1; i < vertices.length - 1; i += 1) {
    coordinates.push(
      ...vectorToArray(vertices[0]),
      ...vectorToArray(vertices[i]),
      ...vectorToArray(vertices[i + 1]),
    );
  }
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
): PickingSpatialItem<SceneCell> {
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
  pushCellFillCoordinates(fillCoordinates, vertices, surface);
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
      : update.cellOpacity;
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
): number[] {
  const [visualSource, visualTarget] = visualEdgeEndpoints(
    edge,
    source,
    target,
    update,
  );
  return visualSource.equals(visualTarget)
    ? loopEdgeCoordinates(
        visualSource,
        edge.generator,
        update.generators.length,
      )
    : [
        visualSource.x,
        visualSource.y,
        visualSource.z,
        visualTarget.x,
        visualTarget.y,
        visualTarget.z,
      ];
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

  constructor(private readonly camera: PerspectiveCamera) {
    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();
  }

  reserve(
    position: Vector3,
    label: string,
    options: { force?: boolean } = {},
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

    const halfWidth = Math.min(0.18, 0.035 + label.length * 0.009);
    const halfHeight = 0.035;
    const rect = {
      left: projected.x - halfWidth,
      right: projected.x + halfWidth,
      top: projected.y + halfHeight,
      bottom: projected.y - halfHeight,
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
function edgeLabelPriority(edge: SceneEdge, update: GraphUpdate): number {
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
    midpointLengthSq(source, target)
  );
}

function selectEdgeLabelCandidates(update: GraphUpdate): EdgeLabelCandidate[] {
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
        priority: edgeLabelPriority(edge, update),
      };
    })
    .filter((candidate): candidate is EdgeLabelCandidate => Boolean(candidate));

  if (update.semanticLabelsOnly) {
    return selectSemanticEdgeLabelCandidates(candidates, update);
  }

  return candidates
    .sort(compareEdgeLabelCandidates)
    .slice(0, update.maxEdgeLabels);
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

function arrowHeadMatrix(
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
  object.position.copy(target).addScaledVector(direction, -0.09 * scale);
  object.quaternion.setFromUnitVectors(unitY, direction);
  object.scale.setScalar(scale);
  object.updateMatrix();
  return object.matrix.clone();
}

function createRuntime(mount: HTMLDivElement) {
  return new SceneRuntime(mount);
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
  return edge.colorHint ?? generatorColor(update.generators, edge.generator);
}

type SdfRgba = readonly [number, number, number, number];

function sdfNodeLabelStyle(node: SceneNode): {
  foreground: SdfRgba;
  background: SdfRgba;
  border: SdfRgba;
} {
  if (node.stateRole === "in-state") {
    return {
      foreground: sdfRgba("#083344"),
      background: sdfRgba("#a5f3fc", 0.96),
      border: sdfRgba("#0891b2"),
    };
  }
  if (node.stateRole === "out-of-state") {
    return {
      foreground: sdfRgba("#f8fafc"),
      background: sdfRgba("#475569", 0.86),
      border: sdfRgba("#94a3b8"),
    };
  }
  if (node.alwaysLabel) {
    return {
      foreground: sdfRgba("#111827"),
      background: sdfRgba("#f0fdfa", 0.94),
      border: sdfRgba("#0f766e"),
    };
  }
  if (node.isRelationBoundary) {
    return {
      foreground: sdfRgba("#b42318"),
      background: sdfRgba("#fff7ed", 0.92),
      border: sdfRgba("#b42318"),
    };
  }
  return {
    foreground: sdfRgba("#24292f"),
    background: sdfRgba("#ffffff", 0.86),
    border: sdfRgba("#24292f", 0.24),
  };
}

function sdfEdgeLabelStyle(
  edge: SceneEdge,
  update: GraphUpdate,
): {
  foreground: SdfRgba;
  background: SdfRgba;
  border: SdfRgba;
} {
  const color = edgeColor(edge, update);
  const foreground = edge.isRelationBoundary ? "#b42318" : color;
  const background = edge.isRelationBoundary
    ? edge.emphasis === "readable-boundary"
      ? sdfRgba("#ffffff", 0.95)
      : sdfRgba("#fff7ed", 0.9)
    : sdfRgba("#ffffff", 0.72);
  const border =
    edge.emphasis === "readable-boundary"
      ? "#111827"
      : edge.isRelationBoundary
        ? "#b42318"
        : color;
  return {
    foreground: sdfRgba(foreground),
    background,
    border: sdfRgba(border),
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

function disposeMaterial(material: Material) {
  const mappedMaterial = material as Material & {
    map?: { dispose: () => void } | null;
  };
  mappedMaterial.map?.dispose();
  material.dispose();
}

function vectorToArray(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function generatorColor(generators: SceneGenerator[], generator: number) {
  return (
    generators[generator]?.colorHint ??
    fallbackGeneratorColors[generator % fallbackGeneratorColors.length]
  );
}

function generatorPairColor(
  generators: SceneGenerator[],
  pair: [number, number],
) {
  const first = new Color(generatorColor(generators, pair[0]));
  const second = new Color(generatorColor(generators, pair[1]));
  return first.lerp(second, 0.5).getStyle();
}

function cellColor(generators: SceneGenerator[], cell: SceneCell) {
  return cell.colorHint ?? generatorPairColor(generators, cell.generatorPair);
}

function pairKey(pair: [number, number]) {
  return `${pair[0]}-${pair[1]}`;
}
