import {
  Crosshair,
  Download,
  FileJson,
  FileUp,
  FolderOpen,
  Home,
  ImageDown,
  Package,
  Save,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "../components/Panel";
import { LocalLinkView } from "../components/LocalLinkView";
import { Stat } from "../components/Stat";
import { Toggle } from "../components/Toggle";
import {
  GeneratedBallValidationError,
  exactBackendStubs,
  parseGeneratedCayleyBall,
} from "../backends";
import { assignShellLayout, collectGraphNeighborhood } from "../cayley";
import { CoxeterValidationError, parseCoxeterSystemInput } from "../coxeter";
import {
  buildLocalLinkFromSphericalSubsets,
  computeSphericalCellProxies,
  deriveDavisIncidencePoset,
  enumerateSphericalSubsets,
  type DavisCellProxy,
} from "../davis";
import {
  classifyIncidentEdges,
  resolveIntegerEdgeAssignment,
  validateRankTwoCocycle,
} from "../game";
import { placeCayleyNodesInHyperbolicGeometry } from "../geometry";
import {
  QuotientValidationError,
  parseQuotientComplex,
  quotientManifoldStatus,
  createQuotientBuildInput,
} from "../quotient";
import {
  SceneView,
  type SceneCell,
  type SceneEdge,
  type SceneNode,
  type SceneRenderStats,
} from "../render/SceneView";
import {
  createDesktopBridge,
  readStoredRecentSessions,
  writeStoredRecentSessions,
  type DesktopBridgeResult,
  type DesktopBridgeStatus,
  type DesktopExportRequest,
  type DesktopJobRecord,
  type DesktopMenuCommand,
  type ExternalToolStatus,
} from "../desktop";
import type {
  CoxeterSystemInput,
  DavisHigherCell,
  DavisTwoCell,
  GeneratedCayleyBall,
  HyperbolicProjection,
} from "../types";
import { createGenerationClient } from "./generationClient";
import { createLocalViewCache } from "./localLayoutCache";
import {
  baseOrbicomplexForSystem,
  quotientToGeneratedBall,
  syntheticSystemForGeneratedBall,
  syntheticSystemForQuotient,
  type ViewerDataset,
} from "./viewerDataset";
import {
  buildYGammaCellAtlas,
  isYGammaBaseComplex,
  type YGammaCellAtlas,
  type YGammaCellRecord,
} from "./yGammaAtlas";
import type {
  YGamma2SkeletonScene,
  YGamma2SkeletonSceneOptions,
} from "./yGammaScene";
import { type YGammaPeelMode, type YGammaRankThreeFocus } from "./yGammaScene";
import { createYGammaSceneClient } from "./yGammaSceneClient";
import {
  buildLocalNeighborhoodExport,
  cellBoundaryEdgeKeys,
  type CellFocusMode,
  type CellNeighborhoodMode,
  compactWordLabel,
  type LocalCellRenderMode,
  type LocalViewLayout,
  type OcclusionMode,
  pairKey,
  parsePairKey,
  rankTwoPairDiagnostics,
  relationWalkEntries,
  type RelationWalkMode,
  type LabelScope,
  type ViewPresetId,
} from "./localView";
import { generatedBallIdentity } from "./stableHash";
import {
  buildWhatAmISeeingSummary,
  groupWarnings,
  type WarningGroup,
} from "./viewStory";
import {
  activeGuidedInspectionStep,
  guidedInspectionDefinition,
  guidedInspectionDefinitions,
  moveGuidedInspectionStep,
  type GuidedInspectionId,
  type GuidedInspectionState,
} from "./guidedInspection";
import {
  activeResearchWorkflowStep,
  defaultResearchWorkflowState,
  moveResearchWorkflowStep,
  researchWorkflowSteps,
  topologyLensDefinition,
  topologyLensDefinitions,
  type ResearchWorkflowState,
  type ResearchWorkflowStepId,
  type TopologyLensId,
  type TopologyLensState,
} from "./researchWorkflow";
import { createExperimentBundle, type ExperimentBundle } from "./experiments";
import {
  compareLatestNotebookRuns,
  duplicateNotebookBundle,
  parseNotebookBundles,
  readNotebookBundles,
  readNotebookBundlesSync,
  writeNotebookBundles,
} from "./notebookStorage";
import {
  computeLocalLinkHomology,
  createFiniteSimplicialComplex,
  summarizeTopologyDiagnostics,
  type LocalLinkHomologySummary,
} from "../topology";
import {
  buildTopologyExplanation,
  type TopologyExplanation,
  type TopologyInspectorSubject,
} from "./topologyInspector";
import {
  createAnnotation,
  createCameraBookmark,
  defaultGalleryEntries,
  viewComparisonOptions,
  type Annotation,
  type CameraBookmark,
  type FigureExportBundle,
  type UiMode,
  type ViewComparisonMode,
} from "./researchUi";
import { importRepairSuggestions } from "./importRepair";
import {
  createProjectSessionSnapshot,
  createProjectSession,
  createProjectSessionExport,
  hasProjectSessionChanges,
  importProjectSession,
  upsertRecentProjectSession,
  type ProjectSession,
  type ProjectSessionRecentFile,
  type ProjectSessionSnapshot,
} from "./projectSession";
import {
  countCertificationBlockedEntries,
  filterTumarkinEightFacetCatalogue,
  tumarkinEightFacetCatalogue,
  tumarkinEightFacetSourceRef,
  type EightFacetCatalogueFilter,
} from "../catalogue/eightFacet5d";

import A2 from "../examples/A2.json";
import A3 from "../examples/A3.json";
import compact5CubeGamma1 from "../examples/compact_5_cube_gamma1.json";
import compact5PolytopeP1DoubleMakarov from "../examples/compact_5_polytope_p1_double_makarov.json";
import compact5PrismMakarov from "../examples/compact_5_prism_makarov.json";
import compact5PrismMakarovP2 from "../examples/compact_5_prism_makarov_p2.json";
import hyperbolicToyRank2 from "../examples/hyperbolic_toy_rank2.json";
import I2_5 from "../examples/I2_5.json";
import I2_5IdentityQuotient from "../examples/I2_5_identity_quotient.json";
import universalRank3 from "../examples/universal_rank3.json";

type ViewerMode = "shell" | "geometric";
type GraphViewMode = "global" | "on-graph";
type YGammaMainView = "complex" | "nerve";
type YGammaFocusPreset =
  | "one-relation"
  | "rank-three-cell"
  | "around-generator"
  | "m2-squares"
  | "m3-hexagons"
  | "full-skeleton";
type YGammaCameraBookmark =
  | "front"
  | "top"
  | "square-family"
  | "hexagon-family"
  | "rank-three-cell";

interface ExampleRecord {
  id: string;
  label: string;
  input: CoxeterSystemInput;
}

const graphPresets = {
  small: {
    label: "Small",
    maxRadius: 6,
    maxNodes: 2500,
    maxEdges: 9000,
    matrixKeyPrecision: 10,
    maxNodeLabels: 180,
    maxEdgeLabels: 120,
    maxCells: 220,
    maxProxies: 40,
  },
  medium: {
    label: "Medium",
    maxRadius: 7,
    maxNodes: 6000,
    maxEdges: 20000,
    matrixKeyPrecision: 10,
    maxNodeLabels: 100,
    maxEdgeLabels: 60,
    maxCells: 160,
    maxProxies: 35,
  },
  large: {
    label: "Large",
    maxRadius: 8,
    maxNodes: 12000,
    maxEdges: 45000,
    matrixKeyPrecision: 10,
    maxNodeLabels: 48,
    maxEdgeLabels: 40,
    maxCells: 80,
    maxProxies: 20,
  },
  research: {
    label: "Research",
    maxRadius: 10,
    maxNodes: 20000,
    maxEdges: 80000,
    matrixKeyPrecision: 10,
    maxNodeLabels: 24,
    maxEdgeLabels: 24,
    maxCells: 60,
    maxProxies: 12,
  },
} as const;
const generationDebounceMs = 120;
const geometricDisplayScale = 12;
type GraphPresetId = keyof typeof graphPresets;
type ColorScheme = "light" | "dark";
const viewPresetStorageKey = "coxeter-viewer:view-preset";
const colorSchemeStorageKey = "coxeter-viewer:color-scheme";

const bundledExamples: ExampleRecord[] = [
  { id: "I2_5", label: "I2(5)", input: parseCoxeterSystemInput(I2_5) },
  { id: "A2", label: "A2", input: parseCoxeterSystemInput(A2) },
  { id: "A3", label: "A3", input: parseCoxeterSystemInput(A3) },
  {
    id: "hyperbolic_toy_rank2",
    label: "Hyperbolic toy rank 2",
    input: parseCoxeterSystemInput(hyperbolicToyRank2),
  },
  {
    id: "universal_rank3",
    label: "Universal rank 3",
    input: parseCoxeterSystemInput(universalRank3),
  },
  {
    id: "compact_5_prism_makarov",
    label: "Compact 5-prism P0 Makarov",
    input: parseCoxeterSystemInput(compact5PrismMakarov),
  },
  {
    id: "compact_5_polytope_p1_double_makarov",
    label: "Compact 5-polytope P1 double",
    input: parseCoxeterSystemInput(compact5PolytopeP1DoubleMakarov),
  },
  {
    id: "compact_5_prism_makarov_p2",
    label: "Compact 5-prism P2 Makarov",
    input: parseCoxeterSystemInput(compact5PrismMakarovP2),
  },
  {
    id: "compact_5_cube_gamma1",
    label: "Compact 5-cube Gamma1",
    input: parseCoxeterSystemInput(compact5CubeGamma1),
  },
];

const viewPresetOptions: Array<{ id: ViewPresetId; label: string }> = [
  { id: "global", label: "Global" },
  { id: "local-chamber", label: "Local Chamber" },
  { id: "rank-two-cells", label: "Rank-Two Cells" },
  { id: "geometric-projection", label: "Geometric Projection" },
];

function preferredGeometricProjection(
  system: CoxeterSystemInput,
): HyperbolicProjection {
  return (system.geometry?.dimension ?? 0) <= 3
    ? "poincare-axes"
    : "poincare-pca";
}

function initialWorkerGeneration(): {
  ball: GeneratedCayleyBall | null;
  error: string | null;
  pending: boolean;
  requestId: number;
  generationMs?: number;
} {
  return { ball: firstPaintBall, error: null, pending: true, requestId: 0 };
}

function initialYGammaSceneState(): {
  scene: YGamma2SkeletonScene | undefined;
  sceneVersion: string | undefined;
  pending: boolean;
  error: string | null;
  buildMs?: number;
} {
  return {
    scene: undefined,
    sceneVersion: undefined,
    pending: false,
    error: null,
  };
}

function hashVersionParts(parts: Iterable<string>): string {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 31;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function sceneNumber(value: number | undefined): string {
  return Number.isFinite(value) ? Number(value).toFixed(4) : "";
}

// SceneView treats this value as the boundary between topology rebuilds and
// cheap appearance updates. Include only data that changes object identity,
// incidence, visibility, or positions; labels and colors belong elsewhere.
function sceneStructureVersion(
  nodes: SceneNode[],
  edges: SceneEdge[],
  cells: SceneCell[],
): string {
  const parts: string[] = [
    `n:${nodes.length}`,
    `e:${edges.length}`,
    `c:${cells.length}`,
  ];

  for (const node of nodes) {
    const position = node.position ?? [undefined, undefined, undefined];
    parts.push(
      [
        "n",
        node.id,
        node.length,
        node.hidden ? 1 : 0,
        sceneNumber(node.localDistance),
        sceneNumber(position[0]),
        sceneNumber(position[1]),
        sceneNumber(position[2]),
      ].join(":"),
    );
  }
  for (const edge of edges) {
    parts.push(
      [
        "e",
        edge.id,
        edge.source,
        edge.target,
        edge.generator,
        edge.directed ? 1 : 0,
      ].join(":"),
    );
  }
  for (const cell of cells) {
    parts.push(
      [
        "c",
        cell.id,
        cell.generatorPair.join("-"),
        cell.boundaryNodeIds.join(","),
        sceneNumber(cell.localDistance),
        sceneNumber(cell.dimension),
        cell.sourceCellId ?? "",
      ].join(":"),
    );
  }

  return hashVersionParts(parts);
}

const emptySceneNodes: SceneNode[] = [];
const emptySceneEdges: SceneEdge[] = [];
const emptySceneCells: SceneCell[] = [];
const firstPaintBall: GeneratedCayleyBall = {
  systemName: "I2(5)",
  rank: 2,
  nodes: [
    { id: "e", word: [], length: 0, position: [0, 0, 0] },
    { id: "s0", word: [0], length: 1, position: [1, 0, 0] },
    { id: "s1", word: [1], length: 1, position: [-1, 0, 0] },
  ],
  edges: [
    { id: "e--0--s0", source: "e", target: "s0", generator: 0 },
    { id: "e--1--s1", source: "e", target: "s1", generator: 1 },
  ],
  twoCells: [],
  metadata: {
    radius: 1,
    requestedRadius: 5,
    generatorConvention: "right-multiplication",
    deduplication: "exact",
    caps: { maxRadius: 1, maxNodes: 3, maxEdges: 2 },
    completeness: "truncated",
    capStatus: { radiusCapped: true, truncated: true },
    createdAt: "1970-01-01T00:00:00.000Z",
    warnings: [
      "Tiny first-paint fixture is visible while the selected Cayley ball is generated.",
    ],
  },
};

export function App() {
  const desktopBridge = useMemo(() => createDesktopBridge(), []);
  const initialViewPreset = readStoredViewPreset() ?? "global";
  const [exampleId, setExampleId] = useState(bundledExamples[0].id);
  const [importedExample, setImportedExample] = useState<ExampleRecord | null>(
    null,
  );
  const [importedDataset, setImportedDataset] = useState<ViewerDataset | null>(
    null,
  );
  const [radius, setRadius] = useState(5);
  const [graphPresetId, setGraphPresetId] = useState<GraphPresetId>("small");
  const [uiMode, setUiMode] = useState<UiMode>("research");
  const [colorScheme, setColorScheme] = useState<ColorScheme>(
    () => readStoredColorScheme() ?? "light",
  );
  const [viewerOnly, setViewerOnly] = useState(false);
  const [sceneLayoutSignal, setSceneLayoutSignal] = useState(0);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const rightRailRef = useRef<HTMLElement | null>(null);
  const viewerOnlyScrollSnapshotRef = useRef({
    sidebarTop: 0,
    rightRailTop: 0,
    windowX: 0,
    windowY: 0,
  });
  const [viewComparisonMode, setViewComparisonMode] =
    useState<ViewComparisonMode>("single");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [cameraBookmarks, setCameraBookmarks] = useState<CameraBookmark[]>([]);
  const [bookmarkDraft, setBookmarkDraft] = useState("");
  const [backendId, setBackendId] = useState("browserApproxBackend");
  const [mode, setMode] = useState<ViewerMode>(
    initialViewPreset === "geometric-projection" ? "geometric" : "shell",
  );
  const [graphView, setGraphView] = useState<GraphViewMode>(
    initialViewPreset === "local-chamber" ||
      initialViewPreset === "rank-two-cells"
      ? "on-graph"
      : "global",
  );
  const [localDepth, setLocalDepth] = useState(2);
  const [activePreset, setActivePreset] =
    useState<ViewPresetId>(initialViewPreset);
  const [projection, setProjection] =
    useState<HyperbolicProjection>("poincare-axes");
  const [showCells, setShowCells] = useState(true);
  const [showHigherCells, setShowHigherCells] = useState(true);
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [labelScope, setLabelScope] = useState<LabelScope>(
    initialViewPreset === "local-chamber" ||
      initialViewPreset === "rank-two-cells"
      ? "focused"
      : "budgeted",
  );
  const localViewLayout: LocalViewLayout = "local-chamber-3d";
  const [cellRenderMode, setCellRenderMode] =
    useState<LocalCellRenderMode>("in-graph");
  const [cellFocusMode, setCellFocusMode] =
    useState<CellFocusMode>("incident-selected");
  const [cellNeighborhoodMode, setCellNeighborhoodMode] =
    useState<CellNeighborhoodMode>("chamber");
  const [relationWalkMode, setRelationWalkMode] =
    useState<RelationWalkMode>("numbered");
  const [occlusionMode, setOcclusionMode] = useState<OcclusionMode>("hide-far");
  const [cellOpacity, setCellOpacity] = useState(0.24);
  const [panelOffsetStrength, setPanelOffsetStrength] = useState(0.18);
  const [bringFocusedCellsForward, setBringFocusedCellsForward] =
    useState(true);
  const [resetSignal, setResetSignal] = useState(0);
  const [focusSignal, setFocusSignal] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState("e");
  const [rootNodeId, setRootNodeId] = useState("e");
  const [selectedCellId, setSelectedCellId] = useState<string | undefined>();
  const [disabledPairs, setDisabledPairs] = useState<Set<string>>(new Set());
  const [activeGeneratorPairKey, setActiveGeneratorPairKey] = useState<
    string | undefined
  >();
  const [disabledHigherSubsets, setDisabledHigherSubsets] = useState<
    Set<string>
  >(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const [experimentNote, setExperimentNote] = useState("");
  const [savedExperiments, setSavedExperiments] = useState<ExperimentBundle[]>(
    () => readNotebookBundlesSync(),
  );
  const [guidedInspection, setGuidedInspection] =
    useState<GuidedInspectionState>();
  const [researchWorkflow, setResearchWorkflow] =
    useState<ResearchWorkflowState>(() => defaultResearchWorkflowState());
  const [topologyLens, setTopologyLens] = useState<TopologyLensState>({
    id: "full-local-link",
    selectedGenerator: 0,
  });
  const [notebookImportError, setNotebookImportError] = useState<string | null>(
    null,
  );
  const [quotientSubgroupText, setQuotientSubgroupText] = useState("");
  const [quotientMaxCosets, setQuotientMaxCosets] = useState(128);
  const [quotientBuilderError, setQuotientBuilderError] = useState<
    string | null
  >(null);
  const [sceneStats, setSceneStats] = useState<SceneRenderStats | null>(null);
  const [desktopStatus, setDesktopStatus] =
    useState<DesktopBridgeStatus | null>(null);
  const [desktopMessage, setDesktopMessage] = useState<string | null>(null);
  const [desktopTools, setDesktopTools] = useState<ExternalToolStatus[]>([]);
  const [desktopJobs, setDesktopJobs] = useState<DesktopJobRecord[]>([]);
  const [recentSessions, setRecentSessions] = useState<
    ProjectSessionRecentFile[]
  >(() => readStoredRecentSessions());
  const captureScenePngRef = useRef<(() => Promise<string>) | undefined>(
    undefined,
  );
  const desktopMenuCommandHandlerRef = useRef<
    (command: DesktopMenuCommand) => Promise<void>
  >(async () => undefined);
  const initialSessionBaselineRef = useRef(false);
  const [showAdvancedPanels, setShowAdvancedPanels] = useState(false);
  const [eightFacetCatalogueOpen, setEightFacetCatalogueOpen] = useState(false);
  const [eightFacetCatalogueQuery, setEightFacetCatalogueQuery] = useState("");
  const [eightFacetCatalogueFilter, setEightFacetCatalogueFilter] =
    useState<EightFacetCatalogueFilter>("all");
  const [yGammaMainView, setYGammaMainView] =
    useState<YGammaMainView>("complex");
  const [yGammaShowAllFaces, setYGammaShowAllFaces] = useState(false);
  const [yGammaRankThreeFocusEnabled, setYGammaRankThreeFocusEnabled] =
    useState(false);
  const [yGammaFocusPreset, setYGammaFocusPreset] =
    useState<YGammaFocusPreset>("rank-three-cell");
  const [yGammaFocusGenerator, setYGammaFocusGenerator] = useState(0);
  const [yGammaPeelMode, setYGammaPeelMode] =
    useState<YGammaPeelMode>("same-rank-three");
  const [yGammaTopologyMode, setYGammaTopologyMode] = useState(true);
  const [yGammaCameraBookmark, setYGammaCameraBookmark] =
    useState<YGammaCameraBookmark>("rank-three-cell");
  const [hoveredCellId, setHoveredCellId] = useState<string | undefined>();
  const [debouncedRadius, setDebouncedRadius] = useState(radius);
  const [workerGeneration, setWorkerGeneration] = useState<{
    ball: GeneratedCayleyBall | null;
    error: string | null;
    pending: boolean;
    requestId: number;
    generationMs?: number;
  }>(initialWorkerGeneration);
  const [yGammaSceneState, setYGammaSceneState] = useState(
    initialYGammaSceneState,
  );
  const denseAutoAppliedIds = useRef(new Set<string>());
  const [generationClient] = useState(() => createGenerationClient());
  const [localViewCache] = useState(() => createLocalViewCache());
  const [yGammaSceneClient] = useState(() => createYGammaSceneClient());

  useEffect(() => {
    let cancelled = false;
    void desktopBridge.getStatus().then((status) => {
      if (!cancelled) {
        setDesktopStatus(status);
        if (status.message) {
          setDesktopMessage(status.message);
        }
      }
    });
    void desktopBridge.detectExternalTools().then((tools) => {
      if (!cancelled) {
        setDesktopTools(tools);
      }
    });
    void desktopBridge.listDesktopJobs().then((jobs) => {
      if (!cancelled) {
        setDesktopJobs(jobs);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [desktopBridge]);

  useEffect(() => {
    writeStoredRecentSessions(recentSessions);
  }, [recentSessions]);

  useEffect(() => {
    document.documentElement.dataset.theme = colorScheme;
    window.localStorage?.setItem(colorSchemeStorageKey, colorScheme);
  }, [colorScheme]);

  // CSS grid changes, fullscreen transitions, and desktop WebView resizes can
  // settle over more than one frame. Bumping the layout version at staggered
  // times lets Three.js remeasure the canvas without returning to a RAF loop.
  const scheduleSceneLayoutRefresh = useCallback(() => {
    const bump = () => setSceneLayoutSignal((value) => value + 1);
    window.requestAnimationFrame(() => window.requestAnimationFrame(bump));
    window.setTimeout(bump, 80);
    window.setTimeout(bump, 240);
  }, []);

  useEffect(() => {
    scheduleSceneLayoutRefresh();
  }, [scheduleSceneLayoutRefresh, viewerOnly]);

  // Viewer-only mode removes the side rails from layout. Preserve their scroll
  // positions so returning to the full cockpit does not feel like navigation.
  const captureViewerOnlyScrollState = useCallback(() => {
    viewerOnlyScrollSnapshotRef.current = {
      sidebarTop: sidebarRef.current?.scrollTop ?? 0,
      rightRailTop: rightRailRef.current?.scrollTop ?? 0,
      windowX: window.scrollX,
      windowY: window.scrollY,
    };
  }, []);

  const restoreViewerOnlyScrollState = useCallback(() => {
    const snapshot = viewerOnlyScrollSnapshotRef.current;
    const restore = () => {
      if (sidebarRef.current) {
        sidebarRef.current.scrollTop = snapshot.sidebarTop;
      }
      if (rightRailRef.current) {
        rightRailRef.current.scrollTop = snapshot.rightRailTop;
      }
      window.scrollTo(snapshot.windowX, snapshot.windowY);
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(restore));
    window.setTimeout(restore, 80);
    window.setTimeout(restore, 240);
    window.setTimeout(restore, 500);
  }, []);

  const setViewerOnlyMode = useCallback(
    (nextValue: boolean | ((current: boolean) => boolean)) => {
      setViewerOnly((current) => {
        const resolved =
          typeof nextValue === "function" ? nextValue(current) : nextValue;
        if (resolved === current) {
          return current;
        }
        if (resolved) {
          captureViewerOnlyScrollState();
        } else {
          restoreViewerOnlyScrollState();
        }
        return resolved;
      });
    },
    [captureViewerOnlyScrollState, restoreViewerOnlyScrollState],
  );

  useEffect(() => {
    let cancelled = false;
    void readNotebookBundles().then((bundles) => {
      if (!cancelled && bundles.length > 0) {
        setSavedExperiments(bundles.slice(0, 24));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const graphPreset = graphPresets[graphPresetId];

  const examples = useMemo(
    () =>
      importedExample ? [...bundledExamples, importedExample] : bundledExamples,
    [importedExample],
  );
  const visibleEightFacetCatalogue = useMemo(
    () =>
      filterTumarkinEightFacetCatalogue({
        query: eightFacetCatalogueQuery,
        filter: eightFacetCatalogueFilter,
      }),
    [eightFacetCatalogueFilter, eightFacetCatalogueQuery],
  );
  const selectedExample =
    examples.find((example) => example.id === exampleId) ?? examples[0];
  const activeDataset: ViewerDataset = useMemo(
    () =>
      importedDataset ??
      ({
        kind: "coxeter-system",
        id: selectedExample.id,
        label: selectedExample.label,
        system: selectedExample.input,
      } satisfies ViewerDataset),
    [importedDataset, selectedExample],
  );
  const system = resolveSystem(activeDataset);
  const sourceSystem =
    activeDataset.kind === "coxeter-system"
      ? activeDataset.system
      : activeDataset.kind === "quotient-complex"
        ? (activeDataset.sourceSystem ?? activeDataset.quotient.sourceSystem)
        : activeDataset.sourceSystem;
  const hasMathContext = sourceSystem !== undefined;
  const sphericalSubsetResult = useMemo(
    () => (sourceSystem ? enumerateSphericalSubsets(sourceSystem) : undefined),
    [sourceSystem],
  );
  const activeGeneratorPair = useMemo(
    () => parsePairKey(activeGeneratorPairKey),
    [activeGeneratorPairKey],
  );
  const geometryAvailable =
    activeDataset.kind !== "quotient-complex" && hasUsableGeometry(system);
  const effectiveMode: ViewerMode = geometryAvailable ? mode : "shell";
  const selectedExactBackend = exactBackendStubs.find(
    (backend) => backend.name === backendId,
  );
  const generationPending = radius !== debouncedRadius;
  const applyViewPreset = useCallback(
    (preset: ViewPresetId, options: { persist?: boolean } = {}) => {
      const persist = options.persist ?? true;
      setActivePreset(preset);
      if (persist) {
        window.localStorage?.setItem(viewPresetStorageKey, preset);
      }

      switch (preset) {
        case "global":
          setMode("shell");
          setGraphView("global");
          setLabelScope("budgeted");
          setShowNodeLabels(true);
          setShowEdgeLabels(true);
          setShowCells(true);
          break;
        case "local-chamber":
          setMode("shell");
          setGraphView("on-graph");
          setLocalDepth(2);
          setCellRenderMode("in-graph");
          setCellFocusMode("incident-selected");
          setCellNeighborhoodMode("chamber");
          setRelationWalkMode("numbered");
          setOcclusionMode("hide-far");
          setCellOpacity(0.24);
          setPanelOffsetStrength(0.18);
          setBringFocusedCellsForward(true);
          setLabelScope("focused");
          setShowNodeLabels(true);
          setShowEdgeLabels(true);
          setShowCells(true);
          break;
        case "rank-two-cells":
          setMode("shell");
          setGraphView("on-graph");
          setLocalDepth(2);
          setCellRenderMode("in-graph");
          setCellFocusMode("selected-pair");
          setCellNeighborhoodMode("cell-plus-1");
          setRelationWalkMode("numbered");
          setOcclusionMode("fade-far");
          setCellOpacity(0.3);
          setPanelOffsetStrength(0.28);
          setBringFocusedCellsForward(true);
          setLabelScope("focused");
          setShowCells(true);
          setShowHigherCells(true);
          break;
        case "geometric-projection":
          if (geometryAvailable) {
            setMode("geometric");
            setProjection(preferredGeometricProjection(system));
            if ((system.geometry?.dimension ?? 0) > 3) {
              setGraphView("on-graph");
              setLocalDepth(2);
              setCellRenderMode("in-graph");
              setCellFocusMode("incident-selected");
              setCellNeighborhoodMode("chamber");
              setOcclusionMode("hide-far");
              setLabelScope("focused");
            } else {
              setGraphView("global");
              setLabelScope("budgeted");
            }
          } else {
            setMode("shell");
            setGraphView("global");
            setLabelScope("budgeted");
          }
          setShowNodeLabels(true);
          setShowEdgeLabels(true);
          setShowCells(true);
          break;
      }
    },
    [geometryAvailable, system],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedRadius(radius),
      generationDebounceMs,
    );

    return () => window.clearTimeout(timeoutId);
  }, [radius]);

  useEffect(
    () => () => {
      generationClient.dispose();
      yGammaSceneClient.dispose();
    },
    [generationClient, yGammaSceneClient],
  );

  useEffect(() => {
    if (activeDataset.kind !== "coxeter-system") {
      return;
    }

    const options = {
      maxRadius: graphPreset.maxRadius,
      maxNodes: graphPreset.maxNodes,
      maxEdges: graphPreset.maxEdges,
      matrixKeyPrecision: graphPreset.matrixKeyPrecision,
      radius: debouncedRadius,
    };
    let cancelled = false;
    const client = generationClient;

    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      setWorkerGeneration((current) => ({
        ball: current.ball,
        error: null,
        pending: true,
        requestId: current.requestId + 1,
        generationMs: current.generationMs,
      }));

      void client
        .generate({
          datasetId: activeDataset.id,
          system: activeDataset.system,
          options,
        })
        .then((result) => {
          if (cancelled) {
            return;
          }
          setWorkerGeneration({
            ball: result.ball,
            error: null,
            pending: false,
            requestId: result.requestId,
            generationMs: result.generationMs,
          });
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          setWorkerGeneration({
            ball: null,
            error: error instanceof Error ? error.message : String(error),
            pending: false,
            requestId: 0,
            generationMs: undefined,
          });
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    activeDataset,
    debouncedRadius,
    generationClient,
    graphPreset.maxEdges,
    graphPreset.maxNodes,
    graphPreset.maxRadius,
    graphPreset.matrixKeyPrecision,
  ]);
  const generation = useMemo(() => {
    if (activeDataset.kind === "coxeter-system") {
      return workerGeneration;
    }

    return {
      ball: withShellLayout(activeDataset.ball),
      error: null,
      pending: false,
      requestId: 0,
      generationMs: undefined,
    };
  }, [activeDataset, workerGeneration]);

  const displayed = useMemo(() => {
    if (!generation.ball || effectiveMode !== "geometric") {
      return generation;
    }

    const localPcaCenterNodeId = generation.ball.nodes.some(
      (node) => node.id === selectedNodeId,
    )
      ? selectedNodeId
      : generation.ball.nodes[0]?.id;
    const localPcaFitNodeIds =
      projection.endsWith("-pca") &&
      (system.geometry?.dimension ?? 0) > 3 &&
      localPcaCenterNodeId
        ? collectGraphNeighborhood(
            generation.ball.edges,
            localPcaCenterNodeId,
            {
              depth: 2,
            },
          )
        : undefined;
    const placement = placeCayleyNodesInHyperbolicGeometry(
      system,
      generation.ball.nodes,
      {
        projection,
        displayScale: geometricDisplayScale,
        pcaCenterNodeId: localPcaCenterNodeId,
        pcaFitNodeIds: localPcaFitNodeIds,
      },
    );

    return {
      ball: {
        ...generation.ball,
        nodes: placement.nodes,
        metadata: {
          ...generation.ball.metadata,
          warnings: [
            ...generation.ball.metadata.warnings,
            ...placement.warnings,
          ],
        },
      },
      error: placement.ok ? null : placement.warnings.join(" "),
    };
  }, [effectiveMode, generation, projection, selectedNodeId, system]);

  const ball = displayed.ball;
  const ballIdentity = useMemo(
    () => (ball ? generatedBallIdentity(ball) : "no-ball"),
    [ball],
  );
  const ballIndexes = useMemo(() => {
    const nodesById = new Map<string, GeneratedCayleyBall["nodes"][number]>();
    const twoCellsById = new Map<string, DavisTwoCell>();
    const higherCellsById = new Map<string, DavisHigherCell>();
    for (const node of ball?.nodes ?? []) {
      nodesById.set(node.id, node);
    }
    for (const cell of ball?.twoCells ?? []) {
      twoCellsById.set(cell.id, cell);
    }
    for (const cell of ball?.higherCells ?? []) {
      higherCellsById.set(cell.id, cell);
      higherCellsById.set(`proxy:${cell.id}`, cell);
    }
    return { nodesById, twoCellsById, higherCellsById };
  }, [ball]);
  const selectedNode =
    ballIndexes.nodesById.get(selectedNodeId) ?? ball?.nodes[0];
  const selectedRankTwoCell =
    selectedCellId !== undefined
      ? ballIndexes.twoCellsById.get(selectedCellId)
      : undefined;
  const focusedRankTwoCell = useMemo(
    () =>
      chooseFocusedRankTwoCell({
        cells: ball?.twoCells ?? [],
        selectedCell: selectedRankTwoCell,
        activePairKey: activeGeneratorPairKey,
        selectedNodeId: selectedNode?.id,
      }),
    [
      activeGeneratorPairKey,
      ball?.twoCells,
      selectedNode?.id,
      selectedRankTwoCell,
    ],
  );
  const activeQuotient =
    activeDataset.kind === "quotient-complex"
      ? activeDataset.quotient
      : undefined;
  const quotientAssignment = useMemo(
    () =>
      activeQuotient
        ? resolveIntegerEdgeAssignment(
            activeQuotient.game,
            activeQuotient.edges,
            activeQuotient.sourceSystem?.rank ?? activeQuotient.generatorRank,
          )
        : undefined,
    [activeQuotient],
  );
  const quotientBoundaryChecks = useMemo(
    () =>
      activeQuotient && quotientAssignment
        ? validateRankTwoCocycle(
            activeQuotient.twoCells,
            activeQuotient.edges,
            quotientAssignment.edgeStates,
          )
        : undefined,
    [activeQuotient, quotientAssignment],
  );
  const quotientIncidentFlows = useMemo(
    () =>
      activeQuotient && quotientAssignment && selectedNode?.id
        ? classifyIncidentEdges(
            selectedNode.id,
            activeQuotient.edges,
            quotientAssignment.edgeStates,
          )
        : [],
    [activeQuotient, quotientAssignment, selectedNode],
  );
  const quotientLensSceneIds = useMemo(() => {
    if (!activeQuotient || !isQuotientLinkLens(topologyLens.id)) {
      return undefined;
    }

    const selectedVertexId = selectedNode?.id ?? activeQuotient.vertices[0]?.id;
    if (!selectedVertexId) {
      return undefined;
    }

    const selectedFlows =
      topologyLens.id === "full-local-link"
        ? quotientIncidentFlows
        : quotientIncidentFlows.filter(
            (flow) =>
              flow.classification === topologyLens.id.replace("-link", ""),
          );
    const edgeIds = new Set(selectedFlows.map((flow) => flow.edgeId));
    const nodeIds = new Set<string>([selectedVertexId]);
    selectedFlows.forEach((flow) => nodeIds.add(flow.neighborId));
    return { nodeIds, edgeIds };
  }, [
    activeQuotient,
    quotientIncidentFlows,
    selectedNode?.id,
    topologyLens.id,
  ]);
  const localLayoutDepth = useMemo(() => {
    if (!focusedRankTwoCell || cellNeighborhoodMode === "chamber") {
      return localDepth;
    }
    const boundaryDepth = Math.ceil(
      focusedRankTwoCell.boundaryNodeIds.length / 2,
    );
    const contextDepth =
      cellNeighborhoodMode === "cell-plus-2"
        ? 2
        : cellNeighborhoodMode === "cell-plus-1"
          ? 1
          : 0;
    return Math.max(localDepth, boundaryDepth + contextDepth);
  }, [cellNeighborhoodMode, focusedRankTwoCell, localDepth]);
  const localLayout = useMemo(
    () =>
      ball && selectedNode
        ? localViewCache.localChamber3DLayout({
            ball,
            centerNodeId: selectedNode.id,
            options: {
              depth: localLayoutDepth,
              generatorCount: system.rank,
            },
          })
        : undefined,
    [ball, localLayoutDepth, localViewCache, selectedNode, system.rank],
  );
  const chamberNodeIds = useMemo(() => {
    if (graphView !== "on-graph" || !localLayout) {
      return undefined;
    }
    if (occlusionMode !== "hide-far") {
      return localLayout.nodeIds;
    }
    const maxVisibleDepth = Math.min(localDepth, 2);
    return new Set(
      [...localLayout.distances.entries()]
        .filter(([, distance]) => distance <= maxVisibleDepth)
        .map(([nodeId]) => nodeId),
    );
  }, [graphView, localDepth, localLayout, occlusionMode]);
  const focusedCellNodeIds = useMemo(
    () =>
      graphView === "on-graph"
        ? localViewCache.cellNeighborhoodNodeIds({
            ball: ball ?? undefined,
            cell: focusedRankTwoCell,
            mode: cellNeighborhoodMode,
          })
        : undefined,
    [ball, cellNeighborhoodMode, focusedRankTwoCell, graphView, localViewCache],
  );
  const localNodeIds = useMemo(() => {
    if (graphView !== "on-graph") {
      return undefined;
    }
    if (!focusedCellNodeIds) {
      return chamberNodeIds;
    }
    if (cellNeighborhoodMode === "cell-boundary") {
      return focusedCellNodeIds;
    }
    return mergeSets(chamberNodeIds, focusedCellNodeIds);
  }, [cellNeighborhoodMode, chamberNodeIds, focusedCellNodeIds, graphView]);
  const sceneNodeIdSet = useMemo(
    () =>
      quotientLensSceneIds?.nodeIds ??
      localNodeIds ??
      new Set((ball?.nodes ?? []).map((node) => node.id)),
    [ball, localNodeIds, quotientLensSceneIds],
  );
  const viewNodes = useMemo(
    () => (ball?.nodes ?? []).filter((node) => sceneNodeIdSet.has(node.id)),
    [ball, sceneNodeIdSet],
  );
  const viewEdges = useMemo(
    () =>
      (ball?.edges ?? []).filter(
        (edge) =>
          (quotientLensSceneIds === undefined ||
            quotientLensSceneIds.edgeIds.has(edge.id)) &&
          sceneNodeIdSet.has(edge.source) &&
          sceneNodeIdSet.has(edge.target),
      ),
    [ball, quotientLensSceneIds, sceneNodeIdSet],
  );
  const viewRankTwoCells = useMemo(
    () =>
      (ball?.twoCells ?? []).filter((cell) =>
        cell.boundaryNodeIds.every((nodeId) => sceneNodeIdSet.has(nodeId)),
      ),
    [ball, sceneNodeIdSet],
  );
  const localLink = useMemo(
    () =>
      sourceSystem && sphericalSubsetResult
        ? buildLocalLinkFromSphericalSubsets(
            sourceSystem,
            selectedNode?.id ?? "e",
            sphericalSubsetResult,
          )
        : emptyLocalLink(selectedNode?.id ?? "e"),
    [selectedNode?.id, sourceSystem, sphericalSubsetResult],
  );
  const localLinkHomology = useMemo(
    () => (hasMathContext ? computeLocalLinkHomology(localLink) : undefined),
    [hasMathContext, localLink],
  );
  const sphericalCellProxies = useMemo(() => {
    if (!ball || !hasMathContext || !sphericalSubsetResult) {
      return { proxies: [], warnings: [] };
    }
    return computeSphericalCellProxies(ball, sphericalSubsetResult.subsets, {
      maxProxies: graphPreset.maxProxies,
    });
  }, [ball, graphPreset.maxProxies, hasMathContext, sphericalSubsetResult]);
  const davisIncidence = useMemo(() => {
    if (!ball || !hasMathContext || !sphericalSubsetResult) {
      return undefined;
    }
    return (
      ball.davisIncidence ??
      deriveDavisIncidencePoset(ball, sphericalSubsetResult.subsets)
    );
  }, [ball, hasMathContext, sphericalSubsetResult]);
  const topologyDiagnostics = useMemo(() => {
    if (!hasMathContext || !sphericalSubsetResult) {
      return undefined;
    }
    const complex = createFiniteSimplicialComplex({
      vertices: system.generators.map((generator) => generator.label),
      simplices: sphericalSubsetResult.subsets.map((subset) =>
        subset.generators.map(
          (generator) => system.generators[generator]?.label ?? `s${generator}`,
        ),
      ),
    });
    return summarizeTopologyDiagnostics(complex, {
      maxCliqueSize: Math.min(4, system.rank),
    });
  }, [hasMathContext, sphericalSubsetResult, system.generators, system.rank]);
  const yGammaAtlas = useMemo(
    () =>
      sourceSystem
        ? buildYGammaCellAtlas(sourceSystem, sphericalSubsetResult)
        : undefined,
    [sourceSystem, sphericalSubsetResult],
  );
  const yGammaRankThreeFocus = useMemo(
    () => (yGammaAtlas ? findSharedM2M3RankThreeFocus(yGammaAtlas) : undefined),
    [yGammaAtlas],
  );
  const activeIsYGammaBaseComplex =
    activeDataset.kind === "quotient-complex" &&
    isYGammaBaseComplex(activeDataset.quotient);
  const yGammaDense =
    activeIsYGammaBaseComplex && (yGammaAtlas?.generatorCount ?? 0) >= 7;
  const showDetailedControls = !activeIsYGammaBaseComplex || showAdvancedPanels;
  const yGammaRelationOrderFilter =
    yGammaFocusPreset === "m2-squares"
      ? 2
      : yGammaFocusPreset === "m3-hexagons"
        ? 3
        : undefined;
  const yGammaEffectiveFocusGenerator =
    yGammaFocusPreset === "around-generator" ? yGammaFocusGenerator : undefined;
  const yGammaFaceMode = yGammaRankThreeFocusEnabled
    ? yGammaPeelMode === "selected-face"
      ? "active-pair"
      : "all"
    : yGammaFocusPreset === "one-relation"
      ? "active-pair"
      : yGammaShowAllFaces ||
          !yGammaDense ||
          yGammaFocusPreset === "full-skeleton" ||
          yGammaFocusPreset === "around-generator" ||
          yGammaRelationOrderFilter !== undefined
        ? "all"
        : activeGeneratorPairKey
          ? "active-pair"
          : "one-skeleton";
  const yGammaIncludeRankThreeCells =
    showHigherCells &&
    (yGammaRankThreeFocusEnabled || yGammaFocusPreset !== "one-relation");
  const effectiveYGammaRankThreeFocus = useMemo(
    () =>
      yGammaRankThreeFocusEnabled && yGammaRankThreeFocus
        ? {
            ...yGammaRankThreeFocus,
            restrictGeneratorSpine: false,
            showOnlyFundamentalFaces: false,
          }
        : undefined,
    [yGammaRankThreeFocus, yGammaRankThreeFocusEnabled],
  );
  const yGammaSceneOptions = useMemo<YGamma2SkeletonSceneOptions>(
    () => ({
      activeGeneratorPairKey,
      faceMode: yGammaFaceMode,
      includeRankThreeCells: yGammaIncludeRankThreeCells,
      rankThreeFocus: effectiveYGammaRankThreeFocus,
      focusGenerator: yGammaEffectiveFocusGenerator,
      relationOrderFilter: yGammaRelationOrderFilter,
      peelMode: yGammaPeelMode,
    }),
    [
      activeGeneratorPairKey,
      effectiveYGammaRankThreeFocus,
      yGammaEffectiveFocusGenerator,
      yGammaFaceMode,
      yGammaIncludeRankThreeCells,
      yGammaPeelMode,
      yGammaRelationOrderFilter,
    ],
  );
  const requestedYGammaSceneVersion = useMemo(
    () =>
      yGammaAtlas
        ? yGammaSceneClient.sceneVersionFor({
            atlas: yGammaAtlas,
            options: yGammaSceneOptions,
          })
        : undefined,
    [yGammaAtlas, yGammaSceneClient, yGammaSceneOptions],
  );

  useEffect(() => {
    if (
      !activeIsYGammaBaseComplex ||
      !yGammaAtlas ||
      !requestedYGammaSceneVersion
    ) {
      return;
    }

    let cancelled = false;
    const client = yGammaSceneClient;
    const pendingTimeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      setYGammaSceneState((current) =>
        current.sceneVersion === requestedYGammaSceneVersion && current.scene
          ? current
          : {
              ...current,
              pending: true,
              error: null,
              sceneVersion: requestedYGammaSceneVersion,
            },
      );
    }, 0);

    void client
      .build({ atlas: yGammaAtlas, options: yGammaSceneOptions })
      .then((result) => {
        if (cancelled || result.sceneVersion !== requestedYGammaSceneVersion) {
          return;
        }
        setYGammaSceneState({
          scene: result.scene,
          sceneVersion: result.sceneVersion,
          pending: false,
          error: null,
          buildMs: result.buildMs,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setYGammaSceneState((current) => ({
          ...current,
          pending: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      });

    return () => {
      cancelled = true;
      window.clearTimeout(pendingTimeoutId);
    };
  }, [
    activeIsYGammaBaseComplex,
    requestedYGammaSceneVersion,
    yGammaAtlas,
    yGammaSceneClient,
    yGammaSceneOptions,
  ]);

  const yGamma2SkeletonScene =
    yGammaSceneState.sceneVersion === requestedYGammaSceneVersion
      ? yGammaSceneState.scene
      : undefined;
  const showingYGammaComplex =
    activeIsYGammaBaseComplex &&
    yGamma2SkeletonScene !== undefined &&
    yGammaMainView === "complex";
  const showingYGammaNerve =
    activeIsYGammaBaseComplex &&
    yGammaAtlas !== undefined &&
    yGammaMainView === "nerve";
  const selectedHigherProxy = sphericalCellProxies.proxies.find(
    (proxy) =>
      proxy.id === selectedCellId || proxy.sourceCellId === selectedCellId,
  );
  const selectedHigherCell =
    selectedCellId !== undefined
      ? ballIndexes.higherCellsById.get(selectedCellId)
      : undefined;
  const pairOptions = useMemo(
    () =>
      rankTwoPairDiagnostics({
        allCells: ball?.twoCells ?? [],
        visibleCells: viewRankTwoCells,
        sceneNodeIds: sceneNodeIdSet,
        system,
        localDistances: localLayout?.distances,
      }),
    [
      ball?.twoCells,
      localLayout?.distances,
      sceneNodeIdSet,
      system,
      viewRankTwoCells,
    ],
  );
  const higherSubsetOptions = useMemo(
    () =>
      higherCellSubsetOptions(
        sphericalCellProxies.proxies,
        sphericalSubsetResult?.subsets ?? [],
      ),
    [sphericalSubsetResult, sphericalCellProxies.proxies],
  );
  const budgetedCells = useMemo(
    () =>
      budgetVisibleCells(
        viewRankTwoCells.filter(
          (cell) =>
            showCells &&
            !disabledPairs.has(pairKey(cell.generatorPair)) &&
            cellMatchesFocus(
              cell,
              cellFocusMode,
              selectedNode?.id,
              activeGeneratorPairKey,
              focusedRankTwoCell?.id,
            ),
        ),
        selectedNode?.id,
        graphPreset.maxCells,
        activeGeneratorPairKey,
        sceneNodeIdSet,
      ),
    [
      activeGeneratorPairKey,
      cellFocusMode,
      disabledPairs,
      focusedRankTwoCell?.id,
      graphPreset.maxCells,
      sceneNodeIdSet,
      selectedNode?.id,
      showCells,
      viewRankTwoCells,
    ],
  );
  const visibleCells = budgetedCells.cells;
  const visibleHigherProxies = useMemo(
    () =>
      showHigherCells
        ? sphericalCellProxies.proxies.filter(
            (proxy) =>
              !disabledHigherSubsets.has(proxy.sphericalSubsetId) &&
              proxy.nodeIds.every((nodeId) => sceneNodeIdSet.has(nodeId)),
          )
        : [],
    [
      disabledHigherSubsets,
      sceneNodeIdSet,
      showHigherCells,
      sphericalCellProxies.proxies,
    ],
  );
  const sceneCells = useMemo(
    () => [
      ...visibleCells.map((cell) => ({
        ...cell,
        isRelationBoundary: cell.id === focusedRankTwoCell?.id,
        localDistance: maxBoundaryDistance(cell.boundaryNodeIds, localLayout),
      })),
      ...visibleHigherProxies.map((proxy) => ({
        id: proxy.id,
        generatorPair: [proxy.generators[0], proxy.generators[1]] as [
          number,
          number,
        ],
        boundaryNodeIds: proxy.nodeIds,
        localDistance: maxBoundaryDistance(proxy.nodeIds, localLayout),
      })),
    ],
    [focusedRankTwoCell?.id, localLayout, visibleCells, visibleHigherProxies],
  );
  const generatorSteps = useMemo(
    () =>
      localViewCache.generatorStepOptions({
        edges: ball?.edges ?? [],
        selectedNodeId: selectedNode?.id,
        generators: system.generators,
        ballIdentity,
      }),
    [
      ball?.edges,
      ballIdentity,
      localViewCache,
      selectedNode?.id,
      system.generators,
    ],
  );
  const breadcrumb = useMemo(
    () =>
      localViewCache.wordBreadcrumb({
        nodes: ball?.nodes ?? [],
        selectedNode,
        generators: system.generators,
        ballIdentity,
      }),
    [
      ball?.nodes,
      ballIdentity,
      localViewCache,
      selectedNode,
      system.generators,
    ],
  );
  const relationWalk = useMemo(
    () =>
      relationWalkMode === "numbered"
        ? relationWalkEntries({
            cell: focusedRankTwoCell,
            nodes: ball?.nodes ?? [],
            edges: ball?.edges ?? [],
            generators: system.generators,
          })
        : [],
    [
      ball?.edges,
      ball?.nodes,
      focusedRankTwoCell,
      relationWalkMode,
      system.generators,
    ],
  );
  const relationLabelByNodeId = useMemo(
    () => new Map(relationWalk.map((entry) => [entry.nodeId, entry.label])),
    [relationWalk],
  );
  const relationBoundaryNodeIds = useMemo(
    () => new Set(relationWalk.map((entry) => entry.nodeId)),
    [relationWalk],
  );
  const relationBoundaryEdgeIds = useMemo(
    () => cellBoundaryEdgeKeys(ball?.edges ?? [], focusedRankTwoCell),
    [ball?.edges, focusedRankTwoCell],
  );
  const focusedCellCameraTarget = useMemo(() => {
    if (!focusedRankTwoCell || graphView !== "on-graph" || !localLayout) {
      return undefined;
    }
    const positions = focusedRankTwoCell.boundaryNodeIds
      .map((nodeId) => localLayout.positions.get(nodeId))
      .filter(
        (position): position is [number, number, number] =>
          position !== undefined,
      );
    if (positions.length === 0) {
      return undefined;
    }
    return centroid3(positions);
  }, [focusedRankTwoCell, graphView, localLayout]);
  const yGammaCameraFocus = useMemo(() => {
    if (!showingYGammaComplex || !yGamma2SkeletonScene) {
      return undefined;
    }
    const positionsByNodeId = new Map(
      yGamma2SkeletonScene.nodes.map((node) => [node.id, node.position]),
    );
    const activePairFaces = activeGeneratorPairKey
      ? yGamma2SkeletonScene.cells.filter(
          (cell) => pairKey(cell.generatorPair) === activeGeneratorPairKey,
        )
      : [];
    const rankThreeFaces =
      yGammaRankThreeFocus && yGammaRankThreeFocusEnabled
        ? yGamma2SkeletonScene.cells.filter(
            (cell) => cell.sourceCellId === yGammaRankThreeFocus.cellId,
          )
        : [];
    const focusCells =
      yGammaCameraBookmark === "rank-three-cell" && rankThreeFaces.length > 0
        ? rankThreeFaces
        : activePairFaces.length > 0
          ? activePairFaces
          : yGamma2SkeletonScene.cells;
    const positions = focusCells
      .flatMap((cell) => cell.boundaryNodeIds)
      .map((nodeId) => positionsByNodeId.get(nodeId))
      .filter(
        (position): position is [number, number, number] =>
          position !== undefined,
      );
    const target = centroid3(positions);
    if (!target) {
      return undefined;
    }

    const offset = yGammaCameraOffsetForFocus(
      yGammaCameraBookmark,
      focusCells,
      positionsByNodeId,
    );
    return { target, offset };
  }, [
    activeGeneratorPairKey,
    showingYGammaComplex,
    yGamma2SkeletonScene,
    yGammaCameraBookmark,
    yGammaRankThreeFocus,
    yGammaRankThreeFocusEnabled,
  ]);
  const cameraFocusTarget =
    yGammaCameraFocus?.target ??
    focusedCellCameraTarget ??
    (graphView === "on-graph" && activeGeneratorPairKey
      ? localLayout?.cameraTargets.get(activeGeneratorPairKey)
      : undefined);
  const cameraFocusOffset = yGammaCameraFocus?.offset;
  const denseExample = system.rank >= 7 || (ball?.nodes.length ?? 0) > 500;
  const sceneNodes = useMemo(() => {
    const viewRootNodeId =
      graphView === "on-graph" ? selectedNode?.id : rootNodeId;
    const rootPosition = ball?.nodes.find(
      (node) => node.id === viewRootNodeId,
    )?.position;

    return viewNodes.map((node) => {
      const position: [number, number, number] | undefined =
        graphView === "on-graph"
          ? effectiveMode === "geometric"
            ? node.position
            : localLayout?.positions.get(node.id)
          : effectiveMode !== "geometric" && node.position && rootPosition
            ? [
                node.position[0] - rootPosition[0],
                node.position[1] - rootPosition[1],
                node.position[2] - rootPosition[2],
              ]
            : node.position;

      return {
        ...node,
        label:
          relationLabelByNodeId.get(node.id) ??
          compactWordLabel(node.word, system.generators),
        compactLabel:
          relationLabelByNodeId.get(node.id) ??
          compactWordLabel(node.word, system.generators),
        isRelationBoundary: relationBoundaryNodeIds.has(node.id),
        ghost:
          cellNeighborhoodMode !== "chamber" &&
          focusedRankTwoCell !== undefined &&
          !relationBoundaryNodeIds.has(node.id),
        localDistance: localLayout?.distances.get(node.id),
        position,
      };
    });
  }, [
    ball,
    cellNeighborhoodMode,
    effectiveMode,
    focusedRankTwoCell,
    graphView,
    localLayout,
    relationBoundaryNodeIds,
    relationLabelByNodeId,
    rootNodeId,
    selectedNode?.id,
    system.generators,
    viewNodes,
  ]);
  const sceneEdges = useMemo(
    () =>
      viewEdges.map((edge) => ({
        ...edge,
        compactLabel:
          system.generators[edge.generator]?.label ?? `s${edge.generator}`,
        isRelationBoundary: relationBoundaryEdgeIds.has(edge.id),
        ghost:
          cellNeighborhoodMode !== "chamber" &&
          focusedRankTwoCell !== undefined &&
          !relationBoundaryEdgeIds.has(edge.id),
      })),
    [
      cellNeighborhoodMode,
      focusedRankTwoCell,
      relationBoundaryEdgeIds,
      system.generators,
      viewEdges,
    ],
  );
  const activeSceneNodes = useMemo(
    () =>
      showingYGammaComplex
        ? (yGamma2SkeletonScene?.nodes ?? emptySceneNodes)
        : sceneNodes,
    [sceneNodes, showingYGammaComplex, yGamma2SkeletonScene],
  );
  const activeSceneEdges = useMemo(
    () =>
      showingYGammaComplex
        ? (yGamma2SkeletonScene?.edges ?? emptySceneEdges)
        : sceneEdges,
    [sceneEdges, showingYGammaComplex, yGamma2SkeletonScene],
  );
  const activeSceneCells = useMemo(
    () =>
      showingYGammaComplex
        ? (yGamma2SkeletonScene?.cells ?? emptySceneCells)
        : sceneCells,
    [sceneCells, showingYGammaComplex, yGamma2SkeletonScene],
  );
  const activeSceneSelectedNodeId = showingYGammaComplex
    ? yGamma2SkeletonScene?.selectedNodeId
    : selectedNode?.id;
  const activeSceneVisibleNodeCount = useMemo(
    () =>
      activeSceneNodes.filter((node) => !("hidden" in node) || !node.hidden)
        .length,
    [activeSceneNodes],
  );
  const yGammaHoveredOrActiveCell = useMemo(() => {
    if (!showingYGammaComplex || !yGamma2SkeletonScene) {
      return undefined;
    }
    const cellId = hoveredCellId ?? selectedCellId;
    const direct = cellId
      ? yGamma2SkeletonScene.cells.find((cell) => cell.id === cellId)
      : undefined;
    if (direct) {
      return direct;
    }
    if (!activeGeneratorPairKey) {
      return undefined;
    }
    return yGamma2SkeletonScene.cells.find(
      (cell) => pairKey(cell.generatorPair) === activeGeneratorPairKey,
    );
  }, [
    activeGeneratorPairKey,
    hoveredCellId,
    selectedCellId,
    showingYGammaComplex,
    yGamma2SkeletonScene,
  ]);
  const yGammaActiveRelation = useMemo(() => {
    if (!yGammaAtlas) {
      return undefined;
    }
    const pair =
      yGammaHoveredOrActiveCell?.generatorPair ?? activeGeneratorPair;
    if (!pair) {
      return undefined;
    }
    const key = pairKey(pair);
    return yGammaAtlas.rankTwoCells.find(
      (cell) => relationCellPairKey(cell.generators) === key,
    );
  }, [activeGeneratorPair, yGammaAtlas, yGammaHoveredOrActiveCell]);
  const effectiveMaxNodeLabels =
    graphView === "on-graph"
      ? Math.max(graphPreset.maxNodeLabels, Math.min(viewNodes.length, 180))
      : graphPreset.maxNodeLabels;
  const effectiveMaxEdgeLabels =
    graphView === "on-graph"
      ? Math.max(graphPreset.maxEdgeLabels, Math.min(viewEdges.length, 180))
      : graphPreset.maxEdgeLabels;
  const geometricReferenceBallVisible =
    !showingYGammaComplex &&
    effectiveMode === "geometric" &&
    graphView === "global" &&
    !projection.endsWith("-pca");
  const activeSceneStructureVersion = useMemo(
    () =>
      sceneStructureVersion(
        activeSceneNodes,
        activeSceneEdges,
        activeSceneCells,
      ),
    [activeSceneCells, activeSceneEdges, activeSceneNodes],
  );
  // Appearance changes can reuse meshes: selected ids, label budgets, colors,
  // opacity, and camera-facing helpers should not invalidate topology buffers.
  const activeSceneAppearanceVersion = useMemo(
    () =>
      hashVersionParts([
        `selected-node:${activeSceneSelectedNodeId ?? ""}`,
        `selected-cell:${selectedCellId ?? ""}`,
        `show-cells:${showingYGammaComplex || showCells || showHigherCells}`,
        `show-node-labels:${showingYGammaComplex || showNodeLabels}`,
        `show-edge-labels:${showingYGammaComplex || showEdgeLabels}`,
        `label-scope:${showingYGammaComplex ? "focused" : labelScope}`,
        `active-pair:${activeGeneratorPairKey ?? ""}`,
        `cell-render:${showingYGammaComplex ? "in-graph" : cellRenderMode}`,
        `occlusion:${occlusionMode}`,
        `cell-opacity:${
          showingYGammaComplex ? (yGammaTopologyMode ? 0.18 : 0.3) : cellOpacity
        }`,
        `panel-offset:${
          showingYGammaComplex
            ? 0
            : bringFocusedCellsForward
              ? panelOffsetStrength
              : 0
        }`,
        `topology:${showingYGammaComplex && yGammaTopologyMode}`,
        `semantic:${showingYGammaComplex}`,
        `reference:${geometricReferenceBallVisible}`,
        `reference-radius:${geometricDisplayScale}`,
        `theme:${colorScheme}`,
        `camera:${showingYGammaComplex ? "global" : graphView}`,
        `max-node-labels:${showingYGammaComplex ? 80 : effectiveMaxNodeLabels}`,
        `max-edge-labels:${showingYGammaComplex ? 80 : effectiveMaxEdgeLabels}`,
        ...system.generators.map(
          (generator) => `${generator.label}:${generator.colorHint ?? ""}`,
        ),
      ]),
    [
      activeGeneratorPairKey,
      activeSceneSelectedNodeId,
      bringFocusedCellsForward,
      cellOpacity,
      cellRenderMode,
      colorScheme,
      effectiveMaxEdgeLabels,
      effectiveMaxNodeLabels,
      geometricReferenceBallVisible,
      graphView,
      labelScope,
      occlusionMode,
      panelOffsetStrength,
      selectedCellId,
      showCells,
      showEdgeLabels,
      showHigherCells,
      showingYGammaComplex,
      showNodeLabels,
      system.generators,
      yGammaTopologyMode,
    ],
  );
  const warnings = useMemo(
    () => [
      ...(system.warnings ?? []),
      ...dataStatusWarnings(system),
      ...(system.notes?.filter((note) =>
        note.toLowerCase().includes("placeholder"),
      ) ?? []),
      ...(ball?.metadata.warnings ?? []),
      ...(ball?.metadata.certification?.errors ?? []),
      ...(ball?.metadata.certification?.warnings ?? []),
      ...localLink.warnings,
      ...(davisIncidence?.warnings ?? []),
      ...(topologyDiagnostics?.warnings ?? []),
      ...sphericalCellProxies.warnings,
      ...(showingYGammaComplex ? (yGamma2SkeletonScene?.warnings ?? []) : []),
      ...(activeIsYGammaBaseComplex && yGammaSceneState.pending
        ? ["Y_Gamma scene construction is running in a worker."]
        : []),
      ...(activeIsYGammaBaseComplex && yGammaSceneState.error
        ? [yGammaSceneState.error]
        : []),
      ...(activeIsYGammaBaseComplex && yGammaAtlas ? yGammaAtlas.warnings : []),
      ...(budgetedCells.omitted > 0
        ? [
            `${budgetedCells.omitted} rank-two Davis cells were omitted by the ${graphPreset.label} render budget.`,
          ]
        : []),
      ...(graphPresetId === "research"
        ? [
            "Research graph size raises generation caps to radius 10; labels and cell rendering are aggressively budgeted for responsiveness.",
          ]
        : []),
      ...(activeDataset.id === "compact_5_cube_gamma1" &&
      graphView === "global" &&
      debouncedRadius >= 5
        ? [
            "Compact 5-cube radius 5+ in Global view is a research/stress view; Local Chamber is recommended for interactive inspection.",
          ]
        : []),
      ...(generation.pending
        ? ["Cayley ball generation is running in a worker."]
        : []),
      ...(!hasMathContext
        ? [
            "This generated graph has no source Coxeter system; local-link and spherical-subset math are disabled.",
          ]
        : []),
      ...(activeDataset.kind === "quotient-complex"
        ? [quotientManifoldStatus(activeDataset.quotient).reason]
        : []),
      ...(selectedExactBackend
        ? [selectedExactBackend.availability("generate").message]
        : []),
      ...(rootNodeId !== "e"
        ? [
            `The view is visually re-rooted at ${rootNodeId}; words and lengths are still recorded from the identity.`,
          ]
        : []),
      ...(graphView === "on-graph"
        ? [
            `Local Chamber 3D shows the radius-${localDepth} graph-neighborhood around ${selectedNode?.id ?? "the selected node"} with ${cellRenderMode} cell drawings; off-graph panels are optional readability transforms, not geometry.`,
          ]
        : []),
      ...(cellNeighborhoodMode !== "chamber" && focusedRankTwoCell
        ? [
            `Cell neighborhood view includes the complete boundary of ${focusedRankTwoCell.id}; non-boundary graph context is ghosted for readability.`,
          ]
        : []),
      ...(generationPending
        ? [
            `Radius ${radius} is queued; currently showing radius ${debouncedRadius}.`,
          ]
        : []),
      ...(effectiveMode === "geometric"
        ? [
            system.geometry?.certifiedModel?.certificate.status === "passed"
              ? "Interval-certified reflection residuals are available for this geometric dataset; the 3D projection remains a visualization."
              : "This 3D view is a projection, not exact hyperbolic geometry.",
          ]
        : []),
      ...(effectiveMode === "geometric" && projection.endsWith("-pca")
        ? [
            "PCA projection does not preserve the ball boundary; the reference sphere is hidden because displayed coordinates can fall outside it.",
          ]
        : []),
      ...(geometricReferenceBallVisible
        ? [
            `The ${projection.startsWith("poincare") ? "Poincare" : "Klein"} ball is drawn at ${geometricDisplayScale}x display scale so near-boundary chambers remain readable.`,
          ]
        : []),
      ...(displayed.error ? [displayed.error] : []),
    ],
    [
      activeDataset,
      activeIsYGammaBaseComplex,
      ball,
      budgetedCells.omitted,
      cellRenderMode,
      cellNeighborhoodMode,
      davisIncidence?.warnings,
      debouncedRadius,
      displayed.error,
      effectiveMode,
      generation.pending,
      generationPending,
      graphPresetId,
      graphPreset.label,
      graphView,
      geometricReferenceBallVisible,
      hasMathContext,
      localDepth,
      localLink.warnings,
      radius,
      projection,
      rootNodeId,
      selectedExactBackend,
      selectedNode?.id,
      focusedRankTwoCell,
      sphericalCellProxies.warnings,
      system,
      showingYGammaComplex,
      topologyDiagnostics?.warnings,
      yGamma2SkeletonScene?.warnings,
      yGammaSceneState.error,
      yGammaSceneState.pending,
      yGammaAtlas,
    ],
  );
  const repairSuggestions = useMemo(
    () => (importError ? importRepairSuggestions(importError) : []),
    [importError],
  );
  const warningGroups = useMemo(() => groupWarnings(warnings), [warnings]);
  const whatAmISeeing = useMemo(
    () =>
      buildWhatAmISeeingSummary({
        system,
        ball: ball ?? undefined,
        selectedNode,
        mode: effectiveMode,
        graphView,
        localDepth,
        labelScope,
        activePreset,
        visibleNodeCount: activeSceneVisibleNodeCount,
        visibleEdgeCount: activeSceneEdges.length,
        visibleRankTwoCellCount: showingYGammaComplex
          ? activeSceneCells.length
          : visibleCells.length,
        visibleHigherProxyCount: visibleHigherProxies.length,
        geometryAvailable,
        geometryCertified:
          system.geometry?.certifiedModel?.certificate.status === "passed",
        exactIncidenceCount: davisIncidence?.records.length ?? 0,
        isYGammaBaseComplex: activeIsYGammaBaseComplex,
        yGammaMainView,
      }),
    [
      activeIsYGammaBaseComplex,
      activePreset,
      activeSceneCells.length,
      activeSceneEdges.length,
      activeSceneVisibleNodeCount,
      ball,
      davisIncidence?.records.length,
      effectiveMode,
      geometryAvailable,
      graphView,
      labelScope,
      localDepth,
      selectedNode,
      system,
      showingYGammaComplex,
      visibleCells.length,
      visibleHigherProxies.length,
      yGammaMainView,
    ],
  );
  const activeGuideStep = activeGuidedInspectionStep(guidedInspection);
  const activeWorkflowStep = activeResearchWorkflowStep(researchWorkflow);
  const workflowComparison = useMemo(
    () => compareLatestNotebookRuns(savedExperiments),
    [savedExperiments],
  );
  const topologyInspectorSubject = useMemo<TopologyInspectorSubject>(() => {
    if (showingYGammaComplex && yGammaActiveRelation) {
      return { kind: "ygamma-cell", cell: yGammaActiveRelation };
    }
    if (activeDataset.kind === "quotient-complex" && selectedCellId) {
      const quotientCell = activeDataset.quotient.twoCells.find(
        (cell) => cell.id === selectedCellId,
      );
      if (quotientCell) {
        return {
          kind: "quotient-cell",
          quotient: activeDataset.quotient,
          cell: quotientCell,
        };
      }
    }
    if (
      activeDataset.kind === "quotient-complex" &&
      isQuotientLinkLens(topologyLens.id)
    ) {
      return {
        kind: "game-assignment",
        quotient: activeDataset.quotient,
        selectedVertexId: activeSceneSelectedNodeId,
      };
    }
    if (
      activeGuideStep?.focus === "quotient" &&
      activeDataset.kind === "quotient-complex"
    ) {
      return {
        kind: "game-assignment",
        quotient: activeDataset.quotient,
        selectedVertexId: activeSceneSelectedNodeId,
      };
    }
    if (focusedRankTwoCell) {
      return { kind: "rank-two-cell", cell: focusedRankTwoCell };
    }
    if (selectedHigherCell) {
      return { kind: "higher-cell", cell: selectedHigherCell };
    }
    if (selectedHigherProxy) {
      return { kind: "higher-proxy", proxy: selectedHigherProxy };
    }
    if (activeGuideStep?.focus === "local-link") {
      return {
        kind: "local-link",
        nodeId: selectedNode?.id ?? "e",
        sphericalSubsetCount: sphericalSubsetResult?.subsets.length ?? 0,
      };
    }
    return {
      kind: "node",
      id: selectedNode?.id ?? "none",
      word: selectedNode?.word ?? [],
      length: selectedNode?.length ?? 0,
    };
  }, [
    activeDataset,
    activeGuideStep?.focus,
    activeSceneSelectedNodeId,
    focusedRankTwoCell,
    selectedCellId,
    selectedHigherCell,
    selectedHigherProxy,
    selectedNode,
    showingYGammaComplex,
    sphericalSubsetResult?.subsets.length,
    topologyLens.id,
    yGammaActiveRelation,
  ]);
  const topologyExplanation = useMemo(
    () =>
      buildTopologyExplanation({
        system,
        subject: topologyInspectorSubject,
        geometricProjectionActive: effectiveMode === "geometric",
        geometryIntervalCertified:
          system.geometry?.certifiedModel?.certificate.status === "passed",
      }),
    [effectiveMode, system, topologyInspectorSubject],
  );

  const currentProjectSession = useMemo(
    () =>
      createProjectSession({
        project: {
          label: `${activeDataset.label} session`,
          rootPathHint: desktopStatus?.workspace.rootPathHint,
        },
        workspace: desktopStatus?.workspace,
        dataset: {
          sourceKind:
            activeDataset.kind === "quotient-complex"
              ? "quotient-complex"
              : activeDataset.kind === "generated-graph"
                ? "generated-ball"
                : "example",
          activeDatasetId: activeDataset.id,
          activeExampleId: selectedExample.id,
        },
        generation: {
          radius,
          backend:
            backendId === "sageExportBackend" || backendId === "gapKbmagBackend"
              ? backendId
              : "browserApproxBackend",
          maxRadius: graphPreset.maxRadius,
          maxNodes: graphPreset.maxNodes,
          maxEdges: graphPreset.maxEdges,
        },
        view: {
          mode: activeIsYGammaBaseComplex
            ? "y-gamma"
            : graphView === "on-graph"
              ? "local-topology"
              : effectiveMode === "geometric"
                ? "geometric-projection"
                : "combinatorial-shell",
          labelScope:
            labelScope === "off"
              ? "none"
              : labelScope === "budgeted"
                ? "all"
                : labelScope,
          selectedNodeId: selectedNode?.id,
          selectedCellId,
          activeGeneratorPairKey,
          showRankTwoCells: showCells,
          showHigherCells,
          showNodeLabels,
          showEdgeLabels,
        },
        files: {
          recent: recentSessions,
        },
        experiments: {
          activeBundleId: savedExperiments[0]?.id,
          bundleIds: savedExperiments.map((bundle) => bundle.id),
        },
        desktop: {
          preferredRuntime:
            desktopStatus?.runtime === "tauri" ? "tauri" : "web",
        },
        warnings,
        notes: annotations.map((annotation) => annotation.body),
      }),
    [
      activeDataset.id,
      activeDataset.kind,
      activeDataset.label,
      activeGeneratorPairKey,
      activeIsYGammaBaseComplex,
      annotations,
      backendId,
      desktopStatus?.runtime,
      desktopStatus?.workspace,
      effectiveMode,
      graphPreset.maxEdges,
      graphPreset.maxNodes,
      graphPreset.maxRadius,
      graphView,
      labelScope,
      radius,
      recentSessions,
      savedExperiments,
      selectedCellId,
      selectedExample.id,
      selectedNode?.id,
      showCells,
      showEdgeLabels,
      showHigherCells,
      showNodeLabels,
      warnings,
    ],
  );
  const currentSessionSnapshot = useMemo(
    () => createProjectSessionSnapshot(currentProjectSession),
    [currentProjectSession],
  );
  const [savedSessionSnapshot, setSavedSessionSnapshot] =
    useState<ProjectSessionSnapshot>(() => currentSessionSnapshot);
  const [sessionBaselineReady, setSessionBaselineReady] = useState(false);
  const sessionDirty =
    sessionBaselineReady &&
    hasProjectSessionChanges(savedSessionSnapshot, currentSessionSnapshot);

  useEffect(() => {
    if (
      initialSessionBaselineRef.current ||
      desktopStatus === null ||
      generationPending ||
      workerGeneration.pending ||
      yGammaSceneState.pending
    ) {
      return;
    }
    initialSessionBaselineRef.current = true;
    setSavedSessionSnapshot(currentSessionSnapshot);
    setSessionBaselineReady(true);
  }, [
    currentSessionSnapshot,
    desktopStatus,
    generationPending,
    workerGeneration.pending,
    yGammaSceneState.pending,
  ]);

  useEffect(() => {
    if (!sessionDirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [sessionDirty]);

  const confirmSessionDiscard = useCallback(
    async (reason: string) => {
      const result = await desktopBridge.confirmDiscardUnsavedChanges({
        isDirty: sessionDirty,
        reason,
        sessionLabel: activeDataset.label,
      });
      if (result.message) {
        setDesktopMessage(result.message);
      }
      return result.confirmed;
    },
    [activeDataset.label, desktopBridge, sessionDirty],
  );

  useEffect(() => {
    if (!denseExample || denseAutoAppliedIds.current.has(activeDataset.id)) {
      return;
    }
    denseAutoAppliedIds.current.add(activeDataset.id);
    const timeoutId = window.setTimeout(() => {
      applyViewPreset("local-chamber");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeDataset.id, applyViewPreset, denseExample]);

  const handleExampleChange = async (nextId: string) => {
    if (nextId === selectedExample.id) {
      return;
    }
    setExampleId(nextId);
    setImportedDataset(null);
    setImportError(null);
    setSelectedNodeId("e");
    setRootNodeId("e");
    setSelectedCellId(undefined);
    setDisabledPairs(new Set());
    setDisabledHigherSubsets(new Set());
    setActiveGeneratorPairKey(undefined);
    setYGammaShowAllFaces(false);
    setYGammaRankThreeFocusEnabled(false);
    setYGammaFocusPreset("rank-three-cell");
    setYGammaPeelMode("same-rank-three");
    setYGammaCameraBookmark("rank-three-cell");
    setHoveredCellId(undefined);
  };

  const handleLoadEightFacetEntry = async (
    entry: (typeof tumarkinEightFacetCatalogue)[number],
  ) => {
    if (!entry.renderable || !entry.exampleFile) {
      setImportError(
        `${entry.label} is source-located but not available as a certified bundled example.`,
      );
      return;
    }

    try {
      const response = await fetch(`/examples/${entry.exampleFile}`);
      if (!response.ok) {
        throw new Error(`Could not load ${entry.exampleFile}.`);
      }
      const input = parseCoxeterSystemInput(await response.json());
      setImportedExample({
        id: entry.id,
        label: input.name,
        input,
      });
      setImportedDataset(null);
      setExampleId(entry.id);
      setImportError(null);
      resetSelectionForImport();
    } catch (error) {
      if (error instanceof CoxeterValidationError) {
        setImportError(error.errors.join(" "));
      } else if (error instanceof Error) {
        setImportError(error.message);
      } else {
        setImportError(String(error));
      }
    }
  };

  const resetSelectionForImport = () => {
    setSelectedNodeId("e");
    setRootNodeId("e");
    setSelectedCellId(undefined);
    setDisabledPairs(new Set());
    setDisabledHigherSubsets(new Set());
    setActiveGeneratorPairKey(undefined);
    setYGammaShowAllFaces(false);
    setYGammaRankThreeFocusEnabled(false);
    setYGammaFocusPreset("rank-three-cell");
    setYGammaPeelMode("same-rank-three");
    setYGammaCameraBookmark("rank-three-cell");
    setHoveredCellId(undefined);
  };

  const loadI25WorkflowSource = () => {
    setExampleId("I2_5");
    setImportedDataset(null);
    setImportedExample(null);
    setQuotientSubgroupText("");
    setQuotientMaxCosets(16);
    setImportError(null);
    resetSelectionForImport();
    applyViewPreset("local-chamber", { persist: false });
  };

  const loadI25WorkflowQuotient = () => {
    const quotient = parseQuotientComplex(I2_5IdentityQuotient);
    const selectedVertexId = quotient.vertices[0]?.id ?? "q0";
    setImportedDataset({
      kind: "quotient-complex",
      id: "quotient:i2-5-identity-demo",
      label: `${quotient.name} (workflow demo)`,
      quotient,
      ball: quotientToGeneratedBall(quotient),
      sourceSystem: quotient.sourceSystem,
    });
    setSelectedNodeId(selectedVertexId);
    setRootNodeId(selectedVertexId);
    setSelectedCellId(quotient.twoCells[0]?.id);
    setActiveGeneratorPairKey(
      quotient.twoCells[0]
        ? pairKey(quotient.twoCells[0].generatorPair)
        : "0-1",
    );
    setDisabledPairs(new Set());
    setDisabledHigherSubsets(new Set());
    setMode("shell");
    setGraphView("global");
    setShowCells(true);
    setShowNodeLabels(true);
    setShowEdgeLabels(true);
    setLabelScope("focused");
    setCellFocusMode("incident-selected");
    setCellNeighborhoodMode("chamber");
    setTopologyLens({ id: "full-local-link", selectedGenerator: 0 });
    setShowAdvancedPanels(false);
    setFocusSignal((value) => value + 1);
  };

  const loadA3RankThreeWorkflowView = () => {
    const a3System = bundledExamples.find(
      (example) => example.id === "A3",
    )?.input;
    if (!a3System) {
      return;
    }
    const quotient = baseOrbicomplexForSystem(a3System);
    setImportedDataset({
      kind: "quotient-complex",
      id: "base-orbicomplex:A3:workflow",
      label: `${quotient.name} (rank-three workflow)`,
      quotient,
      ball: quotientToGeneratedBall(quotient),
      sourceSystem: a3System,
    });
    setSelectedNodeId("*");
    setRootNodeId("*");
    setSelectedCellId(undefined);
    setMode("shell");
    setGraphView("global");
    setShowCells(true);
    setShowHigherCells(true);
    setShowNodeLabels(true);
    setShowEdgeLabels(true);
    setLabelScope("focused");
    setActiveGeneratorPairKey("1-2");
    setYGammaMainView("complex");
    setYGammaShowAllFaces(false);
    setYGammaRankThreeFocusEnabled(true);
    setYGammaFocusPreset("rank-three-cell");
    setYGammaPeelMode("same-rank-three");
    setYGammaTopologyMode(true);
    setYGammaCameraBookmark("rank-three-cell");
    setShowAdvancedPanels(false);
    setFocusSignal((value) => value + 1);
  };

  const runResearchWorkflowAction = (stepId = researchWorkflow.stepId) => {
    setResearchWorkflow((current) => ({ ...current, stepId }));
    if (stepId === "source-system") {
      loadI25WorkflowSource();
    } else if (stepId === "subgroup-cosets") {
      setQuotientSubgroupText("");
      setQuotientMaxCosets(16);
      setImportError(null);
      setShowAdvancedPanels(false);
    } else if (stepId === "quotient-complex") {
      loadI25WorkflowQuotient();
    } else if (stepId === "cocycle-game") {
      loadI25WorkflowQuotient();
      setTopologyLens({ id: "ascending-link", selectedGenerator: 0 });
    } else {
      saveExperimentRun();
    }
  };

  const moveResearchWorkflow = (delta: number) => {
    setResearchWorkflow((current) => moveResearchWorkflowStep(current, delta));
  };

  const applyTopologyLens = (lensId: TopologyLensId) => {
    setTopologyLens((current) => ({ ...current, id: lensId }));
    setShowNodeLabels(true);
    setShowEdgeLabels(true);
    setLabelScope("focused");

    if (lensId === "rank-three-spherical-cell") {
      loadA3RankThreeWorkflowView();
      return;
    }

    if (lensId === "generator-star" || lensId === "generator-family") {
      if (!activeIsYGammaBaseComplex) {
        openBaseOrbicomplex();
      }
      setYGammaFocusGenerator(topologyLens.selectedGenerator ?? 0);
      setYGammaPeelMode("adjacent-faces");
      setYGammaShowAllFaces(lensId === "generator-family");
      applyYGammaNarratedPreset("around-generator");
      return;
    }

    if (lensId === "edge-star" || lensId === "cells-incident-edge") {
      if (!activeIsYGammaBaseComplex) {
        openBaseOrbicomplex();
      }
      setYGammaPeelMode("adjacent-faces");
      setYGammaTopologyMode(true);
      setYGammaCameraBookmark("front");
      setYGammaFocusPreset("around-generator");
      return;
    }

    if (lensId === "cell-star") {
      setGraphView("on-graph");
      setShowCells(true);
      setCellFocusMode("selected-cell");
      setCellNeighborhoodMode("cell-plus-1");
      setCellRenderMode("in-graph");
      setLabelScope("focused");
      setFocusSignal((value) => value + 1);
      return;
    }

    if (lensId === "rank-k-family") {
      if ((topologyLens.selectedRank ?? 3) === 3) {
        loadA3RankThreeWorkflowView();
      } else {
        setShowHigherCells(true);
        setGraphView("on-graph");
        setCellFocusMode("all-local");
      }
      return;
    }

    if (isQuotientLinkLens(lensId)) {
      if (
        activeDataset.kind !== "quotient-complex" ||
        !activeDataset.quotient.game
      ) {
        loadI25WorkflowQuotient();
      }
      setMode("shell");
      setGraphView("global");
      setShowCells(lensId === "full-local-link");
      setCellFocusMode("incident-selected");
      setCellNeighborhoodMode("chamber");
      setFocusSignal((value) => value + 1);
    }
  };

  const setTopologyLensGenerator = (generator: number) => {
    setTopologyLens((current) => ({
      ...current,
      selectedGenerator: generator,
    }));
    setYGammaFocusGenerator(generator);
    if (
      topologyLens.id === "generator-star" ||
      topologyLens.id === "generator-family" ||
      topologyLens.id === "edge-star" ||
      topologyLens.id === "cells-incident-edge"
    ) {
      setYGammaPeelMode("adjacent-faces");
      setFocusSignal((value) => value + 1);
    }
  };

  const handleImportCoxeterFile = async (file: File | undefined) => {
    setImportError(null);
    if (!file) {
      return;
    }
    if (!(await confirmSessionDiscard("import another Coxeter system"))) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const input = parseCoxeterSystemInput(parsed);
      const id = `imported:${input.name}`;
      setImportedExample({ id, label: `${input.name} (imported)`, input });
      setImportedDataset(null);
      setExampleId(id);
      resetSelectionForImport();
    } catch (error) {
      if (error instanceof CoxeterValidationError) {
        setImportError(error.errors.join(" "));
      } else if (error instanceof Error) {
        setImportError(error.message);
      } else {
        setImportError(String(error));
      }
    }
  };

  const handleImportGeneratedFile = async (file: File | undefined) => {
    setImportError(null);
    if (!file) {
      return;
    }
    if (!(await confirmSessionDiscard("import another generated graph"))) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const ball = parseGeneratedCayleyBall(parsed);
      setImportedDataset({
        kind: "generated-graph",
        id: `generated:${ball.systemName}`,
        label: `${ball.systemName} (generated)`,
        ball,
      });
      resetSelectionForImport();
    } catch (error) {
      if (error instanceof GeneratedBallValidationError) {
        setImportError(error.errors.join(" "));
      } else if (error instanceof Error) {
        setImportError(error.message);
      } else {
        setImportError(String(error));
      }
    }
  };

  const handleImportQuotientFile = async (file: File | undefined) => {
    setImportError(null);
    if (!file) {
      return;
    }
    if (!(await confirmSessionDiscard("import another quotient"))) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const quotient = parseQuotientComplex(parsed);
      setImportedDataset({
        kind: "quotient-complex",
        id: `quotient:${quotient.name}`,
        label: `${quotient.name} (quotient)`,
        quotient,
        ball: quotientToGeneratedBall(quotient),
        sourceSystem: quotient.sourceSystem,
      });
      resetSelectionForImport();
    } catch (error) {
      if (error instanceof QuotientValidationError) {
        setImportError(error.errors.join(" "));
      } else if (error instanceof Error) {
        setImportError(error.message);
      } else {
        setImportError(String(error));
      }
    }
  };

  const requestNativeExport = useCallback(
    async (request: DesktopExportRequest): Promise<DesktopBridgeResult> => {
      const result = await desktopBridge.exportFile(request);
      if (result.fallbackDownload || !result.ok) {
        if (request.contentEncoding === "data-url") {
          downloadDataUrl(request.fileName, request.contents);
        } else {
          downloadText(request.fileName, request.contents);
        }
      }
      setDesktopMessage(
        result.ok
          ? `Saved ${request.fileName}${result.path ? ` to ${result.path}` : ""}.`
          : (result.message ?? `Downloaded ${request.fileName}.`),
      );
      return result;
    },
    [desktopBridge],
  );

  const applyProjectSessionState = useCallback(
    (session: ProjectSession) => {
      const exampleIdFromSession = session.dataset.activeExampleId;
      if (
        exampleIdFromSession &&
        examples.some((example) => example.id === exampleIdFromSession)
      ) {
        setExampleId(exampleIdFromSession);
        setImportedDataset(null);
      }
      setRadius(
        clampInteger(session.generation.radius, 0, graphPreset.maxRadius),
      );
      setBackendId(session.generation.backend);
      setMode(
        session.view.mode === "geometric-projection" ? "geometric" : "shell",
      );
      setGraphView(
        session.view.mode === "local-topology" ? "on-graph" : "global",
      );
      setLabelScope(
        session.view.labelScope === "none"
          ? "off"
          : session.view.labelScope === "all"
            ? "budgeted"
            : "focused",
      );
      setSelectedNodeId(session.view.selectedNodeId ?? "e");
      setSelectedCellId(session.view.selectedCellId);
      setActiveGeneratorPairKey(session.view.activeGeneratorPairKey);
      setShowCells(session.view.showRankTwoCells);
      setShowHigherCells(session.view.showHigherCells);
      setShowNodeLabels(session.view.showNodeLabels);
      setShowEdgeLabels(session.view.showEdgeLabels);
      setRecentSessions(session.files.recent);
      setSavedSessionSnapshot(createProjectSessionSnapshot(session));
      setSessionBaselineReady(true);
      setDesktopMessage(`Opened ${session.project.label}.`);
    },
    [examples, graphPreset.maxRadius],
  );

  const openNativeProjectSession = useCallback(async () => {
    if (!(await confirmSessionDiscard("open another session"))) {
      return;
    }
    const result = await desktopBridge.openProjectSession();
    if (!result.ok || !result.contents) {
      setDesktopMessage(result.message ?? "No project session was opened.");
      return;
    }
    const parsed = importProjectSession(
      result.contents,
      result.path ?? ".coxeter-session.json",
    );
    if (!parsed.ok) {
      setDesktopMessage(parsed.errors.map((issue) => issue.message).join(" "));
      return;
    }
    applyProjectSessionState(parsed.value);
  }, [applyProjectSessionState, confirmSessionDiscard, desktopBridge]);

  const chooseNativeWorkspace = useCallback(async () => {
    const status = await desktopBridge.pickWorkspace();
    setDesktopStatus(status);
    setDesktopMessage(
      status.message ?? `Workspace: ${status.workspace.label}.`,
    );
  }, [desktopBridge]);

  const refreshDesktopTools = useCallback(async () => {
    const tools = await desktopBridge.detectExternalTools();
    setDesktopTools(tools);
    setDesktopMessage(
      tools.length > 0
        ? `${tools.filter((tool) => tool.found).length}/${tools.length} optional tools detected.`
        : "External tool detection is available in the desktop app.",
    );
  }, [desktopBridge]);

  const startDesktopJob = useCallback(
    async (
      kind:
        | "detectTools"
        | "collectDiagnostics"
        | "validateWorkspace"
        | "backendComparison",
    ) => {
      const job = await desktopBridge.startDesktopJob({
        kind,
        workspacePath: desktopStatus?.workspace.rootPathHint,
      });
      setDesktopJobs((jobs) => [
        job,
        ...jobs.filter((item) => item.id !== job.id),
      ]);
      setDesktopMessage(`Desktop job ${job.id}: ${job.message}`);
    },
    [desktopBridge, desktopStatus?.workspace.rootPathHint],
  );

  const revealWorkspaceArtifacts = useCallback(async () => {
    const path = desktopStatus?.workspace.rootPathHint;
    if (!path) {
      setDesktopMessage(
        "Choose a research workspace before opening artifacts.",
      );
      return;
    }
    const result = await desktopBridge.revealPath(path);
    setDesktopMessage(
      result.message ??
        (result.ok
          ? "Opened workspace folder."
          : "Could not open workspace folder."),
    );
  }, [desktopBridge, desktopStatus?.workspace.rootPathHint]);

  const exportDesktopDiagnostics = useCallback(async () => {
    const result = await desktopBridge.exportDiagnosticBundle(
      desktopStatus?.workspace.rootPathHint,
    );
    if (!result.ok && result.fallbackDownload) {
      downloadText(
        "coxeter-viewer-diagnostics.json",
        JSON.stringify(
          {
            schemaVersion: 1,
            kind: "coxeter-viewer-browser-diagnostics",
            createdAt: new Date().toISOString(),
            runtime: desktopStatus?.runtime ?? "browser",
            sceneStats,
            warnings,
          },
          null,
          2,
        ),
      );
    }
    setDesktopMessage(
      result.ok
        ? `Diagnostic bundle written${result.path ? ` to ${result.path}` : ""}.`
        : (result.message ?? "Downloaded browser diagnostic bundle."),
    );
  }, [
    desktopBridge,
    desktopStatus?.runtime,
    desktopStatus?.workspace.rootPathHint,
    sceneStats,
    warnings,
  ]);

  const exportQuotientBuildRequest = () => {
    setQuotientBuilderError(null);
    const result = createQuotientBuildInput({
      sourceSystem: system,
      subgroupText: quotientSubgroupText,
      maxCosets: quotientMaxCosets,
      subgroupName: quotientSubgroupText.trim()
        ? "browser subgroup"
        : "identity subgroup",
      requestedBackend: "sage",
      includeGamePreset: system.name === "I2(5)" ? "i2-5-height" : "zero",
      notes: [
        "Build request exported by the browser UI. External Sage/GAP scripts must enumerate and certify the quotient action.",
      ],
    });
    if (result.errors.length > 0 || !result.request) {
      setQuotientBuilderError(result.errors.join(" "));
      return;
    }
    void requestNativeExport({
      kind: "quotient-build-request",
      fileName: `${system.name.replace(/\W+/g, "_")}_quotient-build-request.json`,
      contents: JSON.stringify(result.request, null, 2),
      mediaType: "application/json",
    });
  };

  const openBaseOrbicomplex = () => {
    const quotient = baseOrbicomplexForSystem(system);
    const defaultPairKey = firstFinitePairKey(system);
    const startInRankThreeFocus = yGammaRankThreeFocus !== undefined;
    setImportedDataset({
      kind: "quotient-complex",
      id: `base-orbicomplex:${activeDataset.id}`,
      label: `${quotient.name} (one-vertex complex)`,
      quotient,
      ball: quotientToGeneratedBall(quotient),
      sourceSystem: system,
    });
    setSelectedNodeId("*");
    setRootNodeId("*");
    setSelectedCellId(undefined);
    setDisabledPairs(new Set());
    setDisabledHigherSubsets(new Set());
    setActiveGeneratorPairKey(
      startInRankThreeFocus ? yGammaRankThreeFocus.pairKeys[1] : defaultPairKey,
    );
    setYGammaShowAllFaces(false);
    setYGammaRankThreeFocusEnabled(startInRankThreeFocus);
    setYGammaFocusPreset(
      startInRankThreeFocus ? "rank-three-cell" : "one-relation",
    );
    setYGammaPeelMode(
      startInRankThreeFocus ? "same-rank-three" : "selected-face",
    );
    setYGammaTopologyMode(true);
    setYGammaCameraBookmark("rank-three-cell");
    setHoveredCellId(undefined);
    setMode("shell");
    setGraphView("global");
    setLocalDepth(1);
    setActivePreset("rank-two-cells");
    setCellRenderMode("in-graph");
    setCellFocusMode("all-local");
    setCellNeighborhoodMode("chamber");
    setRelationWalkMode("numbered");
    setOcclusionMode("x-ray");
    setLabelScope("focused");
    setShowCells(true);
    setShowHigherCells(true);
    setYGammaMainView("complex");
    setFocusSignal((value) => value + 1);
  };

  const focusPairByKey = (key: string) => {
    setYGammaRankThreeFocusEnabled(false);
    if (activeIsYGammaBaseComplex) {
      setYGammaMainView("complex");
      setYGammaFocusPreset("one-relation");
      setYGammaPeelMode("selected-face");
      setYGammaCameraBookmark("front");
      setYGammaTopologyMode(true);
      setHoveredCellId(undefined);
      setShowHigherCells(false);
    }
    setActiveGeneratorPairKey(key);
    setGraphView("on-graph");
    setShowCells(true);
    setShowNodeLabels(true);
    setShowEdgeLabels(true);
    setLabelScope("focused");
    setCellRenderMode("in-graph");
    setCellFocusMode("selected-cell");
    setCellNeighborhoodMode("cell-boundary");
    setRelationWalkMode("numbered");
    setOcclusionMode("fade-far");
    setDisabledPairs((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    const representative = chooseFocusedRankTwoCell({
      cells: ball?.twoCells ?? [],
      selectedCell: undefined,
      activePairKey: key,
      selectedNodeId: selectedNode?.id,
    });
    setSelectedCellId(representative?.id);
    setFocusSignal((value) => value + 1);
  };

  const focusRankThreeM2M3Demo = (pairKeyToView?: string) => {
    if (!yGammaRankThreeFocus) {
      return;
    }
    setYGammaMainView("complex");
    setShowHigherCells(true);
    setYGammaShowAllFaces(false);
    setYGammaRankThreeFocusEnabled(true);
    setYGammaFocusPreset("rank-three-cell");
    setYGammaPeelMode("same-rank-three");
    setYGammaTopologyMode(true);
    setActiveGeneratorPairKey(
      pairKeyToView ?? yGammaRankThreeFocus.pairKeys[1],
    );
    setYGammaCameraBookmark(
      pairKeyToView === yGammaRankThreeFocus.pairKeys[0]
        ? "square-family"
        : pairKeyToView === yGammaRankThreeFocus.pairKeys[1]
          ? "hexagon-family"
          : "rank-three-cell",
    );
    setShowCells(true);
    setShowNodeLabels(true);
    setShowEdgeLabels(true);
    setLabelScope("focused");
    setCellRenderMode("in-graph");
    setOcclusionMode("x-ray");
    setFocusSignal((value) => value + 1);
  };

  const togglePairByKey = (key: string) => {
    setYGammaRankThreeFocusEnabled(false);
    setYGammaFocusPreset("one-relation");
    setActiveGeneratorPairKey(key);
    setDisabledPairs((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAllRankTwoPairs = (enabled: boolean) => {
    setYGammaRankThreeFocusEnabled(false);
    setYGammaFocusPreset(enabled ? "full-skeleton" : "one-relation");
    setDisabledPairs(
      enabled ? new Set() : new Set(pairOptions.map((option) => option.key)),
    );
  };

  const showOnlyM3Pairs = () => {
    setYGammaRankThreeFocusEnabled(false);
    setYGammaFocusPreset("m3-hexagons");
    setYGammaCameraBookmark("hexagon-family");
    setShowCells(true);
    setDisabledPairs(
      new Set(
        pairOptions
          .filter((option) => option.m !== 3)
          .map((option) => option.key),
      ),
    );
    setCellFocusMode("all-local");
    setCellNeighborhoodMode("chamber");
  };

  const showOnlyActivePair = () => {
    setYGammaRankThreeFocusEnabled(false);
    setYGammaFocusPreset("one-relation");
    if (!activeGeneratorPairKey) {
      return;
    }
    setDisabledPairs(
      new Set(
        pairOptions
          .filter((option) => option.key !== activeGeneratorPairKey)
          .map((option) => option.key),
      ),
    );
    focusPairByKey(activeGeneratorPairKey);
  };

  const applyYGammaNarratedPreset = (preset: YGammaFocusPreset) => {
    if (!yGammaAtlas) {
      return;
    }
    const firstPair = yGammaAtlas.rankTwoCells[0];
    const firstM2 = yGammaAtlas.rankTwoCells.find((cell) => cell.m === 2);
    const firstM3 = yGammaAtlas.rankTwoCells.find((cell) => cell.m === 3);
    setYGammaMainView("complex");
    setYGammaFocusPreset(preset);
    setShowCells(true);
    setShowEdgeLabels(true);
    setShowNodeLabels(true);
    setLabelScope("focused");
    setHoveredCellId(undefined);

    if (preset === "one-relation") {
      const key =
        activeGeneratorPairKey ??
        (firstPair ? relationCellPairKey(firstPair.generators) : undefined);
      if (key) {
        setActiveGeneratorPairKey(key);
      }
      setYGammaRankThreeFocusEnabled(false);
      setYGammaShowAllFaces(false);
      setYGammaPeelMode("selected-face");
      setYGammaTopologyMode(true);
      setYGammaCameraBookmark("front");
    } else if (preset === "rank-three-cell") {
      setYGammaRankThreeFocusEnabled(Boolean(yGammaRankThreeFocus));
      setYGammaShowAllFaces(false);
      setYGammaPeelMode("same-rank-three");
      setYGammaTopologyMode(true);
      setYGammaCameraBookmark("rank-three-cell");
      if (yGammaRankThreeFocus && !activeGeneratorPairKey) {
        setActiveGeneratorPairKey(yGammaRankThreeFocus.pairKeys[1]);
      }
    } else if (preset === "around-generator") {
      setYGammaRankThreeFocusEnabled(false);
      setYGammaShowAllFaces(true);
      setYGammaPeelMode("all");
      setYGammaTopologyMode(true);
      setYGammaCameraBookmark("front");
      setActiveGeneratorPairKey(undefined);
    } else if (preset === "m2-squares") {
      if (firstM2) {
        setActiveGeneratorPairKey(relationCellPairKey(firstM2.generators));
      }
      setYGammaRankThreeFocusEnabled(Boolean(yGammaRankThreeFocus));
      setYGammaPeelMode("all");
      setYGammaTopologyMode(true);
      setYGammaCameraBookmark("square-family");
    } else if (preset === "m3-hexagons") {
      if (firstM3) {
        setActiveGeneratorPairKey(relationCellPairKey(firstM3.generators));
      }
      setYGammaRankThreeFocusEnabled(Boolean(yGammaRankThreeFocus));
      setYGammaPeelMode("all");
      setYGammaTopologyMode(true);
      setYGammaCameraBookmark("hexagon-family");
    } else {
      setYGammaRankThreeFocusEnabled(false);
      setYGammaShowAllFaces(true);
      setYGammaPeelMode("all");
      setYGammaTopologyMode(false);
      setActiveGeneratorPairKey(undefined);
      setYGammaCameraBookmark("front");
    }
    setFocusSignal((value) => value + 1);
  };

  const snapYGammaCamera = (bookmark: YGammaCameraBookmark) => {
    setYGammaCameraBookmark(bookmark);
    if (bookmark === "square-family" && yGammaRankThreeFocus?.pairKeys[0]) {
      setActiveGeneratorPairKey(yGammaRankThreeFocus.pairKeys[0]);
    }
    if (bookmark === "hexagon-family" && yGammaRankThreeFocus?.pairKeys[1]) {
      setActiveGeneratorPairKey(yGammaRankThreeFocus.pairKeys[1]);
    }
    setFocusSignal((value) => value + 1);
  };

  const applyGuidedInspectionPreset = (id: GuidedInspectionId) => {
    const firstPair = pairOptions[0]?.key ?? firstFinitePairKey(system);
    setShowNodeLabels(true);
    setShowEdgeLabels(true);
    setShowCells(true);
    setRelationWalkMode("numbered");

    if (id === "one-relation" || id === "find-a-hexagon") {
      setMode("shell");
      setGraphView("on-graph");
      setLocalDepth(2);
      setCellFocusMode("selected-cell");
      setCellNeighborhoodMode("cell-boundary");
      setOcclusionMode("fade-far");
      setLabelScope("focused");
      if (firstPair) {
        focusPairByKey(firstPair);
      }
      return;
    }

    if (id === "local-link") {
      setMode("shell");
      setGraphView("on-graph");
      setLocalDepth(1);
      setCellFocusMode("incident-selected");
      setCellNeighborhoodMode("chamber");
      setOcclusionMode("hide-far");
      setLabelScope("focused");
      setShowAdvancedPanels(false);
      setFocusSignal((value) => value + 1);
      return;
    }

    if (id === "rank-three-cell" || id === "understand-rank-three-cell") {
      if (!activeIsYGammaBaseComplex) {
        openBaseOrbicomplex();
      }
      applyYGammaNarratedPreset("rank-three-cell");
      setShowAdvancedPanels(false);
      return;
    }

    if (id === "ygamma-2-skeleton" || id === "inspect-ygamma") {
      if (!activeIsYGammaBaseComplex) {
        openBaseOrbicomplex();
      }
      applyYGammaNarratedPreset("full-skeleton");
      setShowAdvancedPanels(false);
      return;
    }

    if (id === "quotient-game" || id === "quotient-game-experiment") {
      loadI25WorkflowQuotient();
      setTopologyLens({ id: "ascending-link", selectedGenerator: 0 });
      setShowAdvancedPanels(true);
      return;
    }

    if (
      !activeIsYGammaBaseComplex &&
      activeDataset.kind !== "quotient-complex"
    ) {
      openBaseOrbicomplex();
    }
    setShowAdvancedPanels(true);
    setYGammaMainView("complex");
    setYGammaFocusPreset("one-relation");
    setYGammaTopologyMode(true);
    setLabelScope("focused");
  };

  const startGuidedInspection = (id: GuidedInspectionId) => {
    setGuidedInspection({ id, stepIndex: 0 });
    applyGuidedInspectionPreset(id);
  };

  const moveGuidedInspection = (delta: number) => {
    setGuidedInspection((current) =>
      current ? moveGuidedInspectionStep(current, delta) : current,
    );
  };

  const runGalleryAction = (entryId: string) => {
    if (entryId === "walkthrough:hexagon") {
      startGuidedInspection("find-a-hexagon");
      return;
    }
    if (entryId === "walkthrough:rank-three") {
      startGuidedInspection("understand-rank-three-cell");
      return;
    }
    if (entryId === "quotient:i2-5") {
      loadI25WorkflowQuotient();
      setUiMode("research");
      return;
    }
    if (entryId === "compact:5-cube") {
      void handleExampleChange("compact_5_cube_gamma1");
      setActivePreset("local-chamber");
      setGraphView("on-graph");
      setGraphPresetId("research");
      setLabelScope("focused");
      return;
    }
    if (entryId === "compact:5-prism") {
      void handleExampleChange("compact_5_prism_makarov");
      setActivePreset("local-chamber");
      setGraphView("on-graph");
      setGraphPresetId("research");
      setLabelScope("focused");
      return;
    }
    if (entryId === "compact:5-polytope-p1") {
      void handleExampleChange("compact_5_polytope_p1_double_makarov");
      setActivePreset("local-chamber");
      setGraphView("on-graph");
      setGraphPresetId("research");
      setLabelScope("focused");
      return;
    }
    if (entryId === "compact:5-prism-p2") {
      void handleExampleChange("compact_5_prism_makarov_p2");
      setActivePreset("local-chamber");
      setGraphView("on-graph");
      setGraphPresetId("research");
      setLabelScope("focused");
      return;
    }
    if (entryId.startsWith("catalogue:8facet:")) {
      const requestedIndex = entryId.split(":").at(-1);
      setUiMode("research");
      setShowAdvancedPanels(true);
      setEightFacetCatalogueOpen(true);
      setEightFacetCatalogueFilter("all");
      setEightFacetCatalogueQuery(
        requestedIndex && requestedIndex !== "all" ? requestedIndex : "",
      );
      setDesktopMessage(
        "Tumarkin Table 4.10 entries are certified examples. Use Load example in the catalogue to open one without cluttering the main gallery.",
      );
    }
  };

  const stepByGenerator = (generator: number) => {
    const step = generatorSteps.find((entry) => entry.generator === generator);
    if (!step?.targetNodeId) {
      return;
    }
    setSelectedNodeId(step.targetNodeId);
    setSelectedCellId(undefined);
    setCellFocusMode("incident-selected");
    setCellNeighborhoodMode("chamber");
    if (graphView !== "on-graph") {
      setGraphView("on-graph");
    }
  };

  const handleSceneSelectNode = useCallback(
    (nodeId: string) => {
      if (showingYGammaComplex) {
        return;
      }
      setSelectedNodeId(nodeId);
      setSelectedCellId(undefined);
      setCellFocusMode("incident-selected");
      setCellNeighborhoodMode("chamber");
    },
    [showingYGammaComplex],
  );

  const handleSceneSelectCell = useCallback(
    (cellId: string) => {
      setSelectedCellId(cellId);
      const cell = ballIndexes.twoCellsById.get(cellId);
      if (cell) {
        setActiveGeneratorPairKey(pairKey(cell.generatorPair));
        setCellFocusMode("selected-cell");
        setCellNeighborhoodMode("cell-boundary");
        setRelationWalkMode("numbered");
        setGraphView("on-graph");
        setShowCells(true);
        setLabelScope("focused");
        setFocusSignal((value) => value + 1);
      }
    },
    [ballIndexes.twoCellsById],
  );

  const toggleHigherSubset = (subsetId: string, enabled: boolean) => {
    setDisabledHigherSubsets((current) => {
      const next = new Set(current);
      if (enabled) {
        next.delete(subsetId);
      } else {
        next.add(subsetId);
      }
      return next;
    });
  };

  const exportGraph = useCallback(() => {
    if (!ball) {
      return;
    }
    void requestNativeExport({
      kind: "graph-json",
      fileName: `${system.name.replace(/\W+/g, "_")}_radius_${ball.metadata.radius}.json`,
      contents: JSON.stringify(ball, null, 2),
      mediaType: "application/json",
    });
  }, [ball, requestNativeExport, system.name]);

  const exportLocalNeighborhood = useCallback(() => {
    const payload = buildLocalNeighborhoodExport({
      datasetId: activeDataset.id,
      datasetLabel: activeDataset.label,
      system,
      ball: ball ?? undefined,
      selectedNode,
      visibleNodes: viewNodes,
      visibleEdges: viewEdges,
      visibleCells,
      activePreset,
      graphView,
      localDepth,
      mode: effectiveMode,
      projection,
      labelScope,
      layout: localViewLayout,
      cellRenderMode,
      cellFocusMode,
      cellNeighborhoodMode,
      relationWalkMode,
      occlusionMode,
      disabledPairs,
      activeGeneratorPairKey,
      warnings,
    });
    void requestNativeExport({
      kind: "local-neighborhood",
      fileName: `${system.name.replace(/\W+/g, "_")}_${selectedNode?.id ?? "none"}_local.json`,
      contents: JSON.stringify(payload, null, 2),
      mediaType: "application/json",
    });
  }, [
    activeDataset.id,
    activeDataset.label,
    activeGeneratorPairKey,
    activePreset,
    ball,
    cellFocusMode,
    cellNeighborhoodMode,
    cellRenderMode,
    disabledPairs,
    effectiveMode,
    graphView,
    labelScope,
    localDepth,
    localViewLayout,
    occlusionMode,
    projection,
    relationWalkMode,
    requestNativeExport,
    selectedNode,
    system,
    viewEdges,
    viewNodes,
    visibleCells,
    warnings,
  ]);

  const handleCapturePngReady = useCallback(
    (capture: (() => Promise<string>) | undefined) => {
      captureScenePngRef.current = capture;
    },
    [],
  );

  const captureScenePng = useCallback(async () => {
    const rendererCapture = captureScenePngRef.current;
    if (rendererCapture) {
      return rendererCapture();
    }
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".scene-canvas canvas",
    );
    return canvas?.toDataURL("image/png");
  }, []);

  const exportScreenshot = useCallback(async () => {
    const png = await captureScenePng();
    if (!png) {
      return;
    }
    await requestNativeExport({
      kind: "screenshot",
      fileName: `${system.name.replace(/\W+/g, "_")}_scene.png`,
      contents: png,
      mediaType: "image/png",
      contentEncoding: "data-url",
    });
  }, [captureScenePng, requestNativeExport, system.name]);

  const exportViewBundle = useCallback(async () => {
    await exportScreenshot();
    const payload = {
      schemaVersion: 1,
      kind: "coxeter-view-sidecar",
      dataset: {
        id: activeDataset.id,
        label: activeDataset.label,
        systemName: system.name,
      },
      selectedNodeId: selectedNode?.id,
      selectedWord: selectedNode
        ? {
            generators: selectedNode.word,
            compactLabel: compactWordLabel(
              selectedNode.word,
              system.generators,
            ),
          }
        : undefined,
      filters: {
        disabledGeneratorPairs: [...disabledPairs].sort(),
        activeGeneratorPair: activeGeneratorPairKey,
      },
      view: {
        uiMode,
        preset: activePreset,
        comparisonMode: viewComparisonMode,
        mode: effectiveMode,
        graphView,
        localDepth,
        projection,
        labelScope,
        layout: localViewLayout,
        cellRenderMode,
        cellFocusMode,
        cellNeighborhoodMode,
        relationWalkMode,
        occlusionMode,
      },
      annotations,
      cameraBookmarks,
      sceneStats,
      warnings: [...new Set(warnings)].sort(),
    };
    void requestNativeExport({
      kind: "view-bundle",
      fileName: `${system.name.replace(/\W+/g, "_")}_${selectedNode?.id ?? "none"}.view.json`,
      contents: JSON.stringify(payload, null, 2),
      mediaType: "application/json",
    });
  }, [
    activeDataset.id,
    activeDataset.label,
    activeGeneratorPairKey,
    activePreset,
    annotations,
    cameraBookmarks,
    cellFocusMode,
    cellNeighborhoodMode,
    cellRenderMode,
    disabledPairs,
    effectiveMode,
    exportScreenshot,
    graphView,
    uiMode,
    labelScope,
    localDepth,
    localViewLayout,
    occlusionMode,
    projection,
    relationWalkMode,
    requestNativeExport,
    sceneStats,
    selectedNode,
    system,
    warnings,
    viewComparisonMode,
  ]);

  const addAnnotation = useCallback(() => {
    const body = annotationDraft.trim();
    if (!body) {
      return;
    }
    const targetKind = selectedCellId
      ? "cell"
      : selectedNode?.id
        ? "node"
        : "view";
    const targetId = selectedCellId ?? selectedNode?.id;
    const annotation = createAnnotation({
      label:
        targetId !== undefined
          ? `Note on ${targetId}`
          : `${activeDataset.label} view note`,
      body,
      targetKind,
      targetId,
    });
    setAnnotations((current) => [annotation, ...current].slice(0, 24));
    setAnnotationDraft("");
  }, [activeDataset.label, annotationDraft, selectedCellId, selectedNode?.id]);

  const saveCameraBookmark = useCallback(() => {
    const bookmark = createCameraBookmark({
      label: bookmarkDraft || `${activePreset} ${topologyLens.id}`,
      preset: activePreset,
      topologyLensId: topologyLens.id,
      selectedNodeId: selectedNode?.id,
      selectedCellId,
      activeGeneratorPairKey,
      yGammaCameraBookmark,
    });
    setCameraBookmarks((current) => [bookmark, ...current].slice(0, 24));
    setBookmarkDraft("");
  }, [
    activeGeneratorPairKey,
    activePreset,
    bookmarkDraft,
    selectedCellId,
    selectedNode?.id,
    topologyLens.id,
    yGammaCameraBookmark,
  ]);

  const applyCameraBookmark = useCallback((bookmark: CameraBookmark) => {
    setActivePreset(bookmark.preset);
    setTopologyLens((current) => ({
      ...current,
      id: bookmark.topologyLensId,
    }));
    if (bookmark.selectedNodeId) {
      setSelectedNodeId(bookmark.selectedNodeId);
    }
    setSelectedCellId(bookmark.selectedCellId);
    setActiveGeneratorPairKey(bookmark.activeGeneratorPairKey);
    if (bookmark.yGammaCameraBookmark) {
      setYGammaCameraBookmark(
        bookmark.yGammaCameraBookmark as YGammaCameraBookmark,
      );
    }
    setFocusSignal((value) => value + 1);
  }, []);

  const exportFigureBundle = useCallback(async () => {
    const screenshot = await captureScenePng();
    const payload: FigureExportBundle = {
      schemaVersion: 1,
      kind: "coxeter-figure-export",
      createdAt: "1970-01-01T00:00:00.000Z",
      dataset: {
        id: activeDataset.id,
        label: activeDataset.label,
      },
      view: {
        uiMode,
        preset: activePreset,
        comparisonMode: viewComparisonMode,
        topologyLensId: topologyLens.id,
      },
      selected: {
        nodeId: selectedNode?.id,
        cellId: selectedCellId,
        generatorPairKey: activeGeneratorPairKey,
      },
      annotations,
      bookmarks: cameraBookmarks,
      screenshot: screenshot
        ? { mimeType: "image/png" as const, dataUrl: screenshot }
        : undefined,
    };
    void requestNativeExport({
      kind: "figure-bundle",
      fileName: `${system.name.replace(/\W+/g, "_")}_figure.coxeter-figure.json`,
      contents: JSON.stringify(payload, null, 2),
      mediaType: "application/json",
    });
  }, [
    activeDataset.id,
    activeDataset.label,
    activeGeneratorPairKey,
    activePreset,
    annotations,
    cameraBookmarks,
    captureScenePng,
    requestNativeExport,
    selectedCellId,
    selectedNode?.id,
    system.name,
    topologyLens.id,
    uiMode,
    viewComparisonMode,
  ]);

  const exportProjectSession = useCallback(async () => {
    const exported = createProjectSessionExport(currentProjectSession);
    const nativeResult = await desktopBridge.saveProjectSession(
      currentProjectSession,
    );
    if (nativeResult.fallbackDownload || !nativeResult.ok) {
      downloadText(exported.fileName, exported.contents);
    }
    const recent = upsertRecentProjectSession(recentSessions, {
      id: `session:${nativeResult.path ?? exported.fileName}`,
      label: currentProjectSession.project.label,
      path: nativeResult.path,
      lastOpenedAt: new Date().toISOString(),
    });
    const savedSession = {
      ...currentProjectSession,
      files: { recent },
    };
    setRecentSessions(recent);
    setSavedSessionSnapshot(createProjectSessionSnapshot(savedSession));
    setSessionBaselineReady(true);
    setDesktopMessage(
      nativeResult.ok
        ? `Saved ${exported.fileName}${nativeResult.path ? ` to ${nativeResult.path}` : ""}.`
        : (nativeResult.message ?? `Downloaded ${exported.fileName}.`),
    );
  }, [currentProjectSession, desktopBridge, recentSessions]);

  const exportProjectSessionAs = useCallback(async () => {
    const exported = createProjectSessionExport(currentProjectSession);
    const nativeResult = await desktopBridge.saveProjectSession(
      currentProjectSession,
      { saveAs: true },
    );
    if (nativeResult.fallbackDownload || !nativeResult.ok) {
      downloadText(exported.fileName, exported.contents);
    }
    if (nativeResult.ok) {
      const recent = upsertRecentProjectSession(recentSessions, {
        id: `session:${nativeResult.path ?? exported.fileName}`,
        label: currentProjectSession.project.label,
        path: nativeResult.path,
        lastOpenedAt: new Date().toISOString(),
      });
      setRecentSessions(recent);
      setSavedSessionSnapshot(
        createProjectSessionSnapshot(currentProjectSession),
      );
      setSessionBaselineReady(true);
    }
    setDesktopMessage(
      nativeResult.ok
        ? `Saved ${exported.fileName}${nativeResult.path ? ` to ${nativeResult.path}` : ""}.`
        : (nativeResult.message ?? `Downloaded ${exported.fileName}.`),
    );
  }, [currentProjectSession, desktopBridge, recentSessions]);

  const currentExperimentBundle = useCallback(
    (options: { screenshot?: string } = {}) => {
      const screenshot = options.screenshot;
      return createExperimentBundle({
        label: `${activeDataset.label} local chamber experiment`,
        createdAt: "1970-01-01T00:00:00.000Z",
        runs: [
          {
            label: `${system.name} radius ${ball?.metadata.radius ?? "?"}`,
            dataset: {
              id: activeDataset.id,
              label: activeDataset.label,
              systemName: system.name,
              dataStatus: system.dataStatus,
              sourceRefs: system.sourceRefs?.map((source) => source.id) ?? [],
              certificateStatus: system.certificate
                ? {
                    status: system.certificate.status,
                    backend: system.certificate.backend,
                    scopes: system.certificate.scopes ?? [],
                    inputHash: system.certificate.inputHash,
                    outputHash: system.certificate.outputHash,
                  }
                : undefined,
            },
            view: {
              uiMode,
              comparisonMode: viewComparisonMode,
              preset: activePreset,
              workflow: {
                id: researchWorkflow.id,
                stepId: researchWorkflow.stepId,
                stepTitle: activeResearchWorkflowStep(researchWorkflow).title,
                topologyLensId: topologyLens.id,
              },
              guide: guidedInspection
                ? {
                    id: guidedInspection.id,
                    stepIndex: guidedInspection.stepIndex,
                    stepTitle:
                      activeGuidedInspectionStep(guidedInspection)?.title,
                  }
                : undefined,
              graphView,
              localDepth,
              mode: effectiveMode,
              projection,
              labelScope,
              layout: localViewLayout,
              cellRenderMode,
              cellFocusMode,
              cellNeighborhoodMode,
              relationWalkMode,
              occlusionMode,
              activeGeneratorPair: activeGeneratorPairKey,
              disabledGeneratorPairs: [...disabledPairs].sort(),
              annotations,
              cameraBookmarks,
            },
            render: {
              sceneStats,
              cellOpacity,
              panelOffsetStrength,
              bringFocusedCellsForward,
              screenshot,
            },
            topology: {
              diagnostics: topologyDiagnostics,
              lens: topologyLens,
              quotient: activeQuotient
                ? {
                    name: activeQuotient.name,
                    activeCocycleId: activeQuotient.game?.activeCocycleId,
                    verifierStatus: activeQuotient.verifier?.status,
                    artifactHash: activeQuotient.verifier?.outputHash,
                  }
                : undefined,
            },
            ball: ball ?? undefined,
            warnings,
            notes: experimentNote.trim()
              ? [
                  {
                    level: "info",
                    message: experimentNote.trim(),
                    source: "user-note",
                  },
                ]
              : [],
          },
        ],
      });
    },
    [
      activeDataset.id,
      activeDataset.label,
      activeGeneratorPairKey,
      activePreset,
      activeQuotient,
      annotations,
      ball,
      bringFocusedCellsForward,
      cameraBookmarks,
      cellFocusMode,
      cellNeighborhoodMode,
      cellOpacity,
      cellRenderMode,
      disabledPairs,
      effectiveMode,
      experimentNote,
      graphView,
      guidedInspection,
      labelScope,
      localDepth,
      localViewLayout,
      occlusionMode,
      panelOffsetStrength,
      projection,
      relationWalkMode,
      researchWorkflow,
      sceneStats,
      system,
      topologyLens,
      topologyDiagnostics,
      uiMode,
      warnings,
      viewComparisonMode,
    ],
  );

  const saveExperimentRun = useCallback(() => {
    const bundle = currentExperimentBundle();
    setSavedExperiments((current) => {
      const next = [bundle, ...current].slice(0, 24);
      void writeNotebookBundles(next);
      return next;
    });
  }, [currentExperimentBundle]);

  const duplicateLatestExperimentRun = useCallback(() => {
    setSavedExperiments((current) => {
      const latest = current[0];
      if (!latest) {
        return current;
      }
      const next = [duplicateNotebookBundle(latest), ...current].slice(0, 24);
      void writeNotebookBundles(next);
      return next;
    });
  }, []);

  const importExperimentNotebook = useCallback(
    async (file: File | undefined) => {
      setNotebookImportError(null);
      if (!file) {
        return;
      }
      try {
        const parsed = JSON.parse(await file.text()) as unknown;
        const imported = parseNotebookBundles(parsed);
        setSavedExperiments((current) => {
          const next = [...imported, ...current].slice(0, 24);
          void writeNotebookBundles(next);
          return next;
        });
      } catch (error) {
        setNotebookImportError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [],
  );

  const exportExperimentBundle = useCallback(async () => {
    const screenshot = await captureScenePng();
    const bundle = currentExperimentBundle({ screenshot });
    await requestNativeExport({
      kind: "experiment-bundle",
      fileName: `${system.name.replace(/\W+/g, "_")}_${selectedNode?.id ?? "none"}.coxeter-experiment.json`,
      contents: JSON.stringify(bundle, null, 2),
      mediaType: "application/json",
    });
  }, [
    captureScenePng,
    currentExperimentBundle,
    requestNativeExport,
    selectedNode?.id,
    system.name,
  ]);

  const handleDesktopMenuCommand = async (command: DesktopMenuCommand) => {
    switch (command) {
      case "new-session":
        if (await confirmSessionDiscard("start a new session")) {
          setExampleId(bundledExamples[0].id);
          setImportedDataset(null);
          setImportedExample(null);
          setSelectedNodeId("e");
          setRootNodeId("e");
          setSelectedCellId(undefined);
          setAnnotations([]);
          setDesktopMessage("Started a new session.");
        }
        break;
      case "open-session":
        await openNativeProjectSession();
        break;
      case "save-session":
        await exportProjectSession();
        break;
      case "save-session-as":
        await exportProjectSessionAs();
        break;
      case "choose-workspace":
        await chooseNativeWorkspace();
        break;
      case "reveal-workspace":
        await revealWorkspaceArtifacts();
        break;
      case "export-graph":
        exportGraph();
        break;
      case "export-screenshot":
        await exportScreenshot();
        break;
      case "export-figure-bundle":
        await exportFigureBundle();
        break;
      case "export-experiment-bundle":
        await exportExperimentBundle();
        break;
      case "export-diagnostics":
        await exportDesktopDiagnostics();
        break;
      case "check-tools":
        await refreshDesktopTools();
        await startDesktopJob("detectTools");
        break;
      case "show-logs":
        setDesktopMessage(
          "Use Export Diagnostic Bundle to collect local logs.",
        );
        break;
      case "reset-view":
        setResetSignal((value) => value + 1);
        break;
      case "teaching-mode":
        setUiMode("teaching");
        setShowAdvancedPanels(false);
        break;
      case "research-mode":
        setUiMode("research");
        break;
      case "toggle-labels":
        setShowNodeLabels((value) => !value);
        setShowEdgeLabels((value) => !value);
        break;
      case "toggle-cells":
        setShowCells((value) => !value);
        break;
      case "fullscreen":
        {
          const result = await desktopBridge.toggleFullscreen();
          scheduleSceneLayoutRefresh();
          if (result.message) {
            setDesktopMessage(result.message);
          }
        }
        break;
      case "guide-hexagon":
        startGuidedInspection("find-a-hexagon");
        break;
      case "guide-rank-three":
        startGuidedInspection("understand-rank-three-cell");
        break;
      case "guide-y-gamma":
        startGuidedInspection("inspect-ygamma");
        break;
      case "guide-quotient-game":
        startGuidedInspection("quotient-game-experiment");
        break;
      case "lens-generator-star":
        applyTopologyLens("generator-star");
        break;
      case "lens-edge-star":
        applyTopologyLens("edge-star");
        break;
      case "lens-rank-k-family":
        applyTopologyLens("rank-k-family");
        break;
      case "help-readme":
        setDesktopMessage("README is bundled in the repository root.");
        break;
      case "help-walkthroughs":
        setDesktopMessage(
          "Walkthroughs are documented in docs/walkthroughs.md.",
        );
        break;
      case "help-about":
        setDesktopMessage("CoxeterViewer5D 0.1.0 desktop research viewer.");
        break;
    }
  };
  useEffect(() => {
    desktopMenuCommandHandlerRef.current = handleDesktopMenuCommand;
  });

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void desktopBridge
      .onMenuCommand((command) => {
        void desktopMenuCommandHandlerRef.current(command);
      })
      .then((unsubscribe) => {
        if (cancelled) {
          unsubscribe();
        } else {
          cleanup = unsubscribe;
        }
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [desktopBridge]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      switch (event.key) {
        case "r":
        case "R":
          setResetSignal((value) => value + 1);
          break;
        case "f":
        case "F":
          setFocusSignal((value) => value + 1);
          break;
        case "x":
        case "X":
          setRootNodeId(selectedNodeId);
          break;
        case "l":
        case "L":
          setShowNodeLabels((value) => !value);
          break;
        case "e":
        case "E":
          setShowEdgeLabels((value) => !value);
          break;
        case "c":
        case "C":
          setShowCells((value) => !value);
          break;
        case "v":
        case "V":
          setGraphView((value) => (value === "global" ? "on-graph" : "global"));
          break;
        case "u":
        case "U":
          setViewerOnlyMode((value) => !value);
          break;
        case "t":
        case "T":
          setColorScheme((value) => (value === "dark" ? "light" : "dark"));
          break;
        case "g":
        case "G":
          if (geometryAvailable) {
            setMode((value) => (value === "geometric" ? "shell" : "geometric"));
          }
          break;
        case "+":
        case "=":
          setRadius((value) =>
            clampInteger(value + 1, 0, graphPreset.maxRadius),
          );
          break;
        case "-":
        case "_":
          setRadius((value) =>
            clampInteger(value - 1, 0, graphPreset.maxRadius),
          );
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    geometryAvailable,
    graphPreset.maxRadius,
    selectedNodeId,
    scheduleSceneLayoutRefresh,
    setViewerOnlyMode,
  ]);

  return (
    <main
      className={`app-shell${viewerOnly ? " viewer-only" : ""}`}
      data-theme={colorScheme}
    >
      <aside ref={sidebarRef} className="sidebar" aria-label="Viewer controls">
        <Panel title="Input">
          <div className="segmented" role="group" aria-label="Interface mode">
            <button
              type="button"
              aria-pressed={uiMode === "teaching"}
              onClick={() => {
                setUiMode("teaching");
                setShowAdvancedPanels(false);
              }}
            >
              Teaching
            </button>
            <button
              type="button"
              aria-pressed={uiMode === "research"}
              onClick={() => {
                setUiMode("research");
                setShowAdvancedPanels(true);
              }}
            >
              Research
            </button>
          </div>

          <div className="field">
            <label htmlFor="example-select">Example</label>
            <select
              id="example-select"
              value={selectedExample.id}
              onChange={(event) => void handleExampleChange(event.target.value)}
            >
              {examples.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="backend-select">Backend</label>
            <select
              id="backend-select"
              value={backendId}
              onChange={(event) => setBackendId(event.target.value)}
            >
              <option value="browserApproxBackend">Browser approximate</option>
              {exactBackendStubs.map((backend) => (
                <option key={backend.name} value={backend.name}>
                  {backend.name} (external)
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="graph-preset-select">Graph size</label>
            <select
              id="graph-preset-select"
              value={graphPresetId}
              onChange={(event) => {
                const nextPresetId = event.target.value as GraphPresetId;
                const nextPreset = graphPresets[nextPresetId];
                setGraphPresetId(nextPresetId);
                setRadius((currentRadius) =>
                  currentRadius > nextPreset.maxRadius
                    ? nextPreset.maxRadius
                    : currentRadius,
                );
              }}
            >
              {Object.entries(graphPresets).map(([id, preset]) => (
                <option key={id} value={id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="radius-input">Radius</label>
            <input
              id="radius-input"
              data-testid="radius-input"
              type="number"
              min={0}
              max={graphPreset.maxRadius}
              disabled={activeDataset.kind !== "coxeter-system"}
              value={radius}
              onChange={(event) =>
                setRadius(
                  clampInteger(
                    Number(event.target.value),
                    0,
                    graphPreset.maxRadius,
                  ),
                )
              }
            />
          </div>

          <label className="button file-button" htmlFor="import-coxeter-input">
            <FileUp size={16} aria-hidden="true" />
            Import Coxeter system
          </label>
          <input
            id="import-coxeter-input"
            data-testid="import-json-input"
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) =>
              void handleImportCoxeterFile(event.currentTarget.files?.[0])
            }
          />
          <label
            className="button file-button"
            htmlFor="import-generated-input"
          >
            <FileUp size={16} aria-hidden="true" />
            Import generated graph
          </label>
          <input
            id="import-generated-input"
            data-testid="import-generated-input"
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) =>
              void handleImportGeneratedFile(event.currentTarget.files?.[0])
            }
          />
          <label className="button file-button" htmlFor="import-quotient-input">
            <FileUp size={16} aria-hidden="true" />
            Import quotient
          </label>
          <input
            id="import-quotient-input"
            data-testid="import-quotient-input"
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) =>
              void handleImportQuotientFile(event.currentTarget.files?.[0])
            }
          />
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={chooseNativeWorkspace}
            >
              <FolderOpen size={16} aria-hidden="true" />
              Workspace
            </button>
            <button
              type="button"
              className="button"
              onClick={openNativeProjectSession}
            >
              <FolderOpen size={16} aria-hidden="true" />
              Open session
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void exportProjectSession()}
            >
              <Save size={16} aria-hidden="true" />
              Save session
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void revealWorkspaceArtifacts()}
            >
              <FolderOpen size={16} aria-hidden="true" />
              Artifacts
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void refreshDesktopTools()}
            >
              Check tools
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void exportDesktopDiagnostics()}
            >
              Diagnostics
            </button>
          </div>
          <button
            type="button"
            className="button file-button"
            onClick={openBaseOrbicomplex}
          >
            Open 3D Y_Gamma model
          </button>
          <details className="advanced-details">
            <summary>Quotient builder</summary>
            <div className="field">
              <label htmlFor="quotient-subgroup-words">
                Subgroup generator words
              </label>
              <textarea
                id="quotient-subgroup-words"
                value={quotientSubgroupText}
                onChange={(event) =>
                  setQuotientSubgroupText(event.target.value)
                }
                placeholder="One word per line, e.g. s0 s1"
              />
            </div>
            <div className="field inline-field">
              <label htmlFor="quotient-max-cosets">Max cosets</label>
              <input
                id="quotient-max-cosets"
                type="number"
                min={1}
                max={100000}
                value={quotientMaxCosets}
                onChange={(event) =>
                  setQuotientMaxCosets(
                    clampInteger(Number(event.target.value), 1, 100000),
                  )
                }
              />
            </div>
            <button
              type="button"
              className="button"
              onClick={exportQuotientBuildRequest}
            >
              Export quotient build request
            </button>
            {quotientBuilderError ? (
              <p className="error-box" role="alert">
                {quotientBuilderError}
              </p>
            ) : (
              <p className="math-note">
                The browser exports request JSON; Sage/GAP scripts must certify
                the quotient action.
              </p>
            )}
          </details>
          {importError ? (
            <p className="error-box" data-testid="import-error" role="alert">
              {importError}
            </p>
          ) : null}
          {repairSuggestions.length > 0 ? (
            <ul className="repair-list" aria-label="Import repair suggestions">
              {repairSuggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <strong>{suggestion.label}</strong>
                  <span>{suggestion.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel title="Example Gallery">
          <div className="gallery-list" aria-label="Walkthrough gallery">
            {defaultGalleryEntries().map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="gallery-card"
                onClick={() => runGalleryAction(entry.id)}
              >
                <span className="small-label">{entry.family}</span>
                <strong>{entry.label}</strong>
                <span>{entry.summary}</span>
                <span className="link-like">{entry.actionLabel}</span>
              </button>
            ))}
          </div>
          <details
            className="catalogue-panel"
            open={eightFacetCatalogueOpen}
            onToggle={(event) =>
              setEightFacetCatalogueOpen(event.currentTarget.open)
            }
          >
            <summary>Example catalogue: 5D eight-facet cases</summary>
            <p className="math-note">
              Tumarkin lists 15 compact 5D Coxeter polytopes with 8 facets in{" "}
              {tumarkinEightFacetSourceRef.locator}. These entries are
              transcribed from the source EPS artwork, their dotted weights are
              solved from the determinant equations, and each bundled JSON has a
              passed rank/signature certificate.
            </p>
            <div className="field">
              <label htmlFor="eight-facet-catalogue-search">
                Search catalogue
              </label>
              <input
                id="eight-facet-catalogue-search"
                value={eightFacetCatalogueQuery}
                onChange={(event) =>
                  setEightFacetCatalogueQuery(event.target.value)
                }
                placeholder="G11411, 01, blocked, Table 4.10"
              />
            </div>
            <div className="field">
              <label htmlFor="eight-facet-catalogue-filter">Filter</label>
              <select
                id="eight-facet-catalogue-filter"
                value={eightFacetCatalogueFilter}
                onChange={(event) =>
                  setEightFacetCatalogueFilter(
                    event.target.value as EightFacetCatalogueFilter,
                  )
                }
              >
                <option value="all">All 15 entries</option>
                <option value="representative">
                  Representative gallery entries
                </option>
                <option value="blocked">Uncertified or blocked</option>
              </select>
            </div>
            <p className="math-note">
              Showing {visibleEightFacetCatalogue.length}/
              {tumarkinEightFacetCatalogue.length};{" "}
              {countCertificationBlockedEntries()} still need transcription or
              checker artifacts before certification.
            </p>
            <div
              className="catalogue-list"
              aria-label="Tumarkin eight-facet catalogue"
            >
              {visibleEightFacetCatalogue.map((entry) => (
                <article key={entry.id} className="catalogue-entry">
                  <div>
                    <span className="small-label">
                      {entry.galeDiagram} · #
                      {entry.tableIndex.toString().padStart(2, "0")}
                    </span>
                    <strong>{entry.label}</strong>
                  </div>
                  <span className="status-pill">
                    {entry.renderStatus.replace("-", " ")}
                  </span>
                  <span className="status-pill warning-pill">
                    {entry.certificationStatus.replace(/-/g, " ")}
                  </span>
                  <p>{entry.sourceLocator}</p>
                  <p className="math-note">
                    {entry.renderable
                      ? "Certified bundled Coxeter-system JSON is available."
                      : `Certification needs: ${entry.requiredForCertification
                          .slice(0, 2)
                          .join(" ")}`}
                  </p>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!entry.renderable}
                    onClick={() => void handleLoadEightFacetEntry(entry)}
                  >
                    Load example
                  </button>
                </article>
              ))}
            </div>
          </details>
        </Panel>

        <Panel title="Guided Inspection">
          <GuidedInspectionPanel
            state={guidedInspection}
            onStart={startGuidedInspection}
            onStep={moveGuidedInspection}
            onExit={() => setGuidedInspection(undefined)}
          />
        </Panel>

        {uiMode === "research" ? (
          <Panel title="Research Workflow">
            <ResearchWorkflowPanel
              state={researchWorkflow}
              activeStep={activeWorkflowStep}
              lens={topologyLens}
              quotient={activeQuotient}
              generators={system.generators}
              selectedVertexId={selectedNode?.id}
              assignmentLabel={quotientAssignment?.label}
              boundaryCheckSummary={
                quotientBoundaryChecks
                  ? `${quotientBoundaryChecks.checks.filter((check) => check.ok).length}/${quotientBoundaryChecks.checks.length} rank-two boundary checks passed`
                  : "no quotient boundary checks"
              }
              incidentFlows={quotientIncidentFlows}
              localLinkHomology={localLinkHomology}
              topologyDiagnostics={topologyDiagnostics}
              visibleCounts={{
                nodes: sceneStats?.renderedNodes ?? viewNodes.length,
                edges: sceneStats?.renderedEdgeSegments ?? viewEdges.length,
                cells: sceneStats?.renderedCells ?? activeSceneCells.length,
              }}
              savedRunCount={savedExperiments.length}
              comparisonStatus={
                workflowComparison
                  ? workflowComparison.statusChanged
                    ? "latest runs changed status"
                    : "latest runs have the same status"
                  : "save two runs to compare"
              }
              onSetStep={(stepId) =>
                setResearchWorkflow((current) => ({ ...current, stepId }))
              }
              onMove={moveResearchWorkflow}
              onRunStep={() => runResearchWorkflowAction()}
              onLens={applyTopologyLens}
              onLensGenerator={setTopologyLensGenerator}
              onSave={saveExperimentRun}
              onCompare={() => setShowAdvancedPanels(true)}
              onExport={() => void exportExperimentBundle()}
            />
          </Panel>
        ) : (
          <Panel title="Teaching Focus">
            <p className="math-note">
              Teaching mode keeps quotient certificates, notebooks, and backend
              reports tucked away. Use the guide or gallery to choose one
              mathematical object at a time.
            </p>
          </Panel>
        )}

        {activeIsYGammaBaseComplex && yGammaAtlas ? (
          <Panel title="Y_Gamma 3D Reader">
            <YGammaReaderPanel
              atlas={yGammaAtlas}
              focusPreset={yGammaFocusPreset}
              activeGeneratorPairKey={activeGeneratorPairKey}
              focusGenerator={yGammaFocusGenerator}
              peelMode={yGammaPeelMode}
              topologyMode={yGammaTopologyMode}
              cameraBookmark={yGammaCameraBookmark}
              rankThreeFocusAvailable={Boolean(yGammaRankThreeFocus)}
              onPreset={applyYGammaNarratedPreset}
              onFocusPair={focusPairByKey}
              onFocusGenerator={(generator) => {
                setYGammaFocusGenerator(generator);
                applyYGammaNarratedPreset("around-generator");
              }}
              onPeelMode={setYGammaPeelMode}
              onTopologyMode={setYGammaTopologyMode}
              onCameraBookmark={snapYGammaCamera}
            />
          </Panel>
        ) : null}

        {showDetailedControls ? (
          <>
            <Panel title="Mode">
              <div className="segmented" role="group" aria-label="Viewer mode">
                <button
                  type="button"
                  aria-pressed={effectiveMode === "shell"}
                  onClick={() => setMode("shell")}
                >
                  Shell
                </button>
                <button
                  type="button"
                  data-testid="mode-geometric"
                  aria-pressed={effectiveMode === "geometric"}
                  disabled={!geometryAvailable}
                  onClick={() => setMode("geometric")}
                >
                  Geometric
                </button>
              </div>
              {!geometryAvailable ? (
                <p className="math-note" data-testid="geometry-warning">
                  Geometric projection is disabled because this example has no
                  validated hyperbolic normals and basepoint.
                </p>
              ) : null}
              {geometryAvailable ? (
                <div className="field inline-field">
                  <label htmlFor="projection-select">Projection</label>
                  <select
                    id="projection-select"
                    value={projection}
                    onChange={(event) =>
                      setProjection(event.target.value as HyperbolicProjection)
                    }
                  >
                    <option value="poincare-axes">Poincare axes (ball)</option>
                    <option value="klein-axes">Klein axes (ball)</option>
                    <option value="poincare-pca">
                      Poincare PCA (projected)
                    </option>
                    <option value="klein-pca">Klein PCA (projected)</option>
                  </select>
                </div>
              ) : null}
            </Panel>

            <Panel title="View Comparison">
              <div
                className="preset-grid"
                role="group"
                aria-label="View comparison modes"
              >
                {viewComparisonOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={viewComparisonMode === option.id}
                    title={option.summary}
                    onClick={() => setViewComparisonMode(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="math-note">
                {
                  viewComparisonOptions.find(
                    (option) => option.id === viewComparisonMode,
                  )?.summary
                }
              </p>
            </Panel>

            <Panel title="View">
              <div
                className="preset-grid"
                role="group"
                aria-label="View presets"
              >
                {viewPresetOptions.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={activePreset === preset.id}
                    disabled={
                      preset.id === "geometric-projection" && !geometryAvailable
                    }
                    title={
                      preset.id === "geometric-projection" && !geometryAvailable
                        ? "Geometric projection needs validated hyperbolic data."
                        : preset.label
                    }
                    onClick={() => applyViewPreset(preset.id)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="segmented" role="group" aria-label="Graph view">
                <button
                  type="button"
                  aria-pressed={graphView === "global"}
                  onClick={() => setGraphView("global")}
                >
                  Global
                </button>
                <button
                  type="button"
                  data-testid="view-on-graph"
                  aria-pressed={graphView === "on-graph"}
                  onClick={() => setGraphView("on-graph")}
                >
                  On graph
                </button>
              </div>
              {graphView === "on-graph" ? (
                <>
                  <div className="field inline-field">
                    <label htmlFor="local-depth-select">Local depth</label>
                    <select
                      id="local-depth-select"
                      value={localDepth}
                      onChange={(event) =>
                        setLocalDepth(
                          clampInteger(Number(event.target.value), 1, 4),
                        )
                      }
                    >
                      <option value={1}>1 step</option>
                      <option value={2}>2 steps</option>
                      <option value={3}>3 steps</option>
                      <option value={4}>4 steps</option>
                    </select>
                  </div>
                  <div className="field inline-field">
                    <label htmlFor="occlusion-select">Far shells</label>
                    <select
                      id="occlusion-select"
                      value={occlusionMode}
                      onChange={(event) =>
                        setOcclusionMode(event.target.value as OcclusionMode)
                      }
                    >
                      <option value="hide-far">Hide</option>
                      <option value="fade-far">Fade</option>
                      <option value="x-ray">X-ray</option>
                    </select>
                  </div>
                </>
              ) : null}
              <p className="math-note">
                Local Chamber uses a 3D readability layout: generator neighbors
                live on a small sphere and deeper vertices move to separated
                shells. Rank-two fills default to the displayed 1-skeleton;
                lifted panels and petals are optional.
              </p>
              <div className="breadcrumb" aria-label="Selected word breadcrumb">
                {breadcrumb.map((entry, index) => (
                  <span key={`${entry.index}:${entry.label}`}>
                    {index > 0 ? (
                      <span className="breadcrumb-separator">/</span>
                    ) : null}
                    <button
                      type="button"
                      disabled={!entry.clickable}
                      onClick={() => {
                        if (entry.nodeId) {
                          setSelectedNodeId(entry.nodeId);
                        }
                      }}
                    >
                      {entry.label}
                    </button>
                  </span>
                ))}
              </div>
              <div className="step-grid" aria-label="Step by generator">
                {generatorSteps.map((step) => (
                  <button
                    key={step.generatorId}
                    type="button"
                    disabled={!step.available}
                    title={step.reason ?? `Step by ${step.label}`}
                    onClick={() => stepByGenerator(step.generator)}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Labels">
              <div
                className="segmented segmented-three"
                role="group"
                aria-label="Label scope"
              >
                {(["off", "focused", "budgeted"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    aria-pressed={labelScope === scope}
                    onClick={() => setLabelScope(scope)}
                  >
                    {scope}
                  </button>
                ))}
              </div>
              <Toggle
                checked={showNodeLabels}
                label="Show compact group-element labels"
                onChange={setShowNodeLabels}
              />
              <Toggle
                checked={showEdgeLabels}
                label="Show generator labels on edges"
                onChange={setShowEdgeLabels}
              />
              <p className="math-note">
                Vertex labels show the selected reduced word, compacted for
                display. Edge labels show the generator for that adjacency.
              </p>
            </Panel>

            <Panel title="Rank-Two Davis Cells">
              <Toggle
                checked={showCells}
                label="Show filled rank-two cells"
                onChange={setShowCells}
              />
              <div className="button-row">
                <button
                  type="button"
                  className="button"
                  onClick={() => toggleAllRankTwoPairs(true)}
                >
                  All on
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => toggleAllRankTwoPairs(false)}
                >
                  All off
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={showOnlyM3Pairs}
                >
                  Only m=3
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={!activeGeneratorPairKey}
                  onClick={showOnlyActivePair}
                >
                  Only active pair
                </button>
              </div>
              <div className="field inline-field">
                <label htmlFor="cell-render-mode-select">Cell drawing</label>
                <select
                  id="cell-render-mode-select"
                  value={cellRenderMode}
                  onChange={(event) =>
                    setCellRenderMode(event.target.value as LocalCellRenderMode)
                  }
                >
                  <option value="in-graph">Bounded by graph</option>
                  <option value="lifted-panels">Lifted panels</option>
                  <option value="petals">Petals</option>
                  <option value="outline-only">Outline only</option>
                </select>
              </div>
              <div className="field inline-field">
                <label htmlFor="cell-focus-mode-select">Cell focus</label>
                <select
                  id="cell-focus-mode-select"
                  value={cellFocusMode}
                  onChange={(event) =>
                    setCellFocusMode(event.target.value as CellFocusMode)
                  }
                >
                  <option value="all-local">All local cells</option>
                  <option value="incident-selected">
                    Incident to selected
                  </option>
                  <option value="selected-pair">Selected pair only</option>
                  <option value="selected-cell">Selected cell only</option>
                </select>
              </div>
              <div className="field inline-field">
                <label htmlFor="cell-neighborhood-select">Neighborhood</label>
                <select
                  id="cell-neighborhood-select"
                  value={cellNeighborhoodMode}
                  onChange={(event) =>
                    setCellNeighborhoodMode(
                      event.target.value as CellNeighborhoodMode,
                    )
                  }
                >
                  <option value="chamber">Chamber neighborhood</option>
                  <option value="cell-boundary">Cell boundary</option>
                  <option value="cell-plus-1">Cell + 1 shell</option>
                  <option value="cell-plus-2">Cell + 2 shells</option>
                </select>
              </div>
              <div className="field inline-field">
                <label htmlFor="relation-walk-select">Relation walk</label>
                <select
                  id="relation-walk-select"
                  value={relationWalkMode}
                  onChange={(event) =>
                    setRelationWalkMode(event.target.value as RelationWalkMode)
                  }
                >
                  <option value="numbered">Number boundary</option>
                  <option value="off">Off</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="cell-opacity-input">Cell opacity</label>
                <input
                  id="cell-opacity-input"
                  type="range"
                  min="0.08"
                  max="0.5"
                  step="0.02"
                  value={cellOpacity}
                  onChange={(event) =>
                    setCellOpacity(Number(event.target.value))
                  }
                />
              </div>
              <Toggle
                checked={bringFocusedCellsForward}
                label="Bring focused cells forward"
                onChange={setBringFocusedCellsForward}
              />
              <div
                className="chip-grid"
                aria-label="Rank-two generator-pair filters"
              >
                {pairOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className="chip-button"
                    aria-pressed={!disabledPairs.has(option.key)}
                    data-active={activeGeneratorPairKey === option.key}
                    onClick={() => togglePairByKey(option.key)}
                    title={`${option.label}: m=${option.m}, ${option.polygonLabel}, ${option.visibleCount}/${option.totalCount} visible`}
                  >
                    {option.label} m={option.m} ({option.visibleCount}/
                    {option.totalCount})
                  </button>
                ))}
              </div>
              <p className="math-note">
                Pair chips control visibility. The pair matrix below focuses a
                relation and auto-expands the local drawing to complete one
                cell.
              </p>
            </Panel>

            <Panel title="Pair Matrix">
              <div className="pair-matrix" aria-label="Coxeter pair matrix">
                {pairOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className="pair-matrix-button"
                    data-active={activeGeneratorPairKey === option.key}
                    onClick={() => focusPairByKey(option.key)}
                  >
                    <span>{option.label}</span>
                    <strong>m={option.m}</strong>
                    <small>{option.polygonLabel}</small>
                    <small>
                      {option.visibleCount}/{option.totalCount} visible
                      {option.clippedCount > 0
                        ? `, ${option.clippedCount} clipped`
                        : ""}
                    </small>
                    {option.minDepthToComplete !== undefined ? (
                      <small>needs depth {option.minDepthToComplete}</small>
                    ) : null}
                  </button>
                ))}
              </div>
            </Panel>
          </>
        ) : null}

        {showAdvancedPanels ? (
          <Panel title="Higher Davis Cells">
            <Toggle
              checked={showHigherCells}
              label="Show higher-cell visual proxies"
              onChange={setShowHigherCells}
            />
            <p className="math-note">
              Incidence and coset records are combinatorial data. The filled
              higher-rank shapes are proxy drawings.
            </p>
            <ul className="plain-list">
              {higherSubsetOptions.map((option) => (
                <li key={option.subsetId}>
                  <Toggle
                    checked={!disabledHigherSubsets.has(option.subsetId)}
                    label={`${option.label} (${option.count})`}
                    onChange={(checked) =>
                      toggleHigherSubset(option.subsetId, checked)
                    }
                  />
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </aside>

      <section className="main-stage">
        <div className="top-strip">
          <div className="app-title">
            <h1>Coxeter Viewer 5D</h1>
            <p>
              {system.description ??
                "Finite-radius Cayley and Davis neighborhood viewer."}
            </p>
          </div>
          <div className="stats-row" aria-live="polite">
            {activeIsYGammaBaseComplex ? (
              <div
                className="segmented ygamma-view-switch"
                role="group"
                aria-label="Y_Gamma display mode"
              >
                <button
                  type="button"
                  aria-pressed={yGammaMainView === "complex"}
                  onClick={() => setYGammaMainView("complex")}
                >
                  3D model
                </button>
                <button
                  type="button"
                  aria-pressed={yGammaMainView === "nerve"}
                  onClick={() => setYGammaMainView("nerve")}
                >
                  2D nerve schematic
                </button>
              </div>
            ) : null}
            {showingYGammaComplex &&
            yGammaDense &&
            !yGammaRankThreeFocusEnabled ? (
              <button
                type="button"
                className="button"
                aria-pressed={yGammaShowAllFaces}
                onClick={() => setYGammaShowAllFaces((value) => !value)}
              >
                {yGammaShowAllFaces ? "Active face family" : "Show full 3-cell"}
              </button>
            ) : null}
            {showingYGammaComplex && yGammaRankThreeFocus ? (
              <button
                type="button"
                className="button"
                aria-pressed={yGammaRankThreeFocusEnabled}
                onClick={() => {
                  if (yGammaRankThreeFocusEnabled) {
                    setYGammaRankThreeFocusEnabled(false);
                  } else {
                    focusRankThreeM2M3Demo();
                  }
                }}
              >
                {yGammaRankThreeFocusEnabled
                  ? "Exit 3D cell focus"
                  : "Focus 3D m=2/m=3 cell"}
              </button>
            ) : null}
            {showingYGammaComplex &&
            yGammaRankThreeFocus &&
            yGammaRankThreeFocusEnabled ? (
              <>
                <button
                  type="button"
                  className="button"
                  data-active={
                    activeGeneratorPairKey === yGammaRankThreeFocus.pairKeys[0]
                  }
                  onClick={() =>
                    focusRankThreeM2M3Demo(yGammaRankThreeFocus.pairKeys[0])
                  }
                >
                  Look at m=2 squares
                </button>
                <button
                  type="button"
                  className="button"
                  data-active={
                    activeGeneratorPairKey === yGammaRankThreeFocus.pairKeys[1]
                  }
                  onClick={() =>
                    focusRankThreeM2M3Demo(yGammaRankThreeFocus.pairKeys[1])
                  }
                >
                  Look at m=3 hexagons
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="button"
              aria-pressed={colorScheme === "dark"}
              onClick={() =>
                setColorScheme((value) => (value === "dark" ? "light" : "dark"))
              }
            >
              {colorScheme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button
              type="button"
              className="button"
              aria-pressed={viewerOnly}
              onClick={() => setViewerOnlyMode((value) => !value)}
            >
              {viewerOnly ? "Show UI" : "Viewer only"}
            </button>
            <button
              type="button"
              className="button"
              aria-pressed={showAdvancedPanels}
              onClick={() => setShowAdvancedPanels((value) => !value)}
            >
              {showAdvancedPanels
                ? "Hide research panels"
                : "Show research panels"}
            </button>
            <Stat
              label="Nodes"
              value={
                showingYGammaComplex
                  ? activeSceneVisibleNodeCount
                  : (ball?.nodes.length ?? 0)
              }
              testId="node-count"
            />
            <Stat
              label="Edges"
              value={
                showingYGammaComplex
                  ? activeSceneEdges.length
                  : (ball?.edges.length ?? 0)
              }
            />
            <Stat
              label="Cells"
              value={
                showingYGammaComplex
                  ? activeSceneCells.length
                  : visibleCells.length + visibleHigherProxies.length
              }
              testId="rank-two-cell-count"
            />
          </div>
        </div>

        {showingYGammaNerve ? (
          <YGammaNerveDiagnosticViewer
            atlas={yGammaAtlas}
            activeGeneratorPairKey={activeGeneratorPairKey}
            onFocusPair={focusPairByKey}
            onShowComplex={() => setYGammaMainView("complex")}
          />
        ) : (
          <div
            className={`viewer-with-overlay${
              showingYGammaComplex && yGammaAtlas ? " has-ygamma-atlas" : ""
            }`}
          >
            {viewerOnly ? (
              <button
                type="button"
                className="viewer-ui-toggle"
                onClick={() => setViewerOnlyMode(false)}
              >
                Show UI
              </button>
            ) : null}
            {showingYGammaComplex && yGammaAtlas ? (
              <YGammaMiniAtlasOverlay
                atlas={yGammaAtlas}
                activeGeneratorPairKey={activeGeneratorPairKey}
                onFocusPair={focusPairByKey}
              />
            ) : null}
            {viewComparisonMode !== "single" ? (
              <div
                className="comparison-overlay"
                aria-label="Active view comparison"
              >
                <strong>
                  {
                    viewComparisonOptions.find(
                      (option) => option.id === viewComparisonMode,
                    )?.label
                  }
                </strong>
                <span>
                  {
                    viewComparisonOptions.find(
                      (option) => option.id === viewComparisonMode,
                    )?.summary
                  }
                </span>
              </div>
            ) : null}
            <SceneView
              nodes={activeSceneNodes}
              edges={activeSceneEdges}
              cells={activeSceneCells}
              generators={system.generators}
              structureVersion={activeSceneStructureVersion}
              appearanceVersion={activeSceneAppearanceVersion}
              selectedNodeId={activeSceneSelectedNodeId}
              selectedCellId={selectedCellId}
              showCells={showingYGammaComplex || showCells || showHigherCells}
              showNodeLabels={showingYGammaComplex || showNodeLabels}
              showEdgeLabels={showingYGammaComplex || showEdgeLabels}
              labelScope={showingYGammaComplex ? "focused" : labelScope}
              activeGeneratorPair={activeGeneratorPair}
              localCellRenderMode={
                showingYGammaComplex ? "in-graph" : cellRenderMode
              }
              occlusionMode={occlusionMode}
              cellOpacity={
                showingYGammaComplex
                  ? yGammaTopologyMode
                    ? 0.18
                    : 0.3
                  : cellOpacity
              }
              panelOffsetStrength={
                showingYGammaComplex
                  ? 0
                  : bringFocusedCellsForward
                    ? panelOffsetStrength
                    : 0
              }
              topologyMode={showingYGammaComplex && yGammaTopologyMode}
              semanticLabelsOnly={showingYGammaComplex}
              cameraFocusTarget={cameraFocusTarget}
              cameraFocusOffset={cameraFocusOffset}
              showReferenceBall={geometricReferenceBallVisible}
              referenceBallRadius={geometricDisplayScale}
              cameraPreset={
                showingYGammaComplex
                  ? "global"
                  : graphView === "on-graph"
                    ? "on-graph"
                    : "global"
              }
              resetSignal={resetSignal}
              focusNodeId={activeSceneSelectedNodeId}
              focusSignal={focusSignal}
              maxNodeLabels={showingYGammaComplex ? 80 : effectiveMaxNodeLabels}
              maxEdgeLabels={showingYGammaComplex ? 80 : effectiveMaxEdgeLabels}
              pickingEnabled={!showingYGammaComplex}
              workerGenerationMs={generation.generationMs}
              colorScheme={colorScheme}
              layoutVersion={sceneLayoutSignal}
              onCapturePngReady={handleCapturePngReady}
              onRenderStats={setSceneStats}
              onHoverCell={showingYGammaComplex ? setHoveredCellId : undefined}
              onSelectNode={handleSceneSelectNode}
              onSelectCell={handleSceneSelectCell}
            />
          </div>
        )}
      </section>

      <aside
        ref={rightRailRef}
        className="right-rail"
        aria-label="Graph details"
      >
        <Panel
          title="Inspector"
          actions={
            <>
              <button
                type="button"
                className="icon-button"
                aria-label="Focus selected node"
                title="Focus selected node"
                onClick={() => setFocusSignal((value) => value + 1)}
              >
                <Crosshair size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Root view at selected node"
                title="Root view at selected node"
                onClick={() => setRootNodeId(selectedNode?.id ?? "e")}
              >
                <Home size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Export graph JSON"
                title="Export graph JSON"
                onClick={exportGraph}
              >
                <Download size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Export local neighborhood"
                title="Export local neighborhood"
                onClick={exportLocalNeighborhood}
              >
                <FileJson size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Export screenshot"
                title="Export screenshot"
                onClick={exportScreenshot}
              >
                <ImageDown size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Export view bundle"
                title="Export view bundle"
                onClick={exportViewBundle}
              >
                <Package size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Export figure bundle"
                title="Export figure bundle"
                onClick={exportFigureBundle}
              >
                <Package size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Export project session"
                title="Export project session"
                onClick={() => void exportProjectSession()}
              >
                <FileJson size={17} aria-hidden="true" />
              </button>
            </>
          }
        >
          <TopologyFirstInspector explanation={topologyExplanation} />
        </Panel>

        <Panel title="What Relation Am I Seeing?">
          {showingYGammaComplex && yGammaAtlas ? (
            <YGammaWhyPanel
              relation={yGammaActiveRelation}
              sceneCellId={yGammaHoveredOrActiveCell?.id}
              focusPreset={yGammaFocusPreset}
              peelMode={yGammaPeelMode}
            />
          ) : (
            <RelationFocusPanel
              cell={focusedRankTwoCell}
              pairKeyValue={activeGeneratorPairKey}
              pairOptions={pairOptions}
              relationWalk={relationWalk}
            />
          )}
        </Panel>

        {showingYGammaComplex && yGammaAtlas ? (
          <Panel title="Local Topology Checklist">
            <YGammaTopologyChecklist
              atlas={yGammaAtlas}
              activeGeneratorPairKey={activeGeneratorPairKey}
              focusGenerator={yGammaEffectiveFocusGenerator}
              rankThreeFocus={effectiveYGammaRankThreeFocus}
              visibleCells={activeSceneCells}
            />
          </Panel>
        ) : null}

        {showAdvancedPanels ? (
          <>
            <Panel title="Legend">
              <ul className="legend-list">
                {system.generators.map((generator, index) => (
                  <li key={generator.id} className="legend-item">
                    <span
                      className="swatch"
                      style={{ backgroundColor: generator.colorHint }}
                    />
                    <span>
                      {generator.label}{" "}
                      <span className="small-label">generator {index}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Research Status">
              <ResearchStatusPanel
                system={system}
                ball={ball ?? undefined}
                davisIncidence={davisIncidence}
                sceneStats={sceneStats}
                desktopStatus={desktopStatus}
                desktopMessage={desktopMessage}
                sessionDirty={sessionDirty}
                recentSessions={recentSessions}
                desktopTools={desktopTools}
                desktopJobs={desktopJobs}
              />
            </Panel>

            <Panel title="Experiment Notebook">
              <div className="field">
                <label htmlFor="experiment-note">Note</label>
                <textarea
                  id="experiment-note"
                  value={experimentNote}
                  onChange={(event) => setExperimentNote(event.target.value)}
                  placeholder="Record what this local view is testing."
                />
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="button"
                  onClick={saveExperimentRun}
                >
                  Save run
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={savedExperiments.length === 0}
                  onClick={duplicateLatestExperimentRun}
                >
                  Duplicate latest
                </button>
                <button
                  type="button"
                  className="button"
                  aria-label="Export experiment bundle"
                  onClick={exportExperimentBundle}
                >
                  Export bundle
                </button>
                <label
                  className="button file-button"
                  htmlFor="import-notebook-input"
                >
                  Import bundle
                </label>
                <input
                  id="import-notebook-input"
                  className="hidden-input"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) =>
                    void importExperimentNotebook(
                      event.currentTarget.files?.[0],
                    )
                  }
                />
              </div>
              <p className="math-note">
                {savedExperiments.length} saved run
                {savedExperiments.length === 1 ? "" : "s"} in this browser.
              </p>
              {notebookImportError ? (
                <p className="error-box" role="alert">
                  {notebookImportError}
                </p>
              ) : null}
              {savedExperiments.length >= 2 ? (
                <ExperimentComparisonSummary bundles={savedExperiments} />
              ) : null}
            </Panel>

            <Panel title="Annotations And Bookmarks">
              <div className="field">
                <label htmlFor="annotation-draft">Figure annotation</label>
                <textarea
                  id="annotation-draft"
                  value={annotationDraft}
                  onChange={(event) => setAnnotationDraft(event.target.value)}
                  placeholder="Describe the selected cell, edge, or view."
                />
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="button"
                  onClick={addAnnotation}
                >
                  Add annotation
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={exportFigureBundle}
                >
                  Export figure bundle
                </button>
              </div>
              <ul className="plain-list">
                {annotations.slice(0, 4).map((annotation) => (
                  <li key={annotation.id}>
                    <span className="small-label">
                      {annotation.targetKind}
                      {annotation.targetId ? ` ${annotation.targetId}` : ""}
                    </span>
                    <span>{annotation.body}</span>
                  </li>
                ))}
              </ul>
              <div className="field">
                <label htmlFor="bookmark-draft">Camera/view bookmark</label>
                <input
                  id="bookmark-draft"
                  value={bookmarkDraft}
                  onChange={(event) => setBookmarkDraft(event.target.value)}
                  placeholder="Name this view"
                />
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="button"
                  onClick={saveCameraBookmark}
                >
                  Save bookmark
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => void exportProjectSession()}
                >
                  Export session
                </button>
              </div>
              <ul className="plain-list">
                {cameraBookmarks.slice(0, 4).map((bookmark) => (
                  <li key={bookmark.id}>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => applyCameraBookmark(bookmark)}
                    >
                      {bookmark.label}
                    </button>
                    <span className="small-label">
                      {bookmark.preset}, {bookmark.topologyLensId}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        ) : null}

        <Panel title="Local Link">
          {hasMathContext ? (
            <>
              <LocalLinkView
                localLink={localLink}
                activeGeneratorPair={activeGeneratorPair}
                disabledPairs={disabledPairs}
                onGeneratorStep={stepByGenerator}
                onPairToggle={(pair) => focusPairByKey(pairKey(pair))}
              />
              <p className="math-note">
                Link at {localLink.nodeId}: {localLink.vertices.length}{" "}
                vertices, {localLink.simplices.length} spherical simplices.
              </p>
              <div className="badge-row" aria-label="Davis exactness badges">
                <span className="status-badge">rank-two exact</span>
                <span className="status-badge">
                  incidence exact in visible ball
                </span>
                <span className="status-badge muted">visual proxy</span>
              </div>
              <div
                className="chip-grid"
                role="group"
                aria-label="Local link pair filters"
              >
                {localLink.sphericalSubsets
                  .filter((subset) => subset.rank === 2)
                  .map((subset) => {
                    const pair = subset.generators as [number, number];
                    const key = pairKey(pair);
                    const disabled = disabledPairs.has(key);

                    return (
                      <button
                        key={subset.id}
                        type="button"
                        className="chip-button"
                        data-active={activeGeneratorPairKey === key}
                        aria-pressed={!disabled}
                        onClick={() => focusPairByKey(key)}
                      >
                        Focus {subset.generatorLabels.join("-")} rank-two cells
                      </button>
                    );
                  })}
              </div>
              <ul className="subset-list">
                {groupSphericalSubsetsByRank(localLink.sphericalSubsets).map(
                  ([rank, subsets]) => (
                    <li key={rank}>
                      <span className="subset-rank">rank {rank}</span>
                      <span>
                        {subsets.length} subset{subsets.length === 1 ? "" : "s"}
                      </span>
                    </li>
                  ),
                )}
              </ul>
              {topologyDiagnostics ? (
                <div className="topology-summary">
                  <p className="math-note">
                    Link diagnostics: flag condition{" "}
                    {topologyDiagnostics.linkCondition.status};{" "}
                    {
                      topologyDiagnostics.linkCondition.missingFlagSimplices
                        .length
                    }{" "}
                    missing flag simplex
                    {topologyDiagnostics.linkCondition.missingFlagSimplices
                      .length === 1
                      ? ""
                      : "es"}
                    .
                  </p>
                </div>
              ) : null}
              {sphericalCellProxies.proxies.length > 0 ? (
                <p className="math-note">
                  {sphericalCellProxies.proxies.length} higher-rank Davis cell
                  proxies are available;{" "}
                  {
                    sphericalCellProxies.proxies.filter(
                      (proxy) => proxy.exactIncidenceAvailable,
                    ).length
                  }{" "}
                  have exact visible incidence metadata.
                </p>
              ) : null}
            </>
          ) : (
            <p className="math-note">
              Local-link mathematics needs the source Coxeter system, not only a
              generated graph.
            </p>
          )}
        </Panel>

        <Panel title="Y_Gamma Cell Inventory">
          {yGammaAtlas ? (
            <YGammaAtlasPanel
              atlas={yGammaAtlas}
              active={activeIsYGammaBaseComplex}
              activeGeneratorPairKey={activeGeneratorPairKey}
              rankThreeFocus={yGammaRankThreeFocus}
              rankThreeFocusEnabled={yGammaRankThreeFocusEnabled}
              onShowComplex={() => {
                openBaseOrbicomplex();
                setYGammaMainView("complex");
              }}
              onShowNerve={() => {
                openBaseOrbicomplex();
                setYGammaMainView("nerve");
              }}
              onFocusPair={focusPairByKey}
              onFocusRankThree={() => {
                if (!activeIsYGammaBaseComplex) {
                  openBaseOrbicomplex();
                }
                focusRankThreeM2M3Demo();
              }}
              onFocusRankThreePair={(key) => {
                if (!activeIsYGammaBaseComplex) {
                  openBaseOrbicomplex();
                }
                focusRankThreeM2M3Demo(key);
              }}
            />
          ) : (
            <p className="math-note">
              The Y_Gamma atlas needs a source Coxeter system. Generated graph
              imports without source data cannot determine spherical cells.
            </p>
          )}
        </Panel>

        <Panel title="Game / Quotient">
          {activeDataset.kind === "quotient-complex" ? (
            <QuotientGamePanel
              quotient={activeDataset.quotient}
              selectedVertexId={selectedNode?.id}
            />
          ) : (
            <>
              <p className="math-note">
                Game and PL Morse diagnostics live on quotient-style complexes:
                imported quotients or the one-vertex base orbicomplex{" "}
                <span className="matrix-key">Y_Gamma</span>.
              </p>
              <button
                type="button"
                className="button"
                onClick={openBaseOrbicomplex}
              >
                Open 3D Y_Gamma model
              </button>
              <p className="math-note">
                Y_Gamma is the fundamental-domain cell complex: one base vertex,
                oriented generator arrows, and relation polytopes/cells for
                spherical subsets. The 2D nerve schematic is only a diagnostic.
              </p>
            </>
          )}
        </Panel>

        <Panel title="What Am I Seeing?">
          <p className="math-note">
            <strong>{whatAmISeeing.title}</strong>
          </p>
          <ul className="plain-list story-list">
            {whatAmISeeing.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </Panel>

        <Panel title="Warnings">
          {warningGroups.length > 0 ? (
            <WarningGroupsView
              groups={warningGroups}
              showAll={showAllWarnings}
              onToggleShowAll={() => setShowAllWarnings((value) => !value)}
            />
          ) : (
            <p className="math-note">No warnings for the current view.</p>
          )}
        </Panel>
      </aside>
    </main>
  );
}

function TopologyFirstInspector({
  explanation,
}: {
  explanation: TopologyExplanation;
}) {
  return (
    <div className="topology-inspector">
      <div className="status-row">
        <span className="status-badge">{explanation.layer}</span>
        <span className="status-badge muted">{explanation.status}</span>
        {explanation.badges.slice(0, 4).map((badge) => (
          <span className="status-badge muted" key={badge}>
            {badge}
          </span>
        ))}
      </div>
      <h3>{explanation.title}</h3>
      <p className="math-note">{explanation.summary}</p>
      {explanation.boundaryWord && explanation.boundaryWord.length > 0 ? (
        <p className="math-note">
          Boundary word:{" "}
          <span className="matrix-key">
            {explanation.boundaryWord.join(" ")}
          </span>
        </p>
      ) : null}
      {explanation.rows.length > 0 ? (
        <table className="inspector-table">
          <tbody>
            {explanation.rows.map((row) => (
              <tr key={row.label}>
                <th>{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function ResearchWorkflowPanel({
  state,
  activeStep,
  lens,
  quotient,
  generators,
  selectedVertexId,
  assignmentLabel,
  boundaryCheckSummary,
  incidentFlows,
  localLinkHomology,
  topologyDiagnostics,
  visibleCounts,
  savedRunCount,
  comparisonStatus,
  onSetStep,
  onMove,
  onRunStep,
  onLens,
  onLensGenerator,
  onSave,
  onCompare,
  onExport,
}: {
  state: ResearchWorkflowState;
  activeStep: ReturnType<typeof activeResearchWorkflowStep>;
  lens: TopologyLensState;
  quotient?: import("../quotient").QuotientComplex;
  generators: CoxeterSystemInput["generators"];
  selectedVertexId?: string;
  assignmentLabel?: string;
  boundaryCheckSummary: string;
  incidentFlows: ReturnType<typeof classifyIncidentEdges>;
  localLinkHomology?: LocalLinkHomologySummary;
  topologyDiagnostics?: ReturnType<typeof summarizeTopologyDiagnostics>;
  visibleCounts: { nodes: number; edges: number; cells: number };
  savedRunCount: number;
  comparisonStatus: string;
  onSetStep: (stepId: ResearchWorkflowStepId) => void;
  onMove: (delta: number) => void;
  onRunStep: () => void;
  onLens: (lensId: TopologyLensId) => void;
  onLensGenerator: (generator: number) => void;
  onSave: () => void;
  onCompare: () => void;
  onExport: () => void;
}) {
  const steps = researchWorkflowSteps();
  const stepIndex = steps.findIndex((step) => step.id === state.stepId);
  const lensCounts = incidentFlows.reduce(
    (counts, flow) => ({
      ascending:
        counts.ascending + (flow.classification === "ascending" ? 1 : 0),
      descending:
        counts.descending + (flow.classification === "descending" ? 1 : 0),
      level: counts.level + (flow.classification === "level" ? 1 : 0),
    }),
    { ascending: 0, descending: 0, level: 0 },
  );
  const activeLens = topologyLensDefinition(lens.id);
  const topologyHeadline = activeLens.statusText.replace(
    "chosen generator",
    `s${lens.selectedGenerator ?? 0}`,
  );

  return (
    <div className="workflow-panel">
      <div
        className="workflow-steps"
        role="group"
        aria-label="Research workflow steps"
      >
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            aria-pressed={state.stepId === step.id}
            onClick={() => onSetStep(step.id)}
          >
            <span className="small-label">{index + 1}</span>
            {step.label}
          </button>
        ))}
      </div>
      <div className="guide-card">
        <span className="small-label">
          Step {Math.max(0, stepIndex) + 1} / {steps.length}
        </span>
        <h3>{activeStep.title}</h3>
        <p className="math-note">{activeStep.body}</p>
        <div className="button-row">
          <button
            type="button"
            className="button"
            disabled={stepIndex <= 0}
            onClick={() => onMove(-1)}
          >
            Previous
          </button>
          <button type="button" className="button" onClick={onRunStep}>
            {activeStep.primaryAction}
          </button>
          <button
            type="button"
            className="button"
            disabled={stepIndex >= steps.length - 1}
            onClick={() => onMove(1)}
          >
            Next
          </button>
        </div>
      </div>
      <div className="status-row">
        <span className="status-badge">
          {quotient ? quotient.name : "no quotient loaded"}
        </span>
        <span className="status-badge muted">
          cocycle {quotient?.game?.activeCocycleId ?? "not active"}
        </span>
        <span className="status-badge muted">
          vertex {selectedVertexId ?? "none"}
        </span>
      </div>
      <p className="math-note">
        Assignment: {assignmentLabel ?? "none"}. Incident edges:{" "}
        {lensCounts.ascending} ascending, {lensCounts.descending} descending,{" "}
        {lensCounts.level} level.
      </p>
      <p className="math-note">Boundary checks: {boundaryCheckSummary}.</p>
      <div className="topology-lens-readout">
        <strong>{activeLens.label}</strong>
        <p className="math-note">{topologyHeadline}</p>
        <div className="status-row">
          <span className="status-badge">
            {visibleCounts.nodes} visible vertices
          </span>
          <span className="status-badge muted">
            {visibleCounts.edges} visible edges
          </span>
          <span className="status-badge muted">
            {visibleCounts.cells} visible cells
          </span>
        </div>
        {localLinkHomology ? (
          <p className="math-note">
            Local link over F2: {localLinkHomology.connectedComponents}{" "}
            component
            {localLinkHomology.connectedComponents === 1 ? "" : "s"}, H~0=
            {localLinkHomology.reducedBetti0}, H1={localLinkHomology.betti1}.
          </p>
        ) : null}
        {topologyDiagnostics ? (
          <p className="math-note">
            Flag-link check {topologyDiagnostics.linkCondition.status};{" "}
            {topologyDiagnostics.linkCondition.missingFlagSimplices.length}{" "}
            missing simplex
            {topologyDiagnostics.linkCondition.missingFlagSimplices.length === 1
              ? ""
              : "es"}
            .
          </p>
        ) : null}
      </div>
      <div className="preset-grid" role="group" aria-label="Topology lenses">
        {topologyLensDefinitions().map((definition) => (
          <button
            key={definition.id}
            type="button"
            aria-pressed={lens.id === definition.id}
            title={definition.summary}
            onClick={() => onLens(definition.id)}
          >
            {definition.label}
          </button>
        ))}
      </div>
      {lens.id === "generator-star" ||
      lens.id === "generator-family" ||
      lens.id === "edge-star" ||
      lens.id === "cells-incident-edge" ? (
        <div
          className="chip-grid"
          role="group"
          aria-label="Topology lens generator focus"
        >
          {generators.map((generator, index) => (
            <button
              key={generator.id}
              type="button"
              className="chip-button"
              data-active={(lens.selectedGenerator ?? 0) === index}
              aria-pressed={(lens.selectedGenerator ?? 0) === index}
              onClick={() => onLensGenerator(index)}
            >
              {generator.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="button-row">
        <button type="button" className="button" onClick={onSave}>
          Save workflow run
        </button>
        <button type="button" className="button" onClick={onCompare}>
          Compare workflow runs
        </button>
        <button type="button" className="button" onClick={onExport}>
          Export reproducible bundle
        </button>
      </div>
      <p className="math-note">
        Notebook: {savedRunCount} saved runs; {comparisonStatus}.
      </p>
    </div>
  );
}

function GuidedInspectionPanel({
  state,
  onStart,
  onStep,
  onExit,
}: {
  state?: GuidedInspectionState;
  onStart: (id: GuidedInspectionId) => void;
  onStep: (delta: number) => void;
  onExit: () => void;
}) {
  const activeGuide = state ? guidedInspectionDefinition(state.id) : undefined;
  const activeStep = activeGuidedInspectionStep(state);

  return (
    <div className="guide-panel">
      <div className="preset-grid" aria-label="Guided inspection modes">
        {guidedInspectionDefinitions().map((guide) => (
          <button
            key={guide.id}
            type="button"
            aria-pressed={state?.id === guide.id}
            title={guide.summary}
            onClick={() => onStart(guide.id)}
          >
            {guide.label}
          </button>
        ))}
      </div>
      {activeGuide && activeStep ? (
        <div className="guide-card">
          <span className="small-label">
            Step {state!.stepIndex + 1} / {activeGuide.steps.length}
          </span>
          <h3>{activeStep.title}</h3>
          <p className="math-note">{activeStep.body}</p>
          <div className="button-row">
            <button
              type="button"
              className="button"
              disabled={state!.stepIndex === 0}
              onClick={() => onStep(-1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="button"
              disabled={state!.stepIndex >= activeGuide.steps.length - 1}
              onClick={() => onStep(1)}
            >
              Next
            </button>
            <button type="button" className="button" onClick={onExit}>
              Exit guide
            </button>
          </div>
        </div>
      ) : (
        <p className="math-note">
          Pick a guide to make the viewer choose a readable mathematical focus.
        </p>
      )}
    </div>
  );
}

function RelationFocusPanel({
  cell,
  pairKeyValue,
  pairOptions,
  relationWalk,
}: {
  cell?: DavisTwoCell;
  pairKeyValue?: string;
  pairOptions: ReturnType<typeof rankTwoPairDiagnostics>;
  relationWalk: ReturnType<typeof relationWalkEntries>;
}) {
  const option = pairOptions.find(
    (entry) =>
      entry.key === (cell ? pairKey(cell.generatorPair) : pairKeyValue),
  );

  if (!option) {
    return (
      <p className="math-note">
        Pick a finite generator pair in the pair matrix to isolate one rank-two
        relation.
      </p>
    );
  }

  return (
    <>
      <p className="math-note">
        Pair <strong>{option.label}</strong> has <strong>m={option.m}</strong>,
        so the Davis rank-two cell is a <strong>{option.polygonLabel}</strong>{" "}
        with {option.boundaryLength} alternating generator edges.
      </p>
      <p className="math-note">
        Visible cells: {option.visibleCount}/{option.totalCount}
        {option.clippedCount > 0
          ? `; ${option.clippedCount} clipped by the current view.`
          : "."}
      </p>
      {cell ? (
        <p className="math-note">
          Focused cell: <span className="matrix-key">{cell.id}</span>. Selected
          cell mode shows this polygon, its boundary, and the requested ghost
          shell.
        </p>
      ) : null}
      {relationWalk.length > 0 ? (
        <ol className="relation-walk-list">
          {relationWalk.map((entry) => (
            <li key={`${entry.index}:${entry.nodeId}`}>
              <span>{entry.label}</span>
              {entry.generatorLabelFromPrevious ? (
                <small> after {entry.generatorLabelFromPrevious}</small>
              ) : (
                <small> start</small>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

function YGammaReaderPanel({
  atlas,
  focusPreset,
  activeGeneratorPairKey,
  focusGenerator,
  peelMode,
  topologyMode,
  cameraBookmark,
  rankThreeFocusAvailable,
  onPreset,
  onFocusPair,
  onFocusGenerator,
  onPeelMode,
  onTopologyMode,
  onCameraBookmark,
}: {
  atlas: YGammaCellAtlas;
  focusPreset: YGammaFocusPreset;
  activeGeneratorPairKey?: string;
  focusGenerator: number;
  peelMode: YGammaPeelMode;
  topologyMode: boolean;
  cameraBookmark: YGammaCameraBookmark;
  rankThreeFocusAvailable: boolean;
  onPreset: (preset: YGammaFocusPreset) => void;
  onFocusPair: (key: string) => void;
  onFocusGenerator: (generator: number) => void;
  onPeelMode: (mode: YGammaPeelMode) => void;
  onTopologyMode: (enabled: boolean) => void;
  onCameraBookmark: (bookmark: YGammaCameraBookmark) => void;
}) {
  const relationEntries = yGammaPairMatrixEntries(atlas);
  const finiteEntries = relationEntries.filter(
    (entry) => entry.m !== undefined,
  );
  const hasM2 = relationEntries.some((entry) => entry.m === 2);
  const hasM3 = relationEntries.some((entry) => entry.m === 3);
  const presets: Array<{
    id: YGammaFocusPreset;
    label: string;
    disabled?: boolean;
  }> = [
    { id: "one-relation", label: "One relation" },
    {
      id: "rank-three-cell",
      label: "One rank-three cell",
      disabled: !rankThreeFocusAvailable,
    },
    { id: "around-generator", label: "Around generator" },
    { id: "m2-squares", label: "m=2 squares", disabled: !hasM2 },
    { id: "m3-hexagons", label: "m=3 hexagons", disabled: !hasM3 },
    { id: "full-skeleton", label: "Full 2-skeleton" },
  ];

  return (
    <>
      <div
        className="preset-grid ygamma-focus-presets"
        role="group"
        aria-label="Narrated Y_Gamma focus presets"
      >
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={focusPreset === preset.id}
            disabled={preset.disabled}
            onClick={() => onPreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="field inline-field">
        <label htmlFor="ygamma-focus-relation">Focus relation</label>
        <select
          id="ygamma-focus-relation"
          value={activeGeneratorPairKey ?? ""}
          onChange={(event) => {
            if (event.target.value) {
              onFocusPair(event.target.value);
            }
          }}
        >
          <option value="">No relation selected</option>
          {finiteEntries.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}: m={entry.m}, {entry.polygonLabel}
            </option>
          ))}
        </select>
      </div>
      <div className="field inline-field">
        <label htmlFor="ygamma-focus-generator">Around generator</label>
        <select
          id="ygamma-focus-generator"
          value={focusGenerator}
          onChange={(event) => onFocusGenerator(Number(event.target.value))}
        >
          {atlas.generatorCells.map((cell) => (
            <option key={cell.id} value={cell.generators[0] ?? 0}>
              {cell.label}
            </option>
          ))}
        </select>
      </div>
      <div
        className="segmented segmented-three"
        role="group"
        aria-label="Y_Gamma cell peeling"
      >
        {(
          [
            ["selected-face", "Face"],
            ["adjacent-faces", "Adjacent"],
            ["same-rank-three", "3-cell"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={peelMode === mode}
            onClick={() => onPeelMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="segmented segmented-three"
        role="group"
        aria-label="Y_Gamma camera bookmarks"
      >
        {(
          [
            ["front", "Front"],
            ["top", "Top"],
            ["rank-three-cell", "3-cell"],
            ["square-family", "Squares"],
            ["hexagon-family", "Hexagons"],
          ] as const
        ).map(([bookmark, label]) => (
          <button
            key={bookmark}
            type="button"
            aria-pressed={cameraBookmark === bookmark}
            onClick={() => onCameraBookmark(bookmark)}
          >
            {label}
          </button>
        ))}
      </div>
      <Toggle
        checked={topologyMode}
        label="Transparent topology mode"
        onChange={onTopologyMode}
      />
      <p className="math-note">
        This reader changes visibility, labels, camera, opacity, and the
        explanation together. The normal Cayley/Davis controls are under
        research panels.
      </p>
    </>
  );
}

function YGammaMiniAtlasOverlay({
  atlas,
  activeGeneratorPairKey,
  onFocusPair,
}: {
  atlas: YGammaCellAtlas;
  activeGeneratorPairKey?: string;
  onFocusPair: (key: string) => void;
}) {
  return (
    <aside className="ygamma-mini-atlas" aria-label="Y_Gamma relation picker">
      <strong>Relation picker</strong>
      <div className="ygamma-mini-grid">
        {yGammaPairMatrixEntries(atlas).map((entry) => (
          <button
            key={entry.key}
            type="button"
            disabled={entry.m === undefined}
            data-active={activeGeneratorPairKey === entry.key}
            onClick={() => onFocusPair(entry.key)}
            title={
              entry.m === undefined
                ? `${entry.label}: infinite pair, no rank-two cell`
                : `${entry.label}: m=${entry.m}, ${entry.polygonLabel}`
            }
          >
            <span>{entry.label}</span>
            <strong>{entry.m === undefined ? "inf" : `m=${entry.m}`}</strong>
            <small>{entry.polygonLabel}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}

function YGammaWhyPanel({
  relation,
  sceneCellId,
  focusPreset,
  peelMode,
}: {
  relation?: YGammaCellRecord;
  sceneCellId?: string;
  focusPreset: YGammaFocusPreset;
  peelMode: YGammaPeelMode;
}) {
  if (!relation || relation.m === undefined) {
    return (
      <p className="math-note">
        Hover a filled face or choose a finite pair in the relation picker to
        see why that relation cell is part of{" "}
        <span className="matrix-key">Y_Gamma</span>.
      </p>
    );
  }

  return (
    <>
      <p className="math-note">
        This face is the rank-two relation cell for generators{" "}
        <strong>{relation.generatorLabels.join(", ")}</strong>. Since{" "}
        <strong>m={relation.m}</strong>, its boundary is a{" "}
        <strong>{relation.polygonLabel}</strong> attached by the alternating
        word below.
      </p>
      <ol className="relation-walk-list">
        {relation.attachingWord.map((label, index) => (
          <li key={`${relation.id}:${index}`}>
            <span>
              {index}: {label}
            </span>
          </li>
        ))}
      </ol>
      <table className="inspector-table">
        <tbody>
          <tr>
            <th>Scene face</th>
            <td className="matrix-key">{sceneCellId ?? relation.id}</td>
          </tr>
          <tr>
            <th>Preset</th>
            <td>{yGammaPresetLabel(focusPreset)}</td>
          </tr>
          <tr>
            <th>Peeling</th>
            <td>{yGammaPeelLabel(peelMode)}</td>
          </tr>
          <tr>
            <th>Boundary</th>
            <td>{relation.boundaryLength} directed edge steps</td>
          </tr>
        </tbody>
      </table>
      <p className="math-note">
        The numbered labels in the 3D view label relation edges, not auxiliary
        construction vertices.
      </p>
    </>
  );
}

function YGammaTopologyChecklist({
  atlas,
  activeGeneratorPairKey,
  focusGenerator,
  rankThreeFocus,
  visibleCells,
}: {
  atlas: YGammaCellAtlas;
  activeGeneratorPairKey?: string;
  focusGenerator?: number;
  rankThreeFocus?: YGammaRankThreeFocus;
  visibleCells: Array<{
    id: string;
    generatorPair?: [number, number];
    sourceCellId?: string;
  }>;
}) {
  const selectedGeneratorSet = new Set<number>();
  const activePair = parsePairKey(activeGeneratorPairKey);
  if (activePair) {
    selectedGeneratorSet.add(activePair[0]);
    selectedGeneratorSet.add(activePair[1]);
  }
  if (focusGenerator !== undefined) {
    selectedGeneratorSet.add(focusGenerator);
  }
  for (const generator of rankThreeFocus?.generatorSet ?? []) {
    selectedGeneratorSet.add(generator);
  }

  const selectedLabels = [...selectedGeneratorSet]
    .sort((left, right) => left - right)
    .map(
      (generator) => atlas.generatorCells[generator]?.label ?? `s${generator}`,
    );
  const relevantFinitePairs = atlas.rankTwoCells.filter((cell) =>
    selectedGeneratorSet.size === 0
      ? true
      : cell.generators.some((generator) =>
          selectedGeneratorSet.has(generator),
        ),
  );
  const higherPresent = atlas.higherCells.some((cell) =>
    rankThreeFocus
      ? cell.id === rankThreeFocus.cellId
      : [...selectedGeneratorSet].every((generator) =>
          cell.generators.includes(generator),
        ),
  );

  return (
    <ul className="subset-list">
      <li>
        <span className="subset-rank">generators</span>
        <span>
          {selectedLabels.length > 0 ? selectedLabels.join(", ") : "all"}
        </span>
      </li>
      <li>
        <span className="subset-rank">finite pairs</span>
        <span>{relevantFinitePairs.length}</span>
      </li>
      <li>
        <span className="subset-rank">visible 2-cells</span>
        <span>
          {
            visibleCells.filter(
              (cell) =>
                cell.generatorPair !== undefined &&
                (cell.sourceCellId === undefined ||
                  cell.sourceCellId.startsWith("Y:higher:")),
            ).length
          }
        </span>
      </li>
      <li>
        <span className="subset-rank">higher cell</span>
        <span>
          {higherPresent ? "present in cell inventory" : "none for focus"}
        </span>
      </li>
      <li>
        <span className="subset-rank">local link</span>
        <span>
          {atlas.nerveVertices.length} vertices, {atlas.nerveSimplexCount}{" "}
          spherical simplices
        </span>
      </li>
    </ul>
  );
}

function yGammaPairMatrixEntries(atlas: YGammaCellAtlas): Array<{
  key: string;
  label: string;
  m?: number;
  polygonLabel: string;
}> {
  const relationByKey = new Map(
    atlas.rankTwoCells.map((cell) => [
      relationCellPairKey(cell.generators),
      cell,
    ]),
  );
  const entries: Array<{
    key: string;
    label: string;
    m?: number;
    polygonLabel: string;
  }> = [];
  for (let left = 0; left < atlas.generatorCells.length; left += 1) {
    for (
      let right = left + 1;
      right < atlas.generatorCells.length;
      right += 1
    ) {
      const key = relationCellPairKey([left, right]);
      const relation = relationByKey.get(key);
      entries.push({
        key,
        label: `${atlas.generatorCells[left]?.label ?? `s${left}`}-${atlas.generatorCells[right]?.label ?? `s${right}`}`,
        m: relation?.m,
        polygonLabel: relation?.polygonLabel ?? "absent",
      });
    }
  }
  return entries;
}

function yGammaPresetLabel(preset: YGammaFocusPreset): string {
  switch (preset) {
    case "one-relation":
      return "one relation";
    case "rank-three-cell":
      return "one rank-three cell";
    case "around-generator":
      return "all cells around one generator";
    case "m2-squares":
      return "m=2 square family";
    case "m3-hexagons":
      return "m=3 hexagon family";
    case "full-skeleton":
      return "full Y_Gamma 2-skeleton";
  }
}

function yGammaPeelLabel(peelMode: YGammaPeelMode): string {
  switch (peelMode) {
    case "selected-face":
      return "selected face only";
    case "adjacent-faces":
      return "selected face plus adjacent faces";
    case "same-rank-three":
      return "same rank-three cell";
    case "all":
      return "all visible faces";
  }
}

function YGammaNerveDiagnosticViewer({
  atlas,
  activeGeneratorPairKey,
  onFocusPair,
  onShowComplex,
}: {
  atlas: YGammaCellAtlas;
  activeGeneratorPairKey?: string;
  onFocusPair: (key: string) => void;
  onShowComplex: () => void;
}) {
  const width = 900;
  const height = 620;
  const center = { x: width / 2, y: height / 2 + 12 };
  const radius = Math.min(width, height) * 0.34;
  const positions = new Map(
    atlas.generatorCells.map((cell, index) => {
      const angle =
        -Math.PI / 2 + (2 * Math.PI * index) / atlas.generatorCells.length;
      return [
        cell.generators[0] ?? index,
        {
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle),
          label: cell.label,
          color: generatorPalette(index),
        },
      ] as const;
    }),
  );
  const activeRelation = atlas.rankTwoCells.find(
    (cell) => relationCellPairKey(cell.generators) === activeGeneratorPairKey,
  );

  return (
    <section
      className="ygamma-viewer"
      data-testid="ygamma-local-link-viewer"
      aria-label="2D Y_Gamma nerve schematic"
    >
      <div className="ygamma-viewer-header">
        <div>
          <h2>2D Nerve / Local-Link Schematic</h2>
          <p>
            This flat schematic is derived from spherical subsets. It explains
            the local link, but it is not the 3D Y_Gamma complex.
          </p>
        </div>
        <button type="button" className="button" onClick={onShowComplex}>
          Show 3D Y_Gamma model
        </button>
      </div>
      <svg
        className="ygamma-nerve-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`2D local-link schematic for ${atlas.systemName}`}
      >
        <circle
          className="ygamma-nerve-guide"
          cx={center.x}
          cy={center.y}
          r={radius}
        />
        {atlas.higherCells.map((cell) => {
          const points = cell.generators
            .map((generator) => positions.get(generator))
            .filter(
              (
                point,
              ): point is {
                x: number;
                y: number;
                label: string;
                color: string;
              } => Boolean(point),
            );
          return points.length >= 3 ? (
            <polygon
              key={cell.id}
              className="ygamma-nerve-simplex"
              points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            />
          ) : null;
        })}
        {atlas.rankTwoCells.map((cell) => {
          const [left, right] = cell.generators.map((generator) =>
            positions.get(generator),
          );
          if (!left || !right) {
            return null;
          }
          const key = relationCellPairKey(cell.generators);
          const active = key === activeGeneratorPairKey;
          return (
            <g
              key={cell.id}
              role="button"
              tabIndex={0}
              aria-label={`Focus ${cell.label} relation cell`}
              onClick={() => onFocusPair(key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onFocusPair(key);
                }
              }}
            >
              <line
                className="ygamma-nerve-chord-hit"
                x1={left.x}
                y1={left.y}
                x2={right.x}
                y2={right.y}
              />
              <line
                className={`ygamma-nerve-chord${active ? " is-active" : ""}`}
                x1={left.x}
                y1={left.y}
                x2={right.x}
                y2={right.y}
              />
              {active ? (
                <text
                  className="ygamma-nerve-relation-label"
                  x={(left.x + right.x) / 2}
                  y={(left.y + right.y) / 2 - 8}
                  textAnchor="middle"
                >
                  m={cell.m} {cell.polygonLabel}
                </text>
              ) : null}
            </g>
          );
        })}
        {atlas.generatorCells.map((cell, index) => {
          const point = positions.get(cell.generators[0] ?? index);
          if (!point) {
            return null;
          }
          return (
            <g key={cell.id}>
              <circle
                className="ygamma-nerve-node"
                cx={point.x}
                cy={point.y}
                r="18"
                style={{ fill: point.color }}
              />
              <text
                className="ygamma-nerve-node-label"
                x={point.x}
                y={point.y + 5}
                textAnchor="middle"
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="ygamma-viewer-footer">
        <p>
          The filled regions here are nerve simplices: they describe which
          generator subsets are spherical. They are not Euclidean faces of an
          embedded polytope, and they are not the 3D Y_Gamma model.
        </p>
        {activeRelation ? (
          <p>
            Active relation: <strong>{activeRelation.label}</strong>, m=
            {activeRelation.m}, so the corresponding Davis 2-cell has{" "}
            {activeRelation.boundaryLength} alternating edges. Attaching word:{" "}
            <span className="matrix-key">
              {activeRelation.attachingWord.join(" ")}
            </span>
            .
          </p>
        ) : (
          <p>Click a chord to focus a rank-two relation cell.</p>
        )}
      </div>
    </section>
  );
}

function YGammaAtlasPanel({
  atlas,
  active,
  activeGeneratorPairKey,
  rankThreeFocus,
  rankThreeFocusEnabled,
  onShowComplex,
  onShowNerve,
  onFocusPair,
  onFocusRankThree,
  onFocusRankThreePair,
}: {
  atlas: YGammaCellAtlas;
  active: boolean;
  activeGeneratorPairKey?: string;
  rankThreeFocus?: YGammaRankThreeFocus;
  rankThreeFocusEnabled: boolean;
  onShowComplex: () => void;
  onShowNerve: () => void;
  onFocusPair: (key: string) => void;
  onFocusRankThree: () => void;
  onFocusRankThreePair: (key: string) => void;
}) {
  const activeRelation = atlas.rankTwoCells.find(
    (cell) => relationCellPairKey(cell.generators) === activeGeneratorPairKey,
  );
  const higherRankGroups = atlas.rankGroups.filter((group) => group.rank >= 3);

  return (
    <>
      <p className="math-note">
        This atlas records the fundamental-domain cell complex{" "}
        <span className="matrix-key">Y_Gamma</span>: the base vertex, oriented
        generator arrows, and relation cells/polytopes. The 2D nerve schematic
        is a derived local-topology diagnostic, not the complex itself.
      </p>
      <div className="badge-row">
        <span className="status-badge">
          {active ? "3D model open" : "data panel only"}
        </span>
        <span className="status-badge muted">one quotient vertex</span>
        <span className="status-badge muted">relation polytopes</span>
      </div>
      <ul className="subset-list">
        {atlas.rankGroups.map((group) => (
          <li key={group.rank}>
            <span className="subset-rank">{group.label}</span>
            <span>
              {group.cells.length} cell{group.cells.length === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
      <p className="math-note">
        2D nerve/local link: {atlas.nerveVertices.length} generator vertices and{" "}
        {atlas.nerveSimplexCount} spherical simplex
        {atlas.nerveSimplexCount === 1 ? "" : "es"}.
      </p>
      <div className="label-legend" aria-label="Y_Gamma label meanings">
        {atlas.labelLegend.map((entry) => (
          <div key={entry.token} className="label-legend-row">
            <span className="matrix-key">{entry.token}</span>
            <span>{entry.meaning}</span>
          </div>
        ))}
      </div>
      <div className="button-row">
        <button type="button" className="button" onClick={onShowComplex}>
          Show 3D Y_Gamma model
        </button>
        <button type="button" className="button" onClick={onShowNerve}>
          Show 2D nerve schematic
        </button>
        <button
          type="button"
          className="button"
          disabled={!activeRelation}
          onClick={() => {
            if (activeRelation) {
              onFocusPair(relationCellPairKey(activeRelation.generators));
            }
          }}
        >
          Refocus active relation
        </button>
        <button
          type="button"
          className="button"
          disabled={!rankThreeFocus}
          aria-pressed={rankThreeFocusEnabled}
          onClick={onFocusRankThree}
        >
          Show full m=2/m=3 3-cell
        </button>
      </div>
      {rankThreeFocus ? (
        <>
          <p className="math-note">
            Full rank-three focus:{" "}
            <span className="matrix-key">{rankThreeFocus.cellId}</span> with{" "}
            <span className="matrix-key">
              {rankThreeFocus.pairKeys.join(" + ")}
            </span>
            . The 3D object shows the square and hexagon face families together;
            these buttons steer the camera and highlight one family without
            removing the other.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button"
              data-active={
                activeGeneratorPairKey === rankThreeFocus.pairKeys[0]
              }
              onClick={() => onFocusRankThreePair(rankThreeFocus.pairKeys[0])}
            >
              Look at m=2 squares
            </button>
            <button
              type="button"
              className="button"
              data-active={
                activeGeneratorPairKey === rankThreeFocus.pairKeys[1]
              }
              onClick={() => onFocusRankThreePair(rankThreeFocus.pairKeys[1])}
            >
              Look at m=3 hexagons
            </button>
          </div>
        </>
      ) : null}
      <div
        className="ygamma-relation-grid"
        role="group"
        aria-label="Y_Gamma rank-two relation cells"
      >
        {atlas.rankTwoCells.map((cell) => {
          const key = relationCellPairKey(cell.generators);
          return (
            <button
              key={cell.id}
              type="button"
              className="pair-matrix-button"
              data-active={activeGeneratorPairKey === key}
              onClick={() => onFocusPair(key)}
            >
              <strong>{cell.label}</strong>
              <small>
                m={cell.m}; {cell.polygonLabel}; {cell.boundaryLength} boundary
                steps
              </small>
              <small>{cell.id}</small>
            </button>
          );
        })}
      </div>
      {activeRelation ? (
        <p className="math-note">
          Active attaching word:{" "}
          <span className="matrix-key">
            {activeRelation.attachingWord.join(" ")}
          </span>
          . Each step returns to the same quotient vertex{" "}
          <span className="matrix-key">*</span>.
        </p>
      ) : null}
      {higherRankGroups.length > 0 ? (
        <div className="ygamma-higher-summary">
          <p className="math-note">
            Higher spherical cells are exact incidence records. Their 3D drawing
            is a readability model, not a certified Euclidean embedding.
          </p>
          <ul className="subset-list">
            {higherRankGroups.map((group) => (
              <li key={group.rank}>
                <span className="subset-rank">rank {group.rank}</span>
                <span>
                  {group.cells.length} cell{group.cells.length === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function relationCellPairKey(generators: number[]): string {
  return pairKey([generators[0] ?? 0, generators[1] ?? 0]);
}

function findSharedM2M3RankThreeFocus(
  atlas: YGammaCellAtlas,
): YGammaRankThreeFocus | undefined {
  const rankTwoByKey = new Map(
    atlas.rankTwoCells.map((cell) => [
      relationCellPairKey(cell.generators),
      cell,
    ]),
  );
  for (const cell of atlas.higherCells.filter((entry) => entry.rank === 3)) {
    const generatorSet = new Set(cell.generators);
    const pairCells = [...rankTwoByKey.values()].filter((pairCell) =>
      pairCell.generators.every((generator) => generatorSet.has(generator)),
    );
    const squarePairs = pairCells.filter((pairCell) => pairCell.m === 2);
    const hexagonPairs = pairCells.filter((pairCell) => pairCell.m === 3);
    for (const square of squarePairs) {
      for (const hexagon of hexagonPairs) {
        const sharedGeneratorCount = square.generators.filter((generator) =>
          hexagon.generators.includes(generator),
        ).length;
        if (sharedGeneratorCount === 1) {
          return {
            cellId: cell.id,
            generatorSet: [...cell.generators].sort(
              (left, right) => left - right,
            ),
            pairKeys: [
              relationCellPairKey(square.generators),
              relationCellPairKey(hexagon.generators),
              ...pairCells
                .map((pairCell) => relationCellPairKey(pairCell.generators))
                .filter(
                  (key) =>
                    key !== relationCellPairKey(square.generators) &&
                    key !== relationCellPairKey(hexagon.generators),
                )
                .sort(),
            ],
            mode: "full-cell",
            exposeConstructionVertices: true,
            showOnlyFundamentalFaces: false,
            restrictGeneratorSpine: false,
          };
        }
      }
    }
  }
  return undefined;
}

function generatorPalette(index: number): string {
  const colors = [
    "#2563eb",
    "#16a34a",
    "#dc2626",
    "#9333ea",
    "#d97706",
    "#0891b2",
    "#be123c",
    "#4f46e5",
    "#0f766e",
    "#7c3aed",
  ];
  return colors[index % colors.length];
}

function ResearchStatusPanel({
  system,
  ball,
  davisIncidence,
  sceneStats,
  desktopStatus,
  desktopMessage,
  sessionDirty,
  recentSessions,
  desktopTools,
  desktopJobs,
}: {
  system: CoxeterSystemInput;
  ball?: GeneratedCayleyBall;
  davisIncidence?: import("../types").DavisIncidencePoset;
  sceneStats: SceneRenderStats | null;
  desktopStatus: DesktopBridgeStatus | null;
  desktopMessage: string | null;
  sessionDirty: boolean;
  recentSessions: readonly ProjectSessionRecentFile[];
  desktopTools: readonly ExternalToolStatus[];
  desktopJobs: readonly DesktopJobRecord[];
}) {
  const status = system.dataStatus ?? "toy";
  const certification =
    ball?.metadata.certification?.status ??
    (system.certificate?.status === "passed" ? "certified" : "uncertified");
  const geometryCertificate =
    system.geometry?.certifiedModel?.certificate.status === "passed"
      ? "interval-certified"
      : "visualization";
  const geometryScopes =
    system.geometry?.certifiedModel?.certificate.scopes?.join(", ") ??
    "browser numerical placement";
  const externalChecks = system.checkerSummaries?.filter(
    (summary) => summary.status === "passed",
  ).length;

  return (
    <ul className="subset-list">
      <li>
        <span className="subset-rank">data</span>
        <span>{status}</span>
      </li>
      <li>
        <span className="subset-rank">cert</span>
        <span>{certification}</span>
      </li>
      <li>
        <span className="subset-rank">sources</span>
        <span>{system.sourceRefs?.length ?? 0}</span>
      </li>
      <li>
        <span className="subset-rank">geom</span>
        <span>{geometryCertificate}</span>
      </li>
      <li>
        <span className="subset-rank">geom scopes</span>
        <span>{geometryScopes}</span>
      </li>
      <li>
        <span className="subset-rank">checks</span>
        <span>{externalChecks ?? 0}</span>
      </li>
      <li>
        <span className="subset-rank">Davis</span>
        <span>
          {davisIncidence
            ? `${davisIncidence.records.length} records (${davisIncidence.status})`
            : "not computed"}
        </span>
      </li>
      <li>
        <span className="subset-rank">scene</span>
        <span>
          {sceneStats
            ? `${sceneStats.renderedNodes} nodes, ${sceneStats.renderedEdgeSegments} edges`
            : "not sampled"}
        </span>
      </li>
      <li>
        <span className="subset-rank">workspace</span>
        <span>{desktopStatus?.workspace.label ?? "checking workspace"}</span>
      </li>
      <li>
        <span className="subset-rank">runtime</span>
        <span>
          {desktopStatus
            ? desktopStatus.nativeAvailable
              ? "desktop bridge"
              : desktopStatus.runtime
            : "checking"}
        </span>
      </li>
      <li>
        <span className="subset-rank">session</span>
        <span>{sessionDirty ? "unsaved changes" : "saved"}</span>
      </li>
      <li>
        <span className="subset-rank">recent</span>
        <span>{recentSessions.length} sessions</span>
      </li>
      <li>
        <span className="subset-rank">tools</span>
        <span>
          {desktopTools.length > 0
            ? `${desktopTools.filter((tool) => tool.found).length}/${desktopTools.length} found`
            : "not checked"}
        </span>
      </li>
      <li>
        <span className="subset-rank">jobs</span>
        <span>
          {desktopJobs.length > 0
            ? `${desktopJobs[0].kind}: ${desktopJobs[0].status}`
            : "none"}
        </span>
      </li>
      {desktopMessage ? (
        <li>
          <span className="subset-rank">desktop</span>
          <span>{desktopMessage}</span>
        </li>
      ) : null}
    </ul>
  );
}

function WarningGroupsView({
  groups,
  showAll,
  onToggleShowAll,
}: {
  groups: WarningGroup[];
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const allWarnings = groups.flatMap((group) =>
    group.warnings.map((warning) => ({ group, warning })),
  );
  const visibleWarnings = showAll ? allWarnings : allWarnings.slice(0, 5);

  return (
    <>
      <ul className="warning-list">
        {visibleWarnings.map(({ group, warning }) => (
          <li key={`${group.id}:${warning}`}>
            <span className="warning-group-label">{group.label}</span>
            {warning}
          </li>
        ))}
      </ul>
      {allWarnings.length > 5 ? (
        <button type="button" className="button" onClick={onToggleShowAll}>
          {showAll ? "Show fewer warnings" : `Show all ${allWarnings.length}`}
        </button>
      ) : null}
    </>
  );
}

function ExperimentComparisonSummary({
  bundles,
}: {
  bundles: ExperimentBundle[];
}) {
  const comparison = compareLatestNotebookRuns(bundles);
  if (!comparison) {
    return null;
  }
  const deltas = Object.entries(comparison.countDeltas);

  return (
    <div className="experiment-summary">
      <p className="math-note">
        Compared newest run with the previous saved run. Status{" "}
        {comparison.statusChanged ? "changed" : "unchanged"}.
      </p>
      {deltas.length > 0 ? (
        <ul className="plain-list">
          {deltas.map(([key, value]) => (
            <li key={key}>
              {key}: {value && value > 0 ? "+" : ""}
              {value}
            </li>
          ))}
        </ul>
      ) : (
        <p className="math-note">No count changes.</p>
      )}
    </div>
  );
}

function higherCellSubsetOptions(
  proxies: DavisCellProxy[],
  subsets: Array<{
    id: string;
    generatorLabels: string[];
    generators: number[];
  }>,
) {
  const counts = new Map<string, number>();
  for (const proxy of proxies) {
    counts.set(
      proxy.sphericalSubsetId,
      (counts.get(proxy.sphericalSubsetId) ?? 0) + 1,
    );
  }

  return [...counts.entries()]
    .map(([subsetId, count]) => {
      const subset = subsets.find((entry) => entry.id === subsetId);
      return {
        subsetId,
        count,
        label:
          subset?.generatorLabels.join("-") ??
          subset?.generators.join("-") ??
          subsetId,
      };
    })
    .sort((left, right) => left.subsetId.localeCompare(right.subsetId));
}

function hasUsableGeometry(system: CoxeterSystemInput) {
  return Boolean(
    (system.geometry?.normalCoordinates && system.geometry.basepoint) ||
    system.geometry?.normalGram,
  );
}

function dataStatusWarnings(system: CoxeterSystemInput): string[] {
  switch (system.dataStatus) {
    case "placeholder":
      return [
        "This dataset is a placeholder and must not be used as verified mathematical data.",
      ];
    case "verified-source":
      return [
        "This dataset is transcribed from cited sources but is not marked certified by an exact checker.",
      ];
    case "certified":
      return [];
    case "toy":
    case undefined:
      return [
        "This dataset is a toy or educational fixture unless noted otherwise.",
      ];
  }
}

function firstFinitePairKey(system: CoxeterSystemInput): string | undefined {
  for (let left = 0; left < system.rank; left += 1) {
    for (let right = left + 1; right < system.rank; right += 1) {
      if (typeof system.coxeterMatrix[left]?.[right] === "number") {
        return pairKey([left, right]);
      }
    }
  }
  return undefined;
}

function resolveSystem(dataset: ViewerDataset): CoxeterSystemInput {
  switch (dataset.kind) {
    case "coxeter-system":
      return dataset.system;
    case "generated-graph":
      return (
        dataset.sourceSystem ?? syntheticSystemForGeneratedBall(dataset.ball)
      );
    case "quotient-complex":
      return (
        dataset.sourceSystem ??
        dataset.quotient.sourceSystem ??
        syntheticSystemForQuotient(dataset.quotient)
      );
  }
}

function withShellLayout(ball: GeneratedCayleyBall): GeneratedCayleyBall {
  const needsLayout = ball.nodes.some((node) => node.position === undefined);
  return needsLayout
    ? { ...ball, nodes: assignShellLayout(ball.nodes, { shellSpacing: 1.25 }) }
    : ball;
}

function emptyLocalLink(nodeId: string) {
  return {
    nodeId,
    vertices: [],
    simplices: [],
    sphericalSubsets: [],
    warnings: [],
  };
}

function budgetVisibleCells(
  cells: DavisTwoCell[],
  selectedNodeId: string | undefined,
  maxCells: number,
  activePairKey: string | undefined,
  localNodeIds: Set<string>,
) {
  if (cells.length <= maxCells) {
    return { cells, omitted: 0 };
  }

  const sorted = [...cells].sort((left, right) => {
    const leftSelected =
      selectedNodeId !== undefined &&
      left.boundaryNodeIds.includes(selectedNodeId);
    const rightSelected =
      selectedNodeId !== undefined &&
      right.boundaryNodeIds.includes(selectedNodeId);
    if (leftSelected !== rightSelected) {
      return leftSelected ? -1 : 1;
    }
    const leftActive = activePairKey === pairKey(left.generatorPair);
    const rightActive = activePairKey === pairKey(right.generatorPair);
    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1;
    }
    const leftLocal = left.boundaryNodeIds.some((nodeId) =>
      localNodeIds.has(nodeId),
    );
    const rightLocal = right.boundaryNodeIds.some((nodeId) =>
      localNodeIds.has(nodeId),
    );
    if (leftLocal !== rightLocal) {
      return leftLocal ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });

  return {
    cells: sorted.slice(0, maxCells),
    omitted: sorted.length - maxCells,
  };
}

function cellMatchesFocus(
  cell: DavisTwoCell,
  focusMode: CellFocusMode,
  selectedNodeId: string | undefined,
  activePairKey: string | undefined,
  selectedCellId: string | undefined,
) {
  if (focusMode === "all-local") {
    return true;
  }
  if (focusMode === "selected-cell") {
    return selectedCellId ? cell.id === selectedCellId : false;
  }
  if (focusMode === "selected-pair") {
    return activePairKey
      ? pairKey(cell.generatorPair) === activePairKey
      : selectedNodeId
        ? cell.boundaryNodeIds.includes(selectedNodeId)
        : true;
  }
  return selectedNodeId ? cell.boundaryNodeIds.includes(selectedNodeId) : true;
}

function chooseFocusedRankTwoCell(input: {
  cells: DavisTwoCell[];
  selectedCell: DavisTwoCell | undefined;
  activePairKey: string | undefined;
  selectedNodeId: string | undefined;
}) {
  if (input.selectedCell) {
    return input.selectedCell;
  }

  const candidates = input.activePairKey
    ? input.cells.filter(
        (cell) => pairKey(cell.generatorPair) === input.activePairKey,
      )
    : input.cells;
  return [...candidates].sort((left, right) => {
    const leftIncident =
      input.selectedNodeId !== undefined &&
      left.boundaryNodeIds.includes(input.selectedNodeId);
    const rightIncident =
      input.selectedNodeId !== undefined &&
      right.boundaryNodeIds.includes(input.selectedNodeId);
    if (leftIncident !== rightIncident) {
      return leftIncident ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  })[0];
}

function mergeSets<T>(
  first: Set<T> | undefined,
  second: Set<T> | undefined,
): Set<T> | undefined {
  if (!first && !second) {
    return undefined;
  }
  return new Set([...(first ?? []), ...(second ?? [])]);
}

function centroid3(
  points: Array<[number, number, number]>,
): [number, number, number] | undefined {
  if (points.length === 0) {
    return undefined;
  }
  const sum = points.reduce<[number, number, number]>(
    (accumulator, point) => [
      accumulator[0] + point[0],
      accumulator[1] + point[1],
      accumulator[2] + point[2],
    ],
    [0, 0, 0],
  );
  return [
    sum[0] / points.length,
    sum[1] / points.length,
    sum[2] / points.length,
  ];
}

function yGammaCameraOffsetForFocus(
  bookmark: YGammaCameraBookmark,
  focusCells: SceneCell[],
  positionsByNodeId: Map<string, [number, number, number] | undefined>,
): [number, number, number] {
  if (bookmark === "front" && focusCells.length === 1) {
    const boundary = focusCells[0].boundaryNodeIds
      .map((nodeId) => positionsByNodeId.get(nodeId))
      .filter(
        (position): position is [number, number, number] =>
          position !== undefined,
      );
    const normal = newellNormal3(boundary);
    if (normal) {
      const tangent = normalize3(
        subtract3(boundary[1] ?? boundary[0], boundary[0]),
      );
      // A pure face-on view makes lifted relation sheets look flat. This
      // oblique offset keeps the selected 2m-gon readable without changing the
      // combinatorial boundary it represents.
      const oblique = normalize3([
        normal[0] * 0.82 + tangent[0] * 0.42,
        normal[1] * 0.82 + tangent[1] * 0.42,
        normal[2] * 0.82 + tangent[2] * 0.42 + 0.34,
      ]);
      return scale3(oblique, 17);
    }
  }

  return bookmark === "front"
    ? [0, -15, 4.5]
    : bookmark === "top"
      ? [0.2, -0.2, 17]
      : bookmark === "square-family"
        ? [6, 4, 13]
        : bookmark === "hexagon-family"
          ? [7, -12, 7]
          : [10, -12, 8];
}

function newellNormal3(
  points: Array<[number, number, number]>,
): [number, number, number] | undefined {
  if (points.length < 3) {
    return undefined;
  }
  let normal: [number, number, number] = [0, 0, 0];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    normal = [
      normal[0] + (current[1] - next[1]) * (current[2] + next[2]),
      normal[1] + (current[2] - next[2]) * (current[0] + next[0]),
      normal[2] + (current[0] - next[0]) * (current[1] + next[1]),
    ];
  }
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  return length > 1e-9 ? scale3(normal, 1 / length) : undefined;
}

function subtract3(
  left: [number, number, number],
  right: [number, number, number],
): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function normalize3(
  vector: [number, number, number],
): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return length > 1e-9
    ? [vector[0] / length, vector[1] / length, vector[2] / length]
    : [1, 0, 0];
}

function scale3(
  vector: [number, number, number],
  scalar: number,
): [number, number, number] {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function maxBoundaryDistance(
  nodeIds: string[],
  localLayout:
    | {
        distances: Map<string, number>;
      }
    | undefined,
) {
  if (!localLayout) {
    return undefined;
  }
  let maxDistance = 0;
  for (const nodeId of nodeIds) {
    maxDistance = Math.max(
      maxDistance,
      localLayout.distances.get(nodeId) ?? maxDistance,
    );
  }
  return maxDistance;
}

function groupSphericalSubsetsByRank<T extends { rank: number }>(
  subsets: T[],
): Array<[number, T[]]> {
  const groups = new Map<number, T[]>();
  for (const subset of subsets) {
    groups.set(subset.rank, [...(groups.get(subset.rank) ?? []), subset]);
  }
  return [...groups.entries()].sort(([left], [right]) => left - right);
}

function QuotientGamePanel({
  quotient,
  selectedVertexId,
}: {
  quotient: import("../quotient").QuotientComplex;
  selectedVertexId?: string;
}) {
  const status = quotientManifoldStatus(quotient);
  const assignment = resolveIntegerEdgeAssignment(
    quotient.game,
    quotient.edges,
    quotient.sourceSystem?.rank ?? quotient.generatorRank,
  );
  const checks = validateRankTwoCocycle(
    quotient.twoCells,
    quotient.edges,
    assignment.edgeStates,
  );
  const flows = selectedVertexId
    ? classifyIncidentEdges(
        selectedVertexId,
        quotient.edges,
        assignment.edgeStates,
      )
    : [];

  return (
    <>
      <p className="math-note">
        {status.label}: {status.reason}
      </p>
      <p className="math-note">
        Assignment: {assignment.label} ({assignment.source}).
      </p>
      <ul className="subset-list">
        <li>
          <span className="subset-rank">
            {quotient.schreierCertificate?.status ?? "not supplied"}
          </span>
          <span>Schreier action certificate</span>
        </li>
        <li>
          <span className="subset-rank">
            {quotient.torsionFreeCertificate?.status ?? "not supplied"}
          </span>
          <span>Torsion-free certificate</span>
        </li>
        <li>
          <span className="subset-rank">
            {quotient.verifier?.status ?? "not supplied"}
          </span>
          <span>External verifier summary</span>
        </li>
      </ul>
      {[...assignment.warnings, ...assignment.errors].length > 0 ? (
        <ul className="warning-list">
          {[...assignment.warnings, ...assignment.errors].map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      <p className="math-note">
        Boundary checks: {checks.checks.filter((check) => check.ok).length}/
        {checks.checks.length} rank-two cells pass the displayed integer labels.
      </p>
      {checks.errors.length > 0 ? (
        <ul className="warning-list">
          {checks.errors.slice(0, 6).map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      <ul className="subset-list">
        {checks.checks.slice(0, 8).map((check) => (
          <li key={check.cellId}>
            <span className="subset-rank">{check.ok ? "closed" : "open"}</span>
            <span>
              {check.cellId}: sum {check.boundarySum},{" "}
              {check.actualBoundaryLength}/{check.expectedBoundaryLength}{" "}
              boundary vertices
            </span>
          </li>
        ))}
      </ul>
      <ul className="subset-list">
        {flows.slice(0, 8).map((flow) => (
          <li key={flow.edgeId}>
            <span className="subset-rank">{flow.classification}</span>
            <span>
              {flow.edgeId} to {flow.neighborId}: {flow.valueAwayFromVertex}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function readStoredViewPreset(): ViewPresetId | undefined {
  const value = window.localStorage?.getItem(viewPresetStorageKey);
  return viewPresetOptions.some((option) => option.id === value)
    ? (value as ViewPresetId)
    : undefined;
}

function readStoredColorScheme(): ColorScheme | undefined {
  const value = window.localStorage?.getItem(colorSchemeStorageKey);
  return value === "light" || value === "dark" ? value : undefined;
}

function isQuotientLinkLens(lensId: TopologyLensId): boolean {
  return (
    lensId === "ascending-link" ||
    lensId === "descending-link" ||
    lensId === "level-link" ||
    lensId === "full-local-link"
  );
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
