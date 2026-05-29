import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
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

import {
  compactLabelText,
  selectLabelBudget,
  selectSegmentLabelBudget,
} from "./labels";

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
  ghost?: boolean;
  hidden?: boolean;
}

export interface SceneEdge {
  id: string;
  source: string;
  target: string;
  generator: number;
  compactLabel?: string;
  isRelationBoundary?: boolean;
  emphasis?: "readable-boundary";
  ghost?: boolean;
  directed?: boolean;
}

export interface SceneCell {
  id: string;
  generatorPair: [number, number];
  boundaryNodeIds: string[];
  localDistance?: number;
  isRelationBoundary?: boolean;
  dimension?: number;
  sourceCellId?: string;
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
}

export interface SceneRenderStats {
  mode: "global" | "on-graph";
  graphNodes: number;
  graphEdges: number;
  graphCells: number;
  renderedNodes: number;
  renderedEdgeSegments: number;
  renderedCells: number;
  renderedNodeLabels: number;
  renderedEdgeLabels: number;
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
  omittedTransparentFills: number;
  picking: SpatialPickPrefilterStats;
  workerGenerationMs?: number;
}

export interface SceneViewProps {
  nodes: SceneNode[];
  edges: SceneEdge[];
  cells: SceneCell[];
  generators: SceneGenerator[];
  structureVersion: string;
  appearanceVersion: string;
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
const unitY = new Vector3(0, 1, 0);
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function SceneView({
  nodes,
  edges,
  cells,
  generators,
  structureVersion,
  appearanceVersion,
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
    <section className="scene-shell" aria-label="Cayley graph scene">
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

interface GraphUpdate {
  nodes: SceneNode[];
  edges: SceneEdge[];
  cells: SceneCell[];
  generators: SceneGenerator[];
  structureVersion: string;
  appearanceVersion: string;
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
  generator: number;
  ghost: boolean;
  matrices: Matrix4[];
}

interface NodeMeshBucket {
  mesh: InstancedMesh;
  nodeIds: string[];
}

interface CellPickEntry extends SpatialPickSphere {
  object: Mesh;
}

interface EdgeLabelCandidate {
  edge: SceneEdge;
  label: string;
  priority: number;
}

declare global {
  interface Window {
    __coxeterSceneStats?: SceneRenderStats;
  }
}

class SceneRuntime {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(55, 1, 0.1, 10_000);
  private readonly renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: false,
  });
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
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
  private animationFrame: number | undefined;
  private dampingFramesRemaining = 0;
  private framedGraphKey = "";
  private lastStructureKey = "";
  private lastAppearanceKey = "";
  private lastResetSignal = 0;
  private lastFocusSignal = 0;
  private nodeMeshes: NodeMeshBucket[] = [];
  private cellBuckets: CellVisualBucket[] = [];
  private cellGeometryCache = new Map<string, BufferGeometry>();
  private cellVerticesById = new Map<string, Vector3[]>();
  private cellPickObjects: Mesh[] = [];
  private cellPickIndex: CellPickEntry[] = [];
  private onSelectNode: (nodeId: string) => void = () => undefined;
  private onSelectCell: (cellId: string) => void = () => undefined;
  private onHoverCell: ((cellId: string | undefined) => void) | undefined;
  private hoveredCellId: string | undefined;
  private pendingHoverPoint: { x: number; y: number } | undefined;
  private hoverFrame: number | undefined;
  private onRenderStats: ((stats: SceneRenderStats) => void) | undefined;
  private pickingEnabled = true;
  private stats: SceneRenderStats = emptySceneStats();
  private frame = 0;
  private previousFrameTime = performance.now();
  private lastGraphUpdate: GraphUpdate | undefined;

  constructor(private readonly mount: HTMLDivElement) {
    this.scene.background = new Color("#f6f7f9");
    this.camera.position.set(0, -9, 6);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

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
    this.resizeObserver = new ResizeObserver(() => this.resize());
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
    const structureKey = update.structureVersion;
    const appearanceKey = update.appearanceVersion;
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
    if (structureChanged) {
      this.lastStructureKey = structureKey;
      this.rebuildStructure(update);
    }

    this.lastAppearanceKey = appearanceKey;
    this.updateAppearance(update);
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
    };
    this.publishStats({ notifyCallback: true });
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
    this.controls.dispose();
    this.releaseLabelSprites();
    clearGroup(this.scene);
    this.clearCellPickObjects();
    for (const geometry of this.cellGeometryCache.values()) {
      geometry.dispose();
    }
    this.cellGeometryCache.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private rebuildStructure(update: GraphUpdate) {
    clearGroup(this.nodeGroup);
    clearGroup(this.edgeGroup);
    clearGroup(this.edgeOverlayGroup);
    this.clearCellVisualGroup();
    clearGroup(this.cellOverlayGroup);
    this.releaseLabelSprites();
    clearGroup(this.referenceGroup);
    this.clearCellPickObjects();
    this.nodeMeshes = [];
    this.cellBuckets = [];
    this.cellVerticesById = new Map();

    this.addReferenceBall(update);
    const renderedCells = this.addCells(update);
    const renderedEdgeSegments = this.addEdges(update);
    const renderedNodes = this.addNodes(update);
    this.stats = {
      ...this.stats,
      renderedNodes,
      renderedEdgeSegments,
      renderedCells,
      renderedNodeLabels: 0,
      renderedEdgeLabels: 0,
    };
  }

  private updateAppearance(update: GraphUpdate) {
    this.updateNodeAppearance(update);
    clearGroup(this.edgeOverlayGroup);
    this.addEdgeOverlays(update);
    this.updateCellAppearance(update);
    clearGroup(this.cellOverlayGroup);
    this.addCellSelectionOverlay(update);
    this.releaseLabelSprites();
    const renderedLabels = this.addLabels(update);
    this.stats = {
      ...this.stats,
      renderedNodeLabels: renderedLabels.nodes,
      renderedEdgeLabels: renderedLabels.edges,
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
    const selectedNeighbors = selectedNeighborIds(update);
    const nodeById = new Map(update.nodes.map((node) => [node.id, node]));

    for (const bucket of this.nodeMeshes) {
      bucket.nodeIds.forEach((nodeId, index) => {
        const node = nodeById.get(nodeId);
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
        temp.scale.setScalar(scale);
        temp.updateMatrix();
        transform.copy(temp.matrix);
        bucket.mesh.setMatrixAt(index, transform);
        color.set(
          selected
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

  private clearCellPickObjects() {
    for (const object of this.cellPickObjects) {
      object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => disposeMaterial(entry));
      } else {
        disposeMaterial(material);
      }
    }
    this.cellPickObjects = [];
    this.cellPickIndex = [];
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
    const edgeBuckets = new Map<
      string,
      { generator: number; coordinates: number[] }
    >();
    const arrowBuckets = new Map<string, ArrowHeadBucket>();
    const arrowDirection = new Vector3();
    const arrowObject = new Object3D();
    let renderedEdgeSegments = 0;

    for (const edge of update.edges) {
      const source = update.nodePositions.get(edge.source);
      const target = update.nodePositions.get(edge.target);
      if (!source || !target) {
        continue;
      }
      const bucketKey = `${edge.generator}:${edge.ghost ? "ghost" : "main"}`;
      const bucket = edgeBuckets.get(bucketKey) ?? {
        generator: edge.generator,
        coordinates: [],
      };
      bucket.coordinates.push(
        ...(source.equals(target)
          ? loopEdgeCoordinates(
              source,
              edge.generator,
              update.generators.length,
            )
          : [source.x, source.y, source.z, target.x, target.y, target.z]),
      );
      edgeBuckets.set(bucketKey, bucket);
      renderedEdgeSegments += 1;

      if (edge.directed && !source.equals(target)) {
        const matrix = arrowHeadMatrix(
          source,
          target,
          arrowDirection,
          arrowObject,
        );
        if (matrix) {
          const arrowKey = `${edge.generator}:${edge.ghost ? "ghost" : "main"}`;
          const arrowBucket = arrowBuckets.get(arrowKey) ?? {
            generator: edge.generator,
            ghost: Boolean(edge.ghost),
            matrices: [],
          };
          arrowBucket.matrices.push(matrix);
          arrowBuckets.set(arrowKey, arrowBucket);
        }
      }
    }

    for (const [bucketKey, bucket] of edgeBuckets) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(bucket.coordinates), 3),
      );
      const ghost = bucketKey.endsWith(":ghost");
      const material = new LineBasicMaterial({
        color: generatorColor(update.generators, bucket.generator),
        transparent: true,
        opacity: ghost ? 0.14 : 0.72,
      });
      this.edgeGroup.add(new LineSegments(geometry, material));
    }

    for (const bucket of arrowBuckets.values()) {
      const geometry = new ConeGeometry(0.055, 0.18, 12);
      const material = new MeshBasicMaterial({
        color: generatorColor(update.generators, bucket.generator),
        transparent: true,
        opacity: bucket.ghost ? 0.18 : 0.92,
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
      mesh.userData.kind = "edge-arrowheads";
      this.edgeGroup.add(mesh);
    }

    return renderedEdgeSegments;
  }

  private addEdgeOverlays(update: GraphUpdate): void {
    const highlightCoordinates: number[] = [];
    const boundaryCoordinates: number[] = [];
    const readableBoundaryCoordinates: number[] = [];

    for (const edge of update.edges) {
      const source = update.nodePositions.get(edge.source);
      const target = update.nodePositions.get(edge.target);
      if (!source || !target) {
        continue;
      }
      const coordinates = edgeCoordinates(edge, source, target, update);

      if (edge.isRelationBoundary) {
        boundaryCoordinates.push(...coordinates);
        if (edge.emphasis === "readable-boundary") {
          readableBoundaryCoordinates.push(...coordinates);
        }
      }

      if (
        update.selectedNodeId &&
        (edge.source === update.selectedNodeId ||
          edge.target === update.selectedNodeId)
      ) {
        highlightCoordinates.push(...coordinates);
      }
    }

    if (boundaryCoordinates.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(boundaryCoordinates), 3),
      );
      this.edgeOverlayGroup.add(
        new LineSegments(
          geometry,
          new LineBasicMaterial({
            color: "#b42318",
            transparent: true,
            opacity: 0.98,
          }),
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
        new LineSegments(
          geometry,
          new LineBasicMaterial({
            color: "#111827",
            transparent: true,
            opacity: 1,
          }),
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
        new LineSegments(
          geometry,
          new LineBasicMaterial({
            color: "#0f6b5f",
            transparent: true,
            opacity: 0.95,
          }),
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
  } {
    return {
      nodes: this.addNodeLabels(update),
      edges: this.addEdgeLabels(update),
    };
  }

  private addNodeLabels(update: GraphUpdate): number {
    const selectedNeighbors = selectedNeighborIds(update);
    const entries = selectLabelBudget(
      update.nodes.filter((node) => !node.hidden),
      {
        enabled: update.showNodeLabels && update.labelScope !== "off",
        maxLabels: update.maxNodeLabels,
        maxCharacters: 14,
        getLabel: (node) => {
          if (
            update.semanticLabelsOnly &&
            node.isRelationBoundary &&
            node.id !== update.selectedNodeId
          ) {
            return undefined;
          }
          if (
            update.labelScope === "focused" &&
            node.id !== update.selectedNodeId &&
            !selectedNeighbors.has(node.id) &&
            !node.isRelationBoundary
          ) {
            return undefined;
          }
          return node.compactLabel ?? node.label ?? node.id;
        },
        getPriority: (node) =>
          (node.isRelationBoundary ? 15_000 : 0) +
          (node.id === update.selectedNodeId ? 10_000 : 0) -
          node.length,
      },
    );

    for (const { item: node, label } of entries) {
      const position = update.nodePositions.get(node.id);
      if (!position) {
        continue;
      }

      const sprite = createTextSprite(label, {
        textColor: node.isRelationBoundary ? "#b42318" : "#24292f",
        backgroundColor: node.isRelationBoundary
          ? "rgba(255, 247, 237, 0.92)"
          : "rgba(255, 255, 255, 0.86)",
        borderColor: node.isRelationBoundary
          ? "#b42318"
          : "rgba(36, 41, 47, 0.24)",
        fontSize: 28,
        paddingX: 8,
        paddingY: 5,
        worldHeight: 0.28,
      });
      sprite.center.set(0.5, 0);
      sprite.position.copy(position).add(new Vector3(0, 0, 0.13));
      sprite.renderOrder = 20;
      this.labelGroup.add(sprite);
    }

    return entries.length;
  }

  private addEdgeLabels(update: GraphUpdate): number {
    const entries = selectEdgeLabelCandidates(update);

    const labelOccupancy = new ScreenLabelOccupancy(this.camera);
    let placedLabels = 0;
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

      const color = generatorColor(update.generators, edge.generator);
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
        worldHeight: 0.2,
      });
      sprite.center.set(0.5, 0.5);
      sprite.position.copy(position);
      sprite.renderOrder = 18;
      this.labelGroup.add(sprite);
      placedLabels += 1;
    }

    return placedLabels;
  }

  private placeEdgeLabel(
    edge: SceneEdge,
    label: string,
    source: Vector3,
    target: Vector3,
    occupancy: ScreenLabelOccupancy,
    force: boolean,
  ): Vector3 | undefined {
    const candidates = edgeLabelCandidates(edge, source, target, this.camera);
    for (const candidate of candidates) {
      if (occupancy.reserve(candidate, label)) {
        return candidate;
      }
    }
    if (force) {
      const fallback = candidates.at(-1);
      if (fallback) {
        occupancy.reserve(fallback, label, { force: true });
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
      this.cellVerticesById.set(cell.id, vertices);
      const pickMesh = createCellPickMesh(cell, vertices);
      this.cellPickObjects.push(pickMesh);
      this.cellPickIndex.push(createCellPickEntry(pickMesh));

      const cellPairKey = pairKey(cell.generatorPair);
      const bucketStyle = cellBucketStyleKey(cell);
      const outlineKey = `${cellPairKey}:${bucketStyle}`;
      const outlineBucket = outlineBuckets.get(outlineKey) ?? {
        pairKey: cellPairKey,
        pair: cell.generatorPair,
        styleCell: cell,
        coordinates: [],
      };
      pushCellOutlineCoordinates(outlineBucket.coordinates, vertices);
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
        pushCellFillCoordinates(fillBucket.coordinates, vertices);
        fillBuckets.set(fillKey, fillBucket);
        filledTransparentCells += 1;
      } else if (update.localCellRenderMode !== "outline-only") {
        omittedTransparentFills += 1;
      }
      renderedCells += 1;
    }
    this.stats.omittedTransparentFills = omittedTransparentFills;

    for (const [bucketKey, bucket] of fillBuckets) {
      const geometryKey = `fill:${bucketKey}`;
      usedGeometryKeys.add(geometryKey);
      const geometry = this.cachedCellGeometry(
        geometryKey,
        bucket.coordinates,
        true,
      );
      const material = new MeshBasicMaterial({
        color: generatorPairColor(update.generators, bucket.pair),
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
        color: generatorPairColor(update.generators, bucket.pair),
        transparent: true,
        opacity: cellOutlineOpacity(bucket.styleCell, update, false),
        linewidth: cellOutlineWidth(bucket.styleCell, update, false),
      });
      const outline = new LineSegments(geometry, material);
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
        : generatorPairColor(update.generators, bucket.pair);
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
    const vertices = this.cellVerticesById.get(update.selectedCellId);
    if (!vertices || vertices.length < 3) {
      return;
    }
    if (update.localCellRenderMode !== "outline-only") {
      const fillGeometry = createCellFillGeometry(vertices);
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
    pushCellOutlineCoordinates(outlineCoordinates, vertices);
    const outlineGeometry = new BufferGeometry();
    outlineGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(outlineCoordinates), 3),
    );
    const outline = new LineSegments(
      outlineGeometry,
      new LineBasicMaterial({
        color: "#f85149",
        transparent: true,
        opacity: 1,
        linewidth: 4,
      }),
    );
    outline.renderOrder = 13;
    this.cellOverlayGroup.add(outline);
  }

  private frameGraph(update: GraphUpdate) {
    const { nodePositions } = update;
    if (nodePositions.size === 0) {
      return;
    }

    const frameKey = [...nodePositions.entries()]
      .map(
        ([nodeId, position]) =>
          `${nodeId}:${position.x.toFixed(3)},${position.y.toFixed(3)},${position.z.toFixed(3)}`,
      )
      .join("|");
    const cameraFrameKey = [
      update.cameraPreset,
      `reference:${update.showReferenceBall}`,
      `radius:${update.referenceBallRadius}`,
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

  private resize() {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.requestRender("resize");
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
    this.scheduleDampingFrames("camera-start", 36);
  };

  private readonly handleControlsChange = () => {
    this.requestRender("camera-change");
  };

  private readonly handleControlsEnd = () => {
    this.scheduleDampingFrames("camera-end", 18);
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    this.pointerDownPosition = { x: event.clientX, y: event.clientY };
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
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
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
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

    const cellHits = this.raycaster.intersectObjects(
      this.prefilteredCellPickObjects(),
      false,
    );
    const cellId = cellHits[0]?.object.userData.id;
    if (typeof cellId === "string") {
      this.onSelectCell(cellId);
      this.requestRender("pick-cell");
    }
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (!this.onHoverCell) {
      return;
    }
    this.pendingHoverPoint = { x: event.clientX, y: event.clientY };
    if (this.hoverFrame !== undefined) {
      return;
    }
    this.hoverFrame = window.requestAnimationFrame(this.processHover);
  };

  private readonly processHover = () => {
    this.hoverFrame = undefined;
    const point = this.pendingHoverPoint;
    this.pendingHoverPoint = undefined;
    if (!this.onHoverCell || !point) {
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((point.x - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((point.y - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const cellHits = this.raycaster.intersectObjects(
      this.prefilteredCellPickObjects(),
      false,
    );
    const nextCellId =
      typeof cellHits[0]?.object.userData.id === "string"
        ? (cellHits[0].object.userData.id as string)
        : undefined;
    if (nextCellId !== this.hoveredCellId) {
      this.hoveredCellId = nextCellId;
      this.onHoverCell(nextCellId);
      this.requestRender("hover-cell");
    }
  };

  private prefilteredCellPickObjects(): Mesh[] {
    if (this.cellPickIndex.length !== this.cellPickObjects.length) {
      return this.cellPickObjects;
    }

    const center = new Vector3();
    const { candidates, stats } = prefilterSpatialPickSpheres(
      this.cellPickIndex,
      (point) => {
        center.set(point[0], point[1], point[2]);
        return this.raycaster.ray.distanceSqToPoint(center);
      },
      { minimumEntryCount: 32, padding: 0.12 },
    );
    this.stats = {
      ...this.stats,
      picking: stats,
    };
    return candidates.map((entry) => entry.object);
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
    const controlsChanged = this.controls.update();
    this.render(reason);
    if (this.dampingFramesRemaining > 0) {
      this.dampingFramesRemaining -= 1;
    }
    if (controlsChanged || this.dampingFramesRemaining > 0) {
      this.animationFrame = window.requestAnimationFrame(() =>
        this.renderFrame("camera-damping"),
      );
    }
  };

  private readonly render = (reason: string) => {
    this.renderer.render(this.scene, this.camera);
    this.stats.renderReason = reason;
    this.stats.renderCount += 1;
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this.publishStats();
  };

  private publishStats(options: { notifyCallback?: boolean } = {}) {
    const stats = { ...this.stats, frameSamples: [...this.stats.frameSamples] };
    window.__coxeterSceneStats = stats;
    this.mount.dataset.sceneMode = stats.mode;
    this.mount.dataset.renderedNodes = String(stats.renderedNodes);
    this.mount.dataset.renderedEdges = String(stats.renderedEdgeSegments);
    this.mount.dataset.renderedCells = String(stats.renderedCells);
    this.mount.dataset.nodeLabels = String(stats.renderedNodeLabels);
    this.mount.dataset.edgeLabels = String(stats.renderedEdgeLabels);
    this.mount.dataset.cellRenderMode = stats.localCellRenderMode;
    this.mount.dataset.occlusionMode = stats.occlusionMode;
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

function emptySceneStats(): SceneRenderStats {
  return {
    mode: "global",
    graphNodes: 0,
    graphEdges: 0,
    graphCells: 0,
    renderedNodes: 0,
    renderedEdgeSegments: 0,
    renderedCells: 0,
    renderedNodeLabels: 0,
    renderedEdgeLabels: 0,
    drawCalls: 0,
    triangles: 0,
    frame: 0,
    frameSamples: [],
    renderReason: "init",
    renderCount: 0,
    lodNodes: { high: 0, low: 0 },
    omittedTransparentFills: 0,
    picking: emptySpatialPickStats(),
    lastGraphUpdateMs: 0,
    localCellRenderMode: "in-graph",
    occlusionMode: "hide-far",
  };
}

function emptySpatialPickStats(): SpatialPickPrefilterStats {
  return {
    total: 0,
    candidates: 0,
    rejected: 0,
    usedPrefilter: false,
    minimumEntryCount: 32,
    padding: 0,
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function prefilterSpatialPickSpheres<T extends SpatialPickSphere>(
  entries: readonly T[],
  distanceSqToPoint: (point: readonly [number, number, number]) => number,
  options: { minimumEntryCount?: number; padding?: number } = {},
): { candidates: T[]; stats: SpatialPickPrefilterStats } {
  const minimumEntryCount = options.minimumEntryCount ?? 32;
  const padding = options.padding ?? 0;
  if (entries.length < minimumEntryCount) {
    return {
      candidates: [...entries],
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

  const candidates = entries.filter((entry) => {
    const radius = entry.radius + padding;
    return distanceSqToPoint(entry.center) <= radius * radius;
  });
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

function isHighDetailNode(node: SceneNode, update: GraphUpdate): boolean {
  return (
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
    cell.id === update.selectedCellId ||
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

function createCellFillGeometry(vertices: Vector3[]) {
  const coordinates: number[] = [];
  pushCellFillCoordinates(coordinates, vertices);

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(coordinates), 3),
  );
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  return geometry;
}

function pushCellFillCoordinates(coordinates: number[], vertices: Vector3[]) {
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
) {
  vertices.forEach((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    coordinates.push(...vectorToArray(vertex), ...vectorToArray(next));
  });
}

function createCellPickMesh(cell: SceneCell, vertices: Vector3[]) {
  const material = new MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    side: DoubleSide,
    depthWrite: false,
  });
  material.colorWrite = false;
  const mesh = new Mesh(createCellFillGeometry(vertices), material);
  mesh.userData.kind = "cell";
  mesh.userData.id = cell.id;
  mesh.updateMatrixWorld(true);
  return mesh;
}

function createCellPickEntry(object: Mesh): CellPickEntry {
  object.geometry.computeBoundingSphere();
  object.updateMatrixWorld(true);
  const sphere = object.geometry.boundingSphere;
  if (!sphere) {
    return {
      id: String(object.userData.id ?? ""),
      center: [0, 0, 0],
      radius: Number.POSITIVE_INFINITY,
      object,
    };
  }

  const center = sphere.center.clone().applyMatrix4(object.matrixWorld);
  const scale = new Vector3();
  object.getWorldScale(scale);
  const maxScale = Math.max(scale.x, scale.y, scale.z);
  return {
    id: String(object.userData.id ?? ""),
    center: vectorToArray(center),
    radius: sphere.radius * maxScale,
    object,
  };
}

function cellBucketStyleKey(cell: SceneCell): string {
  return [
    cell.dimension ?? 2,
    cell.localDistance ?? 0,
    cell.isRelationBoundary ? "boundary" : "plain",
  ].join(":");
}

function cellOutlineOpacity(
  cell: SceneCell,
  update: GraphUpdate,
  active: boolean,
) {
  if (update.topologyMode) {
    return active || cell.id === update.selectedCellId ? 1 : 0.86;
  }
  if (active || cell.id === update.selectedCellId) {
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
  if (update.topologyMode) {
    if (cell.id === update.selectedCellId || active) {
      return Math.max(0.18, Math.min(update.cellOpacity, 0.26));
    }
    return Math.max(0.035, Math.min(update.cellOpacity * 0.35, 0.1));
  }
  if (cell.dimension === 3) {
    if (cell.id === update.selectedCellId) {
      return Math.max(0.38, update.cellOpacity);
    }
    if (active) {
      return Math.max(0.34, update.cellOpacity);
    }
    return Math.min(0.08, Math.max(0.035, update.cellOpacity * 0.22));
  }
  const base =
    cell.id === update.selectedCellId
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
  return source.equals(target)
    ? loopEdgeCoordinates(source, edge.generator, update.generators.length)
    : [source.x, source.y, source.z, target.x, target.y, target.z];
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
  if (sample.frame % 15 !== 0) {
    return samples;
  }
  return [...samples, sample].slice(-12);
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
  private readonly rects: ScreenRect[] = [];

  constructor(private readonly camera: PerspectiveCamera) {
    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();
  }

  reserve(
    position: Vector3,
    label: string,
    options: { force?: boolean } = {},
  ): boolean {
    const projected = position.clone().project(this.camera);
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
    if (
      !options.force &&
      this.rects.some((occupied) => rectsOverlap(rect, occupied))
    ) {
      return false;
    }
    this.rects.push(rect);
    return true;
  }
}

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

  const candidates = update.edges
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
    return selectSegmentLabelBudget(
      candidates.map((candidate) => ({
        ...candidate,
        id: candidate.edge.id,
        segmentKey: edgeLabelSegmentKey(candidate.edge, update),
      })),
      update.maxEdgeLabels,
    );
  }

  return candidates
    .sort(compareEdgeLabelCandidates)
    .slice(0, update.maxEdgeLabels);
}

function edgeLabelText(
  edge: SceneEdge,
  update: GraphUpdate,
): string | undefined {
  if (update.semanticLabelsOnly && !edge.directed && !edge.isRelationBoundary) {
    return undefined;
  }

  const generatorLabel =
    update.generators[edge.generator]?.label ?? `s${edge.generator}`;

  // In Y_Gamma, generator arrows are the semantic 1-cells. Boundary labels may
  // share the same drawn segment, so the arrow keeps the generator name.
  if (update.semanticLabelsOnly && edge.directed && !edge.isRelationBoundary) {
    return generatorLabel;
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

function edgeLabelSegmentKey(edge: SceneEdge, update: GraphUpdate): string {
  const source = update.nodePositions.get(edge.source);
  const target = update.nodePositions.get(edge.target);
  const sourceKey = source ? vectorLabelKey(source) : edge.source;
  const targetKey = target ? vectorLabelKey(target) : edge.target;
  const endpoints =
    sourceKey < targetKey
      ? `${sourceKey}|${targetKey}`
      : `${targetKey}|${sourceKey}`;
  return endpoints;
}

function vectorLabelKey(position: Vector3): string {
  return [position.x, position.y, position.z]
    .map((value) => value.toFixed(2))
    .join(",");
}

function importantEdgeLabel(edge: SceneEdge, update: GraphUpdate): boolean {
  return (
    update.semanticLabelsOnly &&
    edge.directed === true &&
    (edge.isRelationBoundary !== true || edge.emphasis === "readable-boundary")
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
): Vector3[] {
  const midpoint = source.clone().add(target).multiplyScalar(0.5);
  const direction = target.clone().sub(source);
  if (direction.lengthSq() < 0.0001) {
    return loopEdgeLabelCandidates(edge, source);
  }

  direction.normalize();
  const viewDirection = camera.position.clone().sub(midpoint).normalize();
  let side = direction.clone().cross(viewDirection);
  if (side.lengthSq() < 0.0001) {
    side = stableLabelSide(edge.generator);
  } else {
    side.normalize();
  }
  let outward = midpoint.clone();
  if (outward.lengthSq() < 0.0001) {
    outward = side.clone();
  } else {
    outward.normalize();
  }

  const along = direction.clone();
  const baseLift = edge.directed ? 0.22 : edge.isRelationBoundary ? 0.16 : 0.1;
  const sideLift = edge.isRelationBoundary ? 0.2 : 0.14;
  const fractions = edge.directed ? [0.58, 0.48, 0.68] : [0.5, 0.42, 0.58];
  return fractions.flatMap((fraction, index) => {
    const anchor = source.clone().lerp(target, fraction);
    const lift = baseLift + index * 0.06;
    return [
      anchor.clone().addScaledVector(outward, lift),
      anchor.clone().addScaledVector(side, sideLift + index * 0.05),
      anchor.clone().addScaledVector(side, -sideLift - index * 0.05),
      anchor
        .clone()
        .addScaledVector(outward, lift + 0.14)
        .addScaledVector(side, index % 2 === 0 ? sideLift : -sideLift),
      anchor
        .clone()
        .addScaledVector(along, 0.12)
        .addScaledVector(outward, lift),
    ];
  });
}

function loopEdgeLabelCandidates(edge: SceneEdge, source: Vector3): Vector3[] {
  const side = stableLabelSide(edge.generator);
  const up = new Vector3(0, 0, 1);
  return [
    source.clone().addScaledVector(side, 0.36).addScaledVector(up, 0.2),
    source.clone().addScaledVector(side, -0.36).addScaledVector(up, 0.2),
    source.clone().addScaledVector(up, 0.45),
  ];
}

function stableLabelSide(generator: number): Vector3 {
  const angle = generator * GOLDEN_ANGLE;
  return new Vector3(Math.cos(angle), Math.sin(angle), 0.35).normalize();
}

function arrowHeadMatrix(
  source: Vector3,
  target: Vector3,
  direction: Vector3,
  object: Object3D,
): Matrix4 | undefined {
  direction.copy(target).sub(source);
  const length = direction.length();
  if (length < 0.08) {
    return undefined;
  }
  direction.multiplyScalar(1 / length);
  object.position.copy(target).addScaledVector(direction, -0.09);
  object.quaternion.setFromUnitVectors(unitY, direction);
  object.scale.setScalar(1);
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

function createTextSprite(text: string, options: TextSpriteOptions) {
  const { canvas, width, height } = cachedLabelCanvas(text, options);
  const poolKey = textSpriteKey(text, options);
  const pooled = labelSpritePool.get(poolKey)?.pop();
  if (pooled) {
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
  const totalPooled = [...labelSpritePool.values()].reduce(
    (total, bucket) => total + bucket.length,
    0,
  );
  if (totalPooled >= maxPooledLabelSprites) {
    disposeSprite(sprite);
    return;
  }
  const bucket = labelSpritePool.get(poolKey) ?? [];
  bucket.push(sprite);
  labelSpritePool.set(poolKey, bucket);
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

function selectedNeighborIds(update: GraphUpdate): Set<string> {
  const neighbors = new Set<string>();
  if (!update.selectedNodeId) {
    return neighbors;
  }

  for (const edge of update.edges) {
    if (edge.source === update.selectedNodeId) {
      neighbors.add(edge.target);
    } else if (edge.target === update.selectedNodeId) {
      neighbors.add(edge.source);
    }
  }

  return neighbors;
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

function pairKey(pair: [number, number]) {
  return `${pair[0]}-${pair[1]}`;
}
