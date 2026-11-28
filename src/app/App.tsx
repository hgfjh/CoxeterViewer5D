import {
  CircleQuestionMark,
  Download,
  Expand,
  FileJson,
  ImageDown,
  Minimize2,
  Moon,
  Sun,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Panel } from "../components/Panel";
import { Stat } from "../components/Stat";
import { Toggle } from "../components/Toggle";
import type { CoverCompressionResult } from "../compression";
import {
  parseQuotientComplex,
  QuotientValidationCancelledError,
  type QuotientComplex,
} from "../quotient";
import {
  SceneView,
  type SceneCell,
  type SceneEdge,
  type SceneGenerator,
  type SceneNode,
} from "../render/SceneView";
import type { GeneratedCayleyBall, HyperbolicProjection } from "../types";
import {
  FullDavisCertificationClient,
  LawfulCertificationClient,
  type FullDavisCoorientationSearchResult,
  type LawfulCoorientationSearchResult,
} from "../fibering";
import {
  buildC44Psl27Cover,
  buildIdealHyperbolic3CubeS4Cover,
} from "../torsionFree";
import type {
  DesktopBridge,
  DesktopExportRequest,
  DesktopMenuCommand,
} from "../desktop/bridge";
import {
  deriveMorseLinks,
  evaluateLawfulSubcomplex,
  findWallSystem,
  WallSearchClient,
  type MaximumLawfulSearchResult,
} from "../walls";
import I2_5IdentityQuotient from "../examples/I2_5_identity_quotient.json";
import { buildHatXScene } from "./compressedComplexScene";
import {
  listBarXRelationFamilies,
  parseBarXRelationFamilyId,
  type BarXRelationFamilyId,
} from "./barXRelationFamilies";
import {
  COVER_WALL_MODEL_ORDER as MODEL_ORDER,
  parseCoverWallViewSession,
  type CoverWallViewSession,
} from "./coverWallSession";
import { CoversWallsPanel } from "./CoversWallsPanel";
import { buildDefiningGraphScene } from "./definingGraphScene";
import { bundledExampleById, bundledExamples } from "./exampleRegistry";
import {
  createGenerationClient,
  GenerationSupersededError,
} from "./generationClient";
import {
  modelExplanations,
  startHereActions,
  type StartHereActionId,
  type TopLevelModelId,
} from "./orientation";
import { GuidedTour, type TourCloseReason } from "./onboarding/GuidedTour";
import { localGraphDistances } from "./localFocus";
import { projectionAvailability } from "./sourceComplexScene";
import {
  describeStatus,
  describeTerminationReason,
  pluralize,
} from "./statusText";
import { tourSteps, type AppTourStep } from "./onboarding/tourSteps";
import { shouldAutoStartTour, writeTourRecord } from "./onboarding/tourStorage";
import { ResearchInspector, type InspectorSummary } from "./ResearchInspector";
import { compactResearchCatalogueNotices } from "./researchUi";
import {
  buildSourceComplexBase,
  SOURCE_SELECTED_NODE_SCALE,
  withSourceSelection,
} from "./sourceComplexScene";
import { buildWallScene, wallLabel } from "./wallScene";
import { CellAtlas } from "./CellAtlas";
import {
  buildUnitCellScene,
  cachedUnitCellBase,
  unitCellBadge,
  unitCellInspectorSummary,
} from "./unitCellScene";
import { createQuotientValidationClient } from "./quotientValidationClient";
import { CoverAnalysisClient } from "./coverAnalysisClient";
import { useCoverAnalysis } from "./useCoverAnalysis";
import { measure } from "./perfMarks";
import {
  createRenderStatsStore,
  type RenderStatsStore,
} from "./renderStatsStore";
import {
  buildAutomaticCoverSearchPlan,
  certifyAutomaticCoverArtifact,
  DEFAULT_AUTOMATIC_COVER_SEARCH,
  parseAutomaticCoverSearchArtifact,
  type AutomaticCoverSearchOptions,
  type AutomaticCoverSearchState,
} from "./torsionFreeCoverDiscovery";

type UiMode = "teaching" | "research";
type ColorScheme = "light" | "dark";

interface GenerationState {
  ball?: GeneratedCayleyBall;
  pending: boolean;
  error?: string;
  generationMs?: number;
  requestId: number;
}

interface RenderScene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  cells: SceneCell[];
  generators: SceneGenerator[];
  warnings: string[];
  referenceBallRadius?: number;
}

const DEFAULT_COVER = parseQuotientComplex(I2_5IdentityQuotient);
// Stable reference: a fresh [0, 0, 0] per render re-ran the renderer update.
const SCENE_ORIGIN: [number, number, number] = [0, 0, 0];
const IDEAL_3_CUBE_EXAMPLE_ID = "ideal_hyperbolic_3_cube_m3";
const C44_TETRAHEDRON_EXAMPLE_ID = "compact_3_tetrahedron_c44_2233";
const COLOR_SCHEME_KEY = "coxeter-viewer:color-scheme";

let desktopBridgePromise: Promise<DesktopBridge> | undefined;
let ideal3CubeS4Cover: QuotientComplex | undefined;
let c44Psl27Cover: QuotientComplex | undefined;

function getC44Psl27Cover(): QuotientComplex {
  c44Psl27Cover ??= buildC44Psl27Cover(
    bundledExampleById(C44_TETRAHEDRON_EXAMPLE_ID).system,
  );
  return c44Psl27Cover;
}

function getIdeal3CubeS4Cover(): QuotientComplex {
  ideal3CubeS4Cover ??= buildIdealHyperbolic3CubeS4Cover(
    bundledExampleById(IDEAL_3_CUBE_EXAMPLE_ID).system,
  );
  return ideal3CubeS4Cover;
}

function loadDesktopBridge(): Promise<DesktopBridge> {
  desktopBridgePromise ??= import("../desktop/bridge").then((module) =>
    module.createDesktopBridge(),
  );
  return desktopBridgePromise;
}

function hasNativeDesktopRuntime(): boolean {
  const runtimeWindow = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return (
    runtimeWindow.__TAURI_INTERNALS__ !== undefined ||
    runtimeWindow.__TAURI__ !== undefined
  );
}

export function App() {
  const [uiMode, setUiMode] = useState<UiMode>("teaching");
  const [colorScheme, setColorScheme] = useState<ColorScheme>(readColorScheme);
  const [viewerOnly, setViewerOnly] = useState(false);
  // hat X and bar X can be read as a 3D drawing or as a flat atlas of their
  // relation cells. Session state only; the default is the 3D drawing.
  const [coverView, setCoverView] = useState<"3d" | "atlas">("3d");
  // With a cover loaded, the Davis model can show the Cayley ball or a unit
  // cell (fundamental domain of H) with its gluings. Session state only.
  const [davisView, setDavisView] = useState<"ball" | "unit-cell">("ball");
  const [showUnitCellCopies, setShowUnitCellCopies] = useState(false);
  const [tourOpen, setTourOpen] = useState(shouldAutoStartTour);
  const [exampleId, setExampleId] = useState("I2_5");
  const [model, setModel] = useState<TopLevelModelId>("bar-x");
  const [radius, setRadius] = useState(5);
  const [projection, setProjection] =
    // Klein is the default: hyperbolic geodesics are straight segments there,
    // so the drawn edges between chambers are true geodesics.
    useState<HyperbolicProjection>("klein-axes");
  const [coverSource, setCoverSource] = useState<QuotientComplex | undefined>(
    DEFAULT_COVER,
  );
  const [coverImportError, setCoverImportError] = useState<string>();
  const [coverDiscoveryOptions, setCoverDiscoveryOptions] =
    useState<AutomaticCoverSearchOptions>(DEFAULT_AUTOMATIC_COVER_SEARCH);
  const [coverDiscovery, setCoverDiscovery] =
    useState<AutomaticCoverSearchState>({
      status: "ready",
      message:
        "The bundled I2(5) regular action is ready. Run discovery to reproduce it with GAP.",
    });
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedCellId, setSelectedCellId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [selectedWallId, setSelectedWallId] = useState<string>();
  const [barRelationFamily, setBarRelationFamily] =
    useState<BarXRelationFamilyId>("shared-complex");
  const [wallSigns, setWallSigns] = useState<Record<string, 1 | -1>>({});
  const [showCells, setShowCells] = useState(true);
  const [showWalls, setShowWalls] = useState(true);
  const [wallDisplayMode, setWallDisplayMode] = useState<"all" | "selected">(
    "all",
  );
  const [showInducedDirections, setShowInducedDirections] = useState(true);
  const [colorEdgesByWall, setColorEdgesByWall] = useState(true);
  const [showDiscardedCells, setShowDiscardedCells] = useState(true);
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [focusOnSelection, setFocusOnSelection] = useState(false);
  // Crowded cover scenes fill only the cells in focus and draw the rest
  // as faint outlines; these switch back to the dense drawings.
  const [fillAllCells, setFillAllCells] = useState(false);
  const [bigonsAsTwoEdges, setBigonsAsTwoEdges] = useState(false);
  const [allInducedArrows, setAllInducedArrows] = useState(false);
  const [linkLens, setLinkLens] = useState<"none" | "ascending" | "descending">(
    "none",
  );
  const [searchRunning, setSearchRunning] = useState(false);
  const [searchResult, setSearchResult] = useState<MaximumLawfulSearchResult>();
  const [searchError, setSearchError] = useState<string>();
  const [fiberingSearchRunning, setFiberingSearchRunning] = useState(false);
  const [fiberingSearchResult, setFiberingSearchResult] =
    useState<FullDavisCoorientationSearchResult>();
  const [lawfulFiberingSearchResult, setLawfulFiberingSearchResult] =
    useState<LawfulCoorientationSearchResult>();
  const [fiberingSearchError, setFiberingSearchError] = useState<string>();
  const [generation, setGeneration] = useState<GenerationState>({
    pending: true,
    requestId: 0,
  });
  const renderStatsStore = useMemo(() => createRenderStatsStore(), []);
  const [sceneLayoutVersion, setSceneLayoutVersion] = useState(0);
  const [desktopMessage, setDesktopMessage] = useState<string>();
  const capturePngRef = useRef<(() => Promise<string>) | undefined>(undefined);
  const desktopMenuHandlerRef = useRef<(command: DesktopMenuCommand) => void>(
    () => undefined,
  );
  const coverDiscoveryRunRef = useRef(0);
  const handleCapturePngReady = useCallback(
    (capture: (() => Promise<string>) | undefined) => {
      capturePngRef.current = capture;
    },
    [],
  );
  const generationClient = useMemo(() => createGenerationClient(), []);
  const wallSearchClient = useMemo(() => new WallSearchClient(), []);
  const fullDavisCertificationClient = useMemo(
    () => new FullDavisCertificationClient(),
    [],
  );
  const lawfulCertificationClient = useMemo(
    () => new LawfulCertificationClient(),
    [],
  );
  const quotientValidationClient = useMemo(
    () => createQuotientValidationClient(),
    [],
  );
  const coverAnalysisClient = useMemo(() => new CoverAnalysisClient(), []);
  const quotientImportProgress = useSyncExternalStore(
    quotientValidationClient.subscribe,
    quotientValidationClient.getSnapshot,
    quotientValidationClient.getSnapshot,
  );

  const example = bundledExampleById(exampleId);
  // A finite action carries the Coxeter system whose presentation complex it
  // covers. Once imported, that source must drive every model, not only the
  // cover views; otherwise Gamma and Davis would silently describe a stale
  // catalogue example.
  const system = coverSource?.sourceSystem ?? example.system;
  const coverDiscoveryPlan = useMemo(
    () =>
      measure("cover-discovery-plan", () =>
        buildAutomaticCoverSearchPlan(system, coverDiscoveryOptions),
      ),
    [coverDiscoveryOptions, system],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = colorScheme;
  }, [colorScheme]);

  // Only an explicit toggle is remembered. Writing on every render would store
  // the OS default on the first visit and stop following later OS changes.
  const toggleColorScheme = useCallback(() => {
    setColorScheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(COLOR_SCHEME_KEY, next);
      } catch {
        // Storage blocked: the theme still applies for this visit.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      generationClient.dispose();
      wallSearchClient.dispose();
      lawfulCertificationClient.dispose();
      fullDavisCertificationClient.dispose();
      quotientValidationClient.dispose();
      coverAnalysisClient.dispose();
    };
  }, [
    coverAnalysisClient,
    fullDavisCertificationClient,
    generationClient,
    lawfulCertificationClient,
    quotientValidationClient,
    wallSearchClient,
  ]);

  useEffect(() => {
    // The bridge chunk only matters inside the desktop shell; browsers skip it.
    if (!hasNativeDesktopRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void loadDesktopBridge()
      .then((bridge) =>
        bridge.onMenuCommand((command) => {
          if (!disposed) desktopMenuHandlerRef.current(command);
        }),
      )
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      })
      .catch((error) => {
        if (!disposed) {
          setDesktopMessage(
            `Desktop menu unavailable: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    void generationClient
      .generate({
        datasetId: example.id,
        system,
        options: {
          radius,
          maxRadius: 8,
          maxNodes: 12_000,
          maxEdges: 45_000,
          matrixKeyPrecision: 10,
        },
      })
      .then((result) => {
        if (!active) return;
        setGeneration({
          ball: result.ball,
          pending: false,
          requestId: result.requestId,
          generationMs: result.generationMs,
        });
      })
      .catch((error) => {
        if (!active || error instanceof GenerationSupersededError) return;
        setGeneration((current) => ({
          ...current,
          pending: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      });
    return () => {
      active = false;
    };
  }, [example.id, generationClient, radius, system]);

  const coverState = useCoverAnalysis(
    coverSource,
    wallSigns,
    coverAnalysisClient,
  );
  const cover = coverState.cover;
  // Shown where a cover view would be: the build error, the import error,
  // or a note that a large cover is still being analysed.
  const coverMessage =
    coverState.coverError ??
    coverImportError ??
    (coverState.analysisPending
      ? "Building the cover, walls and Schreier presentation in a background worker..."
      : undefined);
  const barRelationFamilies = useMemo(
    () =>
      cover
        ? measure("bar-relation-families", () =>
            listBarXRelationFamilies(cover),
          )
        : [],
    [cover],
  );
  const activeBarRelationFamily: BarXRelationFamilyId =
    barRelationFamily === "all" || barRelationFamily === "shared-complex"
      ? barRelationFamily
      : barRelationFamilies.some((family) => family.id === barRelationFamily)
        ? barRelationFamily
        : "shared-complex";
  const activeBarRelationPair = useMemo(
    () => parseBarXRelationFamilyId(activeBarRelationFamily),
    [activeBarRelationFamily],
  );
  const spreadBarRelationCells = activeBarRelationFamily !== "shared-complex";
  const wallSystem = coverState.wallSystem;
  const activeSelectedWallId = wallSystem?.walls.some(
    (wall) => wall.id === selectedWallId,
  )
    ? selectedWallId
    : wallSystem?.walls[0]?.id;
  const activeBarVertexId = cover?.barX.vertices.some(
    (vertex) => vertex.id === selectedNodeId,
  )
    ? selectedNodeId
    : cover?.barX.vertices[0]?.id;

  const {
    coorientation,
    lawfulSubcomplex,
    morseLinks,
    virtualFiberingCertificate,
  } = coverState;

  // Each model's scene is built only while that model is shown; a click in
  // the Davis view must not rebuild hidden cover scenes, and vice versa.
  const sourceModelActive = model === "davis" || model === "projection";
  const unitCellActive =
    model === "davis" && davisView === "unit-cell" && Boolean(cover);
  const unitCellBase = useMemo(
    () =>
      unitCellActive && cover
        ? measure("unit-cell-base", () => cachedUnitCellBase(cover))
        : undefined,
    [cover, unitCellActive],
  );
  const geometricSource = model === "projection";
  // Projection needs validated reflection data. Without it the button is
  // disabled instead of drawing a layout inside a ball it does not live in.
  const projectionStatus = useMemo(
    () => projectionAvailability(system),
    [system],
  );
  // Short on-canvas reminders of what the picture is. The full caveats stay in
  // the Caveats panel; these name the two that most change how to read it.
  const viewerBadges = useMemo(() => {
    const badges: string[] = [];
    const dimension = system.geometry?.dimension;
    if (model === "projection" && system.geometry) {
      const modelName = projection.startsWith("klein")
        ? "Klein model"
        : "Poincaré ball";
      const axes = projection.endsWith("pca") ? "PCA" : "coordinate axes";
      badges.push(
        dimension && dimension > 3
          ? `${modelName}, ${axes}: projected from H^${dimension} to 3D`
          : `${modelName}, ${axes}`,
      );
    }
    if (model === "projection" && !projectionStatus.ok) {
      badges.push("No reflection data: showing the Davis drawing instead");
    }
    const unitCellText = unitCellBase ? unitCellBadge(unitCellBase) : undefined;
    if (unitCellText) badges.push(unitCellText);
    if (model === "davis" && system.geometry) {
      badges.push("Positions from the hyperbolic reflection orbit (a drawing)");
    } else if (model === "davis") {
      badges.push("Positions are a drawing; incidence is exact");
    }
    if (
      sourceModelActive &&
      !unitCellBase &&
      generation.ball?.metadata.deduplication === "rounded-matrix"
    ) {
      badges.push("Elements identified by rounded matrices (approximate)");
    }
    return badges;
  }, [
    model,
    projection,
    projectionStatus.ok,
    sourceModelActive,
    system.geometry,
    generation.ball,
    unitCellBase,
  ]);
  // Placement and labels depend only on (system, ball, projection).  The
  // selected node is highlighted by the renderer, so clicks reuse this base.
  const sourceBase = useMemo(
    () =>
      !sourceModelActive || unitCellActive
        ? undefined
        : generation.ball
          ? measure("source-scene", () =>
              buildSourceComplexBase(system, generation.ball!, {
                geometric: geometricSource,
                projection,
              }),
            )
          : emptyScene(generation.error),
    [
      generation.ball,
      generation.error,
      geometricSource,
      projection,
      sourceModelActive,
      system,
      unitCellActive,
    ],
  );
  const sourceScene = useMemo(
    () =>
      sourceBase ? withSourceSelection(sourceBase, selectedCellId) : undefined,
    [selectedCellId, sourceBase],
  );
  const unitCellScene = useMemo(
    () =>
      unitCellBase
        ? buildUnitCellScene(unitCellBase, {
            showCopies: showUnitCellCopies,
            colorScheme,
            selectedNodeId,
            selectedEdgeId,
            selectedCellId,
          })
        : undefined,
    [
      colorScheme,
      selectedCellId,
      selectedEdgeId,
      selectedNodeId,
      showUnitCellCopies,
      unitCellBase,
    ],
  );
  const gammaScene = useMemo(
    () => (model === "gamma" ? buildDefiningGraphScene(system) : undefined),
    [model, system],
  );
  const hatScene = useMemo(
    () =>
      model !== "hat-x"
        ? undefined
        : cover
          ? measure("hat-scene", () =>
              buildHatXScene(cover.hatX, {
                selectedVertexId: selectedNodeId,
                selectedCellId,
                showRelationCells: showCells,
                cellEmphasis: fillAllCells ? "all" : "focus",
                mergeBigons: !bigonsAsTwoEdges,
              }),
            )
          : emptyScene(coverMessage),
    [
      bigonsAsTwoEdges,
      cover,
      coverMessage,
      fillAllCells,
      model,
      selectedCellId,
      selectedNodeId,
      showCells,
    ],
  );
  const barScene = useMemo(
    () =>
      model !== "bar-x"
        ? undefined
        : cover && wallSystem
          ? measure("bar-scene", () =>
              buildWallScene(cover.barX, wallSystem, {
                selectedWallId: activeSelectedWallId,
                selectedCellId,
                relationFamily: activeBarRelationPair,
                spreadRelationCells: spreadBarRelationCells,
                showWalls,
                focusSelectedWall: wallDisplayMode === "selected",
                showInducedDirections,
                colorEdgesByWall,
                showRelationCells: showCells,
                showDiscardedCells,
                coorientation,
                lawfulSubcomplex,
                selectedVertexId: activeBarVertexId,
                // The link lens falls back to the first vertex, but cells and
                // labels are emphasised only around a vertex the reader chose.
                emphasisVertexId: cover.barX.vertices.some(
                  (vertex) => vertex.id === selectedNodeId,
                )
                  ? selectedNodeId
                  : null,
                linkLens,
                cellEmphasis: fillAllCells ? "all" : "focus",
                inducedArrows: allInducedArrows ? "all" : "focus",
              }),
            )
          : emptyScene(coverMessage),
    [
      coorientation,
      cover,
      coverMessage,
      lawfulSubcomplex,
      activeBarVertexId,
      activeBarRelationPair,
      spreadBarRelationCells,
      linkLens,
      model,
      selectedCellId,
      activeSelectedWallId,
      colorEdgesByWall,
      showDiscardedCells,
      showCells,
      showInducedDirections,
      showWalls,
      wallDisplayMode,
      wallSystem,
      selectedNodeId,
      fillAllCells,
      allInducedArrows,
    ],
  );
  const scene = useMemo<RenderScene>(() => {
    if (gammaScene) {
      return {
        nodes: gammaScene.nodes,
        edges: gammaScene.edges,
        cells: [],
        generators: system.generators.map((generator) => ({
          label: generator.label,
          colorHint: generator.colorHint,
        })),
        warnings: gammaScene.warnings,
      };
    }
    return hatScene ?? barScene ?? unitCellScene ?? sourceScene ?? emptyScene();
  }, [
    barScene,
    gammaScene,
    hatScene,
    sourceScene,
    system.generators,
    unitCellScene,
  ]);

  const focusActive = focusOnSelection && Boolean(selectedNodeId);
  const displayScene = useMemo<RenderScene>(() => {
    if (!focusActive) return scene;
    const distances = localGraphDistances(selectedNodeId, scene.edges);
    // Vertices outside the drawn component get a large distance so they fade.
    const far = Number.MAX_SAFE_INTEGER;
    return {
      ...scene,
      nodes: scene.nodes.map((node) => ({
        ...node,
        localDistance: distances.get(node.id) ?? far,
      })),
    };
  }, [focusActive, scene, selectedNodeId]);

  const currentModel = modelExplanations[model];
  const inspectorSummary = useMemo(
    () =>
      measure(
        "inspector-summary",
        () =>
          (unitCellBase
            ? unitCellInspectorSummary(unitCellBase, {
                selectedNodeId,
                selectedEdgeId,
                selectedCellId,
              })
            : undefined) ??
          buildInspectorSummary({
            model,
            systemName: system.name,
            scene,
            selectedNodeId,
            selectedCellId,
            selectedEdgeId,
            selectedWallId: activeSelectedWallId,
            cover,
            wallSystem,
            lawfulSubcomplex,
            morseLinks,
            linkLens,
            selectedBarVertexId: activeBarVertexId,
          }),
      ),
    [
      activeBarVertexId,
      activeSelectedWallId,
      selectedEdgeId,
      cover,
      lawfulSubcomplex,
      linkLens,
      model,
      morseLinks,
      scene,
      selectedCellId,
      selectedNodeId,
      system.name,
      unitCellBase,
      wallSystem,
    ],
  );
  const warnings = useMemo(
    () =>
      activeWarnings({
        model,
        sceneWarnings: scene.warnings,
        cover,
        coverError: coverState.coverError ?? coverImportError,
        wallSystem,
        searchError,
        isCompact: example.role === "compact",
      }),
    [
      cover,
      coverState.coverError,
      coverImportError,
      example.role,
      model,
      scene.warnings,
      searchError,
      wallSystem,
    ],
  );

  // The renderer rebuilds edge geometry (arrowheads, wall colouring, ghosting,
  // projected positions) only when this key changes. Everything that alters
  // an edge's direction, colour or position must therefore appear here, or the
  // canvas keeps showing a stale coorientation while the panels report the new
  // one.
  const coorientationKey = coorientation
    ? Object.entries(coorientation.wallSigns)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, sign]) => `${id}:${sign}`)
        .join(",")
    : "";
  const structureVersion = [
    "scene-v3",
    model,
    example.id,
    radius,
    projection,
    generation.requestId,
    cover?.hatX.vertices.length ?? 0,
    cover?.barX.geometricEdges.length ?? 0,
    activeBarRelationFamily,
    showWalls ? 1 : 0,
    coorientationKey,
    wallDisplayMode,
    wallDisplayMode === "selected" ? (activeSelectedWallId ?? "") : "",
    showInducedDirections ? 1 : 0,
    allInducedArrows ? 1 : 0,
    fillAllCells ? 1 : 0,
    bigonsAsTwoEdges ? 1 : 0,
    colorEdgesByWall ? 1 : 0,
    linkLens,
    linkLens === "none" ? "" : (activeBarVertexId ?? ""),
    // Edge fading in focus mode is built with the edges.
    focusActive ? `focus:${selectedNodeId}` : "",
    unitCellActive ? `unit-cell:${showUnitCellCopies ? 1 : 0}` : "",
  ].join(":");
  const appearanceVersion = [
    selectedNodeId ?? "",
    selectedCellId ?? "",
    activeSelectedWallId ?? "",
    Object.entries(wallSigns)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, sign]) => `${id}:${sign}`)
      .join(","),
    showCells ? 1 : 0,
    showDiscardedCells ? 1 : 0,
    showNodeLabels ? 1 : 0,
    showEdgeLabels ? 1 : 0,
    wallDisplayMode,
    showInducedDirections ? 1 : 0,
    colorEdgesByWall ? 1 : 0,
    linkLens,
    colorScheme,
    // Unit-cell stubs highlight their partner when an edge is selected.
    unitCellActive ? (selectedEdgeId ?? "") : "",
  ].join(":");

  const handleExampleChange = useCallback(
    (nextExampleId: string) => {
      coverDiscoveryRunRef.current += 1;
      setExampleId(nextExampleId);
      // Hyperbolic balls grow exponentially and are now drawn by their
      // reflection orbit; radius 3 keeps the 1-skeleton and its labels
      // readable. Finite groups keep the larger radius.
      if (bundledExampleById(nextExampleId).system.geometry) {
        setRadius((current) => Math.min(current, 3));
      }
      setSelectedNodeId(undefined);
      setSelectedCellId(undefined);
      setSelectedWallId(undefined);
      setBarRelationFamily("shared-complex");
      setWallSigns({});
      setShowWalls(true);
      setShowInducedDirections(true);
      setColorEdgesByWall(true);
      setSearchResult(undefined);
      setSearchError(undefined);
      setFiberingSearchResult(undefined);
      setLawfulFiberingSearchResult(undefined);
      setFiberingSearchError(undefined);
      setLinkLens("none");
      setGeneration((current) => ({
        ...current,
        pending: true,
        error: undefined,
      }));
      if (nextExampleId === "I2_5") {
        setCoverSource(DEFAULT_COVER);
        setCoverImportError(undefined);
        setCoverDiscovery({
          status: "ready",
          message:
            "The bundled I2(5) regular action is ready. Run discovery to reproduce it with GAP.",
        });
      } else if (nextExampleId === IDEAL_3_CUBE_EXAMPLE_ID) {
        setCoverSource(getIdeal3CubeS4Cover());
        setBarRelationFamily("0:1");
        setShowCells(true);
        setShowWalls(false);
        setShowInducedDirections(false);
        setColorEdgesByWall(false);
        setCoverImportError(undefined);
        setCoverDiscovery({
          status: "found",
          message:
            "The bundled exact map t_ij -> (ij) has torsion-free kernel of index 24. Every spherical A1/A2 restriction was checked in-repo.",
        });
      } else if (nextExampleId === C44_TETRAHEDRON_EXAMPLE_ID) {
        setCoverSource(getC44Psl27Cover());
        setShowCells(true);
        setShowWalls(false);
        setShowInducedDirections(false);
        setColorEdgesByWall(false);
        setCoverImportError(undefined);
        setCoverDiscovery({
          status: "found",
          message:
            "The bundled exact map s_i -> (r_i, 1) into PSL(2,7) x C2 has torsion-free kernel of index 336, a closed orientable hyperbolic 3-manifold. Every spherical B3 restriction was checked in-repo.",
        });
      } else {
        setCoverSource(undefined);
        setCoverImportError(undefined);
        setCoverDiscovery({
          status: "ready",
          message:
            "No cover is bundled for this source. Run the bounded automatic search in the desktop app.",
        });
        if (model === "hat-x" || model === "bar-x") setModel("davis");
      }
    },
    [model],
  );

  const handleRadiusChange = useCallback((nextRadius: number) => {
    setGeneration((current) => ({
      ...current,
      pending: true,
      error: undefined,
    }));
    setRadius(nextRadius);
  }, []);

  const handleBarRelationFamilyChange = useCallback(
    (familyId: BarXRelationFamilyId) => {
      setBarRelationFamily(familyId);
      setModel("bar-x");
      setSelectedNodeId(undefined);
      setSelectedCellId(undefined);
      setLinkLens("none");
      setShowCells(true);
      if (familyId === "shared-complex") {
        setShowWalls(true);
        setShowInducedDirections(true);
        setColorEdgesByWall(true);
      } else {
        setShowWalls(false);
        setShowInducedDirections(false);
        setColorEdgesByWall(false);
        setWallDisplayMode("all");
      }
    },
    [],
  );

  const handleCoverDiscoveryOptionsChange = useCallback(
    (options: AutomaticCoverSearchOptions) => {
      coverDiscoveryRunRef.current += 1;
      setCoverDiscoveryOptions(options);
      setCoverDiscovery({
        status: "ready",
        message: "Search bounds changed. Ready to start a new bounded search.",
      });
    },
    [],
  );

  const handleImportCover = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        const result = await quotientValidationClient.validateFile(file);
        setCoverSource(result.quotient);
        setCoverImportError(undefined);
        setSelectedNodeId(undefined);
        setSelectedCellId(undefined);
        setSelectedWallId(undefined);
        setBarRelationFamily("shared-complex");
        setWallSigns({});
        setSearchResult(undefined);
        setSearchError(undefined);
        setFiberingSearchResult(undefined);
        setLawfulFiberingSearchResult(undefined);
        setFiberingSearchError(undefined);
        setLinkLens("none");
        setCoverDiscovery({
          status: "found",
          message:
            "Imported finite action loaded. Its attached torsion-free metadata is shown separately from in-repo action checks.",
        });
        setModel("hat-x");
      } catch (error) {
        if (error instanceof QuotientValidationCancelledError) return;
        setCoverImportError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [quotientValidationClient],
  );

  const handleImportDiscoveryArtifact = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
        setCoverDiscovery({
          status: "failed",
          message: "Discovery artifacts larger than 50 MiB are not accepted.",
        });
        return;
      }
      try {
        const artifact = JSON.parse(await file.text()) as unknown;
        const certified = certifyAutomaticCoverArtifact(artifact, system);
        const quotient = certified.result.quotient;
        if (!quotient) {
          throw new Error("The discovery artifact did not produce a cover.");
        }
        coverDiscoveryRunRef.current += 1;
        setCoverSource(quotient);
        setCoverImportError(undefined);
        setSelectedNodeId(undefined);
        setSelectedCellId(undefined);
        setSelectedWallId(undefined);
        setBarRelationFamily("shared-complex");
        setWallSigns({});
        setSearchResult(undefined);
        setSearchError(undefined);
        setFiberingSearchResult(undefined);
        setLawfulFiberingSearchResult(undefined);
        setFiberingSearchError(undefined);
        setLinkLens("none");
        setModel("hat-x");
        setCoverDiscovery({
          status: "found",
          artifact: certified.artifact,
          artifactPath: file.name,
          message: `Imported and independently certified a torsion-free cover of index ${quotient.vertices.length}.`,
        });
      } catch (error) {
        setCoverDiscovery({
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [system],
  );

  const handleDiscoverCover = useCallback(async () => {
    const runId = coverDiscoveryRunRef.current + 1;
    coverDiscoveryRunRef.current = runId;
    const lowerBound = coverDiscoveryPlan.indexLowerBound.value.safeInteger;
    const availableDegreeBound =
      coverDiscoveryOptions.backend === "gap"
        ? Math.max(
            coverDiscoveryOptions.maxIndex,
            coverDiscoveryOptions.maxCongruenceImageOrder,
          )
        : coverDiscoveryOptions.backend === "sage"
          ? coverDiscoveryOptions.maxCongruenceImageOrder
          : Math.max(
              coverDiscoveryOptions.maxIndex,
              coverDiscoveryOptions.maxCongruenceImageOrder,
            );
    if (lowerBound !== undefined && availableDegreeBound < lowerBound) {
      setCoverDiscovery({
        status: "failed",
        message: `The search bound must reach the necessary index divisor ${lowerBound}.`,
      });
      return;
    }
    if (coverDiscoveryPlan.sphericalPlan.status !== "complete") {
      setCoverDiscovery({
        status: "failed",
        message:
          "The spherical-subgroup catalogue is incomplete, so a torsion-free certificate cannot be issued.",
      });
      return;
    }

    setCoverDiscovery({
      status: "searching",
      message:
        coverDiscoveryOptions.backend === "auto"
          ? "Planning torsion witnesses, then running the GAP, Sage, and composite-action ladder..."
          : `Planning torsion witnesses and starting the bounded ${coverDiscoveryOptions.backend.toUpperCase()} search...`,
    });
    try {
      const bridge = await loadDesktopBridge();
      const desktopStatus = await bridge.getStatus();
      if (!desktopStatus.nativeAvailable || desktopStatus.runtime !== "tauri") {
        setCoverDiscovery({
          status: "skipped",
          message:
            "Automatic GAP/Sage cover discovery runs in the desktop app. The web app can export the same deterministic search request for the CLI.",
        });
        return;
      }
      const workspacePath = desktopStatus.workspace.id.startsWith("workspace:")
        ? desktopStatus.workspace.rootPathHint
        : undefined;
      const started = await bridge.startDesktopJob({
        kind: "discoverTorsionFreeCover",
        workspacePath,
        payload: coverDiscoveryPlan.request,
      });
      if (started.status === "failed") {
        throw new Error(started.message);
      }
      setCoverDiscovery({
        status: "searching",
        jobId: started.id,
        message:
          coverDiscoveryOptions.backend === "auto"
            ? `Cover job ${started.id} is running the automatic GAP, Sage, and composite-action ladder.`
            : `Cover job ${started.id} is running the ${coverDiscoveryOptions.backend} strategy.`,
      });

      // `timeoutSeconds` is a per-backend bound. In automatic mode both GAP
      // and Sage may use that allowance before the in-process composition rung.
      const externalRungCount =
        coverDiscoveryOptions.backend === "auto" ? 2 : 1;
      const deadline =
        Date.now() +
        (coverDiscoveryOptions.timeoutSeconds * externalRungCount + 90) * 1000;
      let completed = started;
      while (completed.status === "queued" || completed.status === "running") {
        if (Date.now() > deadline) {
          throw new Error(
            "The desktop job did not settle after its configured backend timeout.",
          );
        }
        await delay(250);
        if (coverDiscoveryRunRef.current !== runId) return;
        completed = (await bridge.getDesktopJob(started.id)) ?? completed;
      }
      if (coverDiscoveryRunRef.current !== runId) return;
      if (completed.status !== "succeeded") {
        throw new Error(
          completed.message || `Desktop job ${completed.status}.`,
        );
      }
      const resultRecord = asUnknownRecord(completed.result);
      const artifact = parseAutomaticCoverSearchArtifact(
        resultRecord?.artifact ?? completed.result,
      );
      const artifactPath =
        typeof resultRecord?.artifactPath === "string"
          ? resultRecord.artifactPath
          : undefined;
      if (artifact.status !== "passed") {
        const status =
          artifact.status === "exhausted"
            ? "exhausted"
            : artifact.status === "timeout"
              ? "timeout"
              : artifact.status === "skipped"
                ? "skipped"
                : "failed";
        const detail =
          artifact.errors?.[0] ?? artifact.warnings?.[0] ?? "No cover found.";
        setCoverDiscovery({
          status,
          artifact,
          artifactPath,
          jobId: started.id,
          message:
            status === "exhausted"
              ? `No certified cover was found within the supplied bounds. ${detail}`
              : detail,
        });
        return;
      }

      const certified = certifyAutomaticCoverArtifact(artifact, system);
      const quotient = certified.result.quotient;
      if (!quotient) {
        throw new Error(
          "The independent certificate did not construct a quotient.",
        );
      }
      setCoverSource(quotient);
      setCoverImportError(undefined);
      setSelectedNodeId(undefined);
      setSelectedCellId(undefined);
      setSelectedWallId(undefined);
      setBarRelationFamily("shared-complex");
      setWallSigns({});
      setSearchResult(undefined);
      setSearchError(undefined);
      setFiberingSearchResult(undefined);
      setLawfulFiberingSearchResult(undefined);
      setFiberingSearchError(undefined);
      setLinkLens("none");
      setModel("hat-x");
      setCoverDiscovery({
        status: "found",
        artifact,
        artifactPath,
        jobId: started.id,
        message: `Found and independently certified a torsion-free cover of index ${quotient.vertices.length}.`,
      });
    } catch (error) {
      if (coverDiscoveryRunRef.current !== runId) return;
      setCoverDiscovery({
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [
    coverDiscoveryOptions.maxIndex,
    coverDiscoveryOptions.maxCongruenceImageOrder,
    coverDiscoveryOptions.backend,
    coverDiscoveryOptions.timeoutSeconds,
    coverDiscoveryPlan,
    system,
  ]);

  const handleExportDiscoveryRequest = useCallback(async () => {
    const fileName = `${example.id}-torsion-free-cover-search.json`;
    const contents = JSON.stringify(coverDiscoveryPlan.request, null, 2);
    await exportWithDesktopBridge(
      {
        kind: "quotient-build-request",
        fileName,
        contents,
        mediaType: "application/json",
      },
      () => downloadText(contents, fileName, "application/json"),
    );
  }, [coverDiscoveryPlan.request, example.id]);

  const handleFlipWall = useCallback(() => {
    if (!activeSelectedWallId || !coorientation) return;
    setWallSigns({
      ...coorientation.wallSigns,
      [activeSelectedWallId]:
        coorientation.wallSigns[activeSelectedWallId] === -1 ? 1 : -1,
    });
    setSearchResult(undefined);
    setSearchError(undefined);
    setFiberingSearchResult(undefined);
    setLawfulFiberingSearchResult(undefined);
    setFiberingSearchError(undefined);
  }, [activeSelectedWallId, coorientation]);

  const handleOptimize = useCallback(async () => {
    if (!cover || !wallSystem || searchRunning) return;
    setSearchRunning(true);
    setSearchError(undefined);
    setFiberingSearchResult(undefined);
    setLawfulFiberingSearchResult(undefined);
    setFiberingSearchError(undefined);
    try {
      const result = await wallSearchClient.search(cover.barX, wallSystem, {
        exactWallLimit: 22,
        nodeBudget: 2_000_000,
        timeBudgetMs: 12_000,
      });
      setSearchResult(result);
      if (result.coorientation) setWallSigns(result.coorientation.wallSigns);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSearchRunning(false);
    }
  }, [cover, searchRunning, wallSearchClient, wallSystem]);

  const runFullDavisCertification = useCallback(async () => {
    if (!coverSource) return undefined;
    const result = await fullDavisCertificationClient.search(coverSource, {
      exactWallLimit: 16,
      maxCandidates: 10_000,
      timeBudgetMs: 30_000,
      collapsibilityOptions: {
        maxStates: 25_000,
        maxTransitions: 250_000,
        maxMilliseconds: 1_000,
      },
    });
    setFiberingSearchResult(result);
    if (result.bestWallSigns) {
      setWallSigns(result.bestWallSigns);
      setSearchResult(undefined);
      setSearchError(undefined);
    }
    return result;
  }, [coverSource, fullDavisCertificationClient]);

  const handleFindVirtualFibering = useCallback(async () => {
    if (!coverSource || fiberingSearchRunning) return;
    setFiberingSearchRunning(true);
    setFiberingSearchError(undefined);
    setLawfulFiberingSearchResult(undefined);
    setFiberingSearchResult(undefined);
    try {
      const lawful = await lawfulCertificationClient.search(coverSource, {
        exactWallLimit: 16,
        maxCandidates: 10_000,
        timeBudgetMs: 30_000,
      });
      setLawfulFiberingSearchResult(lawful);
      if (lawful.bestWallSigns) {
        setWallSigns(lawful.bestWallSigns);
        setSearchResult(undefined);
        setSearchError(undefined);
      }
      const lawfulPassed =
        lawful.status === "found" &&
        lawful.certificate?.status === "passed" &&
        lawful.certificateReplay?.valid === true &&
        lawful.certificateReplay.mandatoryChecksPassed;
      if (!lawfulPassed) await runFullDavisCertification();
    } catch (error) {
      setFiberingSearchError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setFiberingSearchRunning(false);
    }
  }, [
    coverSource,
    fiberingSearchRunning,
    lawfulCertificationClient,
    runFullDavisCertification,
  ]);

  const handleFindFullDavisFibering = useCallback(async () => {
    if (!coverSource || fiberingSearchRunning) return;
    setFiberingSearchRunning(true);
    setFiberingSearchError(undefined);
    try {
      await runFullDavisCertification();
    } catch (error) {
      setFiberingSearchError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setFiberingSearchRunning(false);
    }
  }, [coverSource, fiberingSearchRunning, runFullDavisCertification]);

  const handleStartHere = useCallback(
    (actionId: StartHereActionId) => {
      const action = startHereActions.find(
        (candidate) => candidate.id === actionId,
      );
      if (!action) return;
      setModel(action.model);
      if (action.id === "inspect-finite-cover") {
        void handleDiscoverCover();
      }
      if (action.id === "find-walls" || action.id === "coorient-walls") {
        setShowWalls(true);
        setSelectedWallId((current) => current ?? wallSystem?.walls[0]?.id);
      }
      if (action.id === "check-certificates-data") setUiMode("research");
    },
    [handleDiscoverCover, wallSystem],
  );

  const handleCapture = useCallback(async () => {
    const capture = capturePngRef.current;
    if (!capture) return;
    const dataUrl = await capture();
    const fileName = `coxeter-${model}-${example.id}.png`;
    await exportWithDesktopBridge(
      {
        kind: "screenshot",
        fileName,
        contents: dataUrl,
        mediaType: "image/png",
        contentEncoding: "data-url",
      },
      () => downloadDataUrl(dataUrl, fileName),
    );
  }, [example.id, model]);

  const buildExperimentBundle = useCallback(
    () => ({
      schemaVersion: 1,
      kind: "wall-coorientation-experiment",
      createdAt: new Date().toISOString(),
      sourceSystem: system,
      sourceCover: coverSource,
      torsionFreeCoverDiscovery: {
        request: coverDiscoveryPlan.request,
        status: coverDiscovery.status,
        artifact: coverDiscovery.artifact,
      },
      coverCompression: cover,
      wallSystem,
      coorientation,
      lawfulSubcomplex,
      morseLinks,
      optimization: searchResult,
      virtualAlgebraicFibering: virtualFiberingCertificate,
      lawfulSubcomplexVirtualAlgebraicFibering: lawfulFiberingSearchResult,
      fullDavisVirtualAlgebraicFibering: fiberingSearchResult,
      view: {
        model,
        selectedNodeId,
        selectedCellId,
        selectedWallId: activeSelectedWallId,
        barRelationFamily: activeBarRelationFamily,
        showWalls,
        wallDisplayMode,
        showInducedDirections,
        colorEdgesByWall,
        showCells,
        showDiscardedCells,
        linkLens,
      },
    }),
    [
      activeSelectedWallId,
      activeBarRelationFamily,
      colorEdgesByWall,
      coorientation,
      cover,
      coverSource,
      coverDiscovery.artifact,
      coverDiscovery.status,
      coverDiscoveryPlan.request,
      lawfulSubcomplex,
      lawfulFiberingSearchResult,
      linkLens,
      model,
      morseLinks,
      searchResult,
      selectedCellId,
      selectedNodeId,
      showCells,
      showDiscardedCells,
      showInducedDirections,
      showWalls,
      system,
      wallDisplayMode,
      wallSystem,
      virtualFiberingCertificate,
      fiberingSearchResult,
    ],
  );

  const handleExport = useCallback(async () => {
    const fileName = `coxeter-walls-${example.id}.coxeter-experiment.json`;
    const contents = JSON.stringify(buildExperimentBundle(), null, 2);
    await exportWithDesktopBridge(
      {
        kind: "experiment-bundle",
        fileName,
        contents,
        mediaType: "application/json",
      },
      () => downloadText(contents, fileName, "application/json"),
    );
  }, [buildExperimentBundle, example.id]);

  const handleExportVirtualFibering = useCallback(async () => {
    const certificate =
      lawfulFiberingSearchResult?.certificate ??
      fiberingSearchResult?.certificate ??
      virtualFiberingCertificate;
    if (!certificate) return;
    const track =
      certificate.kind ===
      "action-rooted-lawful-subcomplex-fibering-certificate"
        ? "lawful-subcomplex"
        : certificate.kind ===
            "full-davis-virtual-algebraic-fibering-certificate"
          ? "full-davis"
          : "compression-diagnostic";
    const fileName = `${example.id}-${track}-virtual-fibering.certificate.json`;
    const contents = JSON.stringify(certificate, null, 2);
    await exportWithDesktopBridge(
      {
        kind: "experiment-bundle",
        fileName,
        contents,
        mediaType: "application/json",
      },
      () => downloadText(contents, fileName, "application/json"),
    );
  }, [
    example.id,
    fiberingSearchResult?.certificate,
    lawfulFiberingSearchResult?.certificate,
    virtualFiberingCertificate,
  ]);

  const buildViewSession = useCallback(
    (): CoverWallViewSession => ({
      schemaVersion: 1,
      sessionKind: "coxeter-cover-wall-session",
      appVersion: "0.2.0",
      updatedAt: new Date().toISOString(),
      exampleId,
      sourceCover: coverSource,
      view: {
        model,
        radius,
        projection,
        selectedNodeId,
        selectedCellId,
        selectedWallId: activeSelectedWallId,
        barRelationFamily: activeBarRelationFamily,
        wallSigns: coorientation?.wallSigns ?? wallSigns,
        showCells,
        showWalls,
        wallDisplayMode,
        showInducedDirections,
        colorEdgesByWall,
        showDiscardedCells,
        showNodeLabels,
        showEdgeLabels,
        linkLens,
        uiMode,
        colorScheme,
      },
    }),
    [
      activeSelectedWallId,
      activeBarRelationFamily,
      colorScheme,
      colorEdgesByWall,
      coorientation?.wallSigns,
      coverSource,
      exampleId,
      linkLens,
      model,
      projection,
      radius,
      selectedCellId,
      selectedNodeId,
      showCells,
      showDiscardedCells,
      showEdgeLabels,
      showInducedDirections,
      showNodeLabels,
      showWalls,
      uiMode,
      wallDisplayMode,
      wallSigns,
    ],
  );

  const handleSaveSession = useCallback(async () => {
    const contents = JSON.stringify(buildViewSession(), null, 2);
    const fileName = ".coxeter-session.json";
    await exportWithDesktopBridge(
      {
        kind: "project-session",
        fileName,
        contents,
        mediaType: "application/json",
      },
      () => downloadText(contents, fileName, "application/json"),
    );
  }, [buildViewSession]);

  const restoreViewSession = useCallback((session: CoverWallViewSession) => {
    coverDiscoveryRunRef.current += 1;
    if (bundledExamples.some((entry) => entry.id === session.exampleId)) {
      setExampleId(session.exampleId);
    }
    setCoverSource(session.sourceCover);
    setCoverImportError(undefined);
    setModel(session.view.model);
    setRadius(session.view.radius);
    setProjection(session.view.projection);
    setSelectedNodeId(session.view.selectedNodeId);
    setSelectedCellId(session.view.selectedCellId);
    setSelectedWallId(session.view.selectedWallId);
    setBarRelationFamily(session.view.barRelationFamily);
    setWallSigns(session.view.wallSigns);
    setShowCells(session.view.showCells);
    setShowWalls(session.view.showWalls);
    setWallDisplayMode(session.view.wallDisplayMode);
    setShowInducedDirections(session.view.showInducedDirections);
    setColorEdgesByWall(session.view.colorEdgesByWall);
    setShowDiscardedCells(session.view.showDiscardedCells);
    setShowNodeLabels(session.view.showNodeLabels);
    setShowEdgeLabels(session.view.showEdgeLabels);
    setLinkLens(session.view.linkLens);
    setUiMode(session.view.uiMode);
    setColorScheme(session.view.colorScheme);
    setSearchResult(undefined);
    setSearchError(undefined);
    setFiberingSearchResult(undefined);
    setLawfulFiberingSearchResult(undefined);
    setFiberingSearchError(undefined);
    setCoverDiscovery({
      status: session.sourceCover ? "found" : "ready",
      message: session.sourceCover
        ? "Restored the finite cover recorded in this session."
        : "This session has no finite cover; run automatic discovery to continue.",
    });
  }, []);

  const handleOpenSession = useCallback(async () => {
    const result = await (await loadDesktopBridge()).openProjectSession();
    if (!result.ok || !result.contents) {
      if (result.message) setDesktopMessage(result.message);
      return;
    }
    try {
      restoreViewSession(parseCoverWallViewSession(result.contents));
      setDesktopMessage(`Opened ${result.path ?? "cover-and-wall session"}.`);
    } catch (error) {
      setDesktopMessage(
        `Could not open session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, [restoreViewSession]);

  const resetViewSession = useCallback(() => {
    coverDiscoveryRunRef.current += 1;
    setExampleId("I2_5");
    setModel("bar-x");
    setRadius(5);
    setProjection("klein-axes");
    setCoverSource(DEFAULT_COVER);
    setCoverImportError(undefined);
    setSelectedNodeId(undefined);
    setSelectedCellId(undefined);
    setSelectedWallId(undefined);
    setBarRelationFamily("shared-complex");
    setWallSigns({});
    setShowCells(true);
    setShowWalls(true);
    setShowDiscardedCells(true);
    setShowNodeLabels(true);
    setShowEdgeLabels(true);
    setLinkLens("none");
    setSearchResult(undefined);
    setSearchError(undefined);
    setFiberingSearchResult(undefined);
    setLawfulFiberingSearchResult(undefined);
    setFiberingSearchError(undefined);
    setCoverDiscovery({
      status: "ready",
      message:
        "The bundled I2(5) regular action is ready. Run discovery to reproduce it with GAP.",
    });
  }, []);

  const handleExportScene = useCallback(async () => {
    const fileName = `coxeter-${model}-${example.id}.scene.json`;
    const contents = JSON.stringify(
      {
        schemaVersion: 1,
        kind: "viewer-scene-export",
        model,
        sourceSystem: system,
        nodes: scene.nodes,
        edges: scene.edges,
        cells: scene.cells,
        warnings,
      },
      null,
      2,
    );
    await exportWithDesktopBridge(
      {
        kind: "graph-json",
        fileName,
        contents,
        mediaType: "application/json",
      },
      () => downloadText(contents, fileName, "application/json"),
    );
  }, [
    example.id,
    model,
    scene.cells,
    scene.edges,
    scene.nodes,
    system,
    warnings,
  ]);

  const handleDesktopMenuCommand = useCallback(
    (command: DesktopMenuCommand) => {
      const bridgeTask = async (
        task: (bridge: DesktopBridge) => Promise<string | undefined>,
      ) => {
        try {
          const message = await task(await loadDesktopBridge());
          if (message) setDesktopMessage(message);
        } catch (error) {
          setDesktopMessage(
            error instanceof Error ? error.message : String(error),
          );
        }
      };
      switch (command) {
        case "new-session":
          resetViewSession();
          break;
        case "open-session":
          void handleOpenSession();
          break;
        case "save-session":
        case "save-session-as":
          void handleSaveSession();
          break;
        case "export-graph":
          void handleExportScene();
          break;
        case "export-screenshot":
        case "export-figure-bundle":
          void handleCapture();
          break;
        case "export-experiment-bundle":
          void handleExport();
          break;
        case "teaching-mode":
          setUiMode("teaching");
          break;
        case "research-mode":
          setUiMode("research");
          break;
        case "reset-view":
          setSceneLayoutVersion((current) => current + 1);
          break;
        case "toggle-labels":
          setShowNodeLabels((current) => !current);
          setShowEdgeLabels((current) => !current);
          break;
        case "toggle-cells":
          setShowCells((current) => !current);
          break;
        case "fullscreen":
          void bridgeTask(
            async (bridge) => (await bridge.toggleFullscreen()).message,
          );
          break;
        case "guide-rank-two-cell":
          handleExampleChange("A2");
          setRadius(3);
          setModel("davis");
          break;
        case "guide-finite-cover":
          handleExampleChange("I2_5");
          setModel("hat-x");
          break;
        case "guide-find-walls":
        case "guide-coorient-walls":
          handleExampleChange("I2_5");
          setShowWalls(true);
          setModel("bar-x");
          break;
        case "guide-morse-links":
          handleExampleChange("I2_5");
          setShowWalls(true);
          setLinkLens("ascending");
          setModel("bar-x");
          break;
        case "choose-workspace":
          void bridgeTask(
            async (bridge) => (await bridge.pickWorkspace()).message,
          );
          break;
        case "reveal-workspace":
        case "show-logs":
          void bridgeTask(async (bridge) => {
            const status = await bridge.getStatus();
            const root = status.workspace.rootPathHint;
            if (!root) return "Choose a research workspace first.";
            const path =
              command === "show-logs" ? `${root}/.coxeter-viewer/logs` : root;
            return (await bridge.revealPath(path)).message;
          });
          break;
        case "check-tools":
          void bridgeTask(async (bridge) => {
            const tools = await bridge.detectExternalTools();
            return tools.length === 0
              ? "External tool detection is available in the desktop app."
              : tools
                  .map(
                    (tool) =>
                      `${tool.displayName}: ${tool.found ? "found" : "missing"}`,
                  )
                  .join("; ");
          });
          break;
        case "export-diagnostics":
          void bridgeTask(
            async (bridge) => (await bridge.exportDiagnosticBundle()).message,
          );
          break;
        case "help-readme":
          window.open(
            "https://github.com/hgfjh/CoxeterViewer5D#readme",
            "_blank",
            "noopener,noreferrer",
          );
          break;
        case "help-walkthroughs":
          window.open(
            "https://github.com/hgfjh/CoxeterViewer5D/blob/main/docs/walkthroughs.md",
            "_blank",
            "noopener,noreferrer",
          );
          break;
        case "help-about":
          setDesktopMessage(
            "CoxeterViewer5D v0.2.0 cover, compression, wall, and local-Morse research preview.",
          );
          break;
      }
    },
    [
      handleCapture,
      handleExampleChange,
      handleExport,
      handleExportScene,
      handleOpenSession,
      handleSaveSession,
      resetViewSession,
    ],
  );

  useEffect(() => {
    desktopMenuHandlerRef.current = handleDesktopMenuCommand;
  }, [handleDesktopMenuCommand]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key.toLowerCase() === "u") {
        event.preventDefault();
        setViewerOnly((current) => !current);
        setSceneLayoutVersion((current) => current + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sceneEmpty = scene.nodes.length === 0;
  const semanticNodeCount = scene.nodes.filter(
    (node) => !node.drawingOnly,
  ).length;
  const semanticEdgeCount = scene.edges.filter(
    (edge) => !edge.drawingOnly,
  ).length;
  const coverCameraOffset = useMemo<
    [number, number, number] | undefined
  >(() => {
    if (model !== "hat-x" && model !== "bar-x") return undefined;
    let radius = 1;
    for (const node of scene.nodes) {
      if (node.drawingOnly || !node.position) continue;
      radius = Math.max(radius, Math.hypot(...node.position));
    }
    for (const cell of scene.cells) {
      if (cell.drawingInteriorPoint) {
        radius = Math.max(radius, Math.hypot(...cell.drawingInteriorPoint));
      }
      for (const point of cell.drawingInteriorRing ?? []) {
        radius = Math.max(radius, Math.hypot(...point));
      }
    }
    return [0, -radius * 2.25, radius * 1.3];
  }, [model, scene.cells, scene.nodes]);
  // Stable handlers keep the memoized research panel from re-rendering on
  // unrelated App updates.
  const handleDiscoverCoverClick = useCallback(() => {
    void handleDiscoverCover();
  }, [handleDiscoverCover]);
  const handleExportDiscoveryRequestClick = useCallback(() => {
    void handleExportDiscoveryRequest();
  }, [handleExportDiscoveryRequest]);
  const handleExportVirtualFiberingClick = useCallback(() => {
    void handleExportVirtualFibering();
  }, [handleExportVirtualFibering]);
  const handleCancelImport = useCallback(() => {
    quotientValidationClient.cancel();
  }, [quotientValidationClient]);
  // Scene clicks select exactly one kind of element; the renderer reports a
  // vertex first, then an edge, then a cell.
  const handleSceneSelectNode = useCallback((nodeId?: string) => {
    setSelectedEdgeId(undefined);
    setSelectedNodeId(nodeId);
  }, []);
  const handleSceneSelectCell = useCallback((cellId?: string) => {
    setSelectedEdgeId(undefined);
    setSelectedCellId(cellId);
  }, []);
  const handleSceneSelectEdge = useCallback((edgeId: string) => {
    setSelectedNodeId(undefined);
    setSelectedCellId(undefined);
    setSelectedEdgeId(edgeId);
  }, []);

  // An atlas click selects the same cell id as the 3D scene. If the bar X
  // relation-family filter hides that cell's family, switch the filter to it,
  // so the 3D view and the inspector (which read the scene) can show it.
  const handleAtlasSelectCell = useCallback(
    (cellId: string, familyId: BarXRelationFamilyId) => {
      setSelectedEdgeId(undefined);
      setSelectedCellId(cellId);
      if (
        model === "bar-x" &&
        activeBarRelationPair &&
        familyId !== activeBarRelationFamily
      ) {
        setBarRelationFamily(familyId);
      }
    },
    [activeBarRelationFamily, activeBarRelationPair, model],
  );

  const handleSelectBarVertex = useCallback((vertexId: string) => {
    setSelectedNodeId(vertexId);
    setSelectedCellId(undefined);
  }, []);

  // Tour steps reuse the handlers behind the visible controls, so the tour
  // shows exactly what a click on that control would. The example is only
  // reloaded when it changes: handleExampleChange clears selections and wall
  // flips, which would undo what the reader did on the previous step.
  const handleTourStepEnter = useCallback(
    (step: AppTourStep) => {
      const action = step.action;
      if (!action) return;
      if (action.example && action.example !== exampleId) {
        handleExampleChange(action.example);
      }
      if (action.relationFamily) {
        handleBarRelationFamilyChange(action.relationFamily);
      }
      if (action.model) setModel(action.model);
      if (action.radius !== undefined && action.radius !== radius) {
        handleRadiusChange(action.radius);
      }
      if (action.selectNode) {
        setSelectedNodeId(action.selectNode);
        setSelectedCellId(undefined);
      }
      if (action.wallDisplayMode) {
        setShowWalls(true);
        setWallDisplayMode(action.wallDisplayMode);
      }
      if (action.linkLens) setLinkLens(action.linkLens);
      const detailsSelector = action.openDetails;
      if (detailsSelector) {
        // The details element mounts only after the state above renders.
        let attempts = 0;
        const open = () => {
          const details =
            document.querySelector<HTMLDetailsElement>(detailsSelector);
          if (details) details.open = true;
          else if (attempts++ < 60) requestAnimationFrame(open);
        };
        requestAnimationFrame(open);
      }
    },
    [
      exampleId,
      radius,
      handleExampleChange,
      handleBarRelationFamilyChange,
      handleRadiusChange,
    ],
  );

  const handleTourClose = useCallback((reason: TourCloseReason) => {
    writeTourRecord(reason);
    setTourOpen(false);
  }, []);

  const startTour = useCallback(() => {
    setViewerOnly(false);
    setTourOpen(true);
  }, []);

  const searchStatus = searchResult
    ? searchResult.certificate.optimalityProven
      ? `Proven optimum: ${pluralize(searchResult.objectiveValue ?? 0, "lawful cell")}.`
      : `Best found: ${pluralize(searchResult.objectiveValue ?? 0, "lawful cell")}; gap ${formatGap(searchResult.certificate.absoluteGap)}.`
    : searchError;
  const lawfulCertificationLabel =
    lawfulFiberingSearchResult?.certificate?.lawful.certificationComplex ===
    "coface-closed-full"
      ? "coface-closed lawful complex"
      : "lawful 2-complex";
  const fiberingSearchStatus = fiberingSearchRunning
    ? lawfulFiberingSearchResult
      ? "The lawful track did not certify; checking the complete Davis quotient."
      : "Checking Track A first."
    : lawfulFiberingSearchResult?.status === "found" &&
        lawfulFiberingSearchResult.certificate?.status === "passed"
      ? `The ${lawfulCertificationLabel} certified after ${lawfulFiberingSearchResult.candidatesEvaluated} coorientations by the finite-height-band argument; the full Davis check is optional.`
      : fiberingSearchResult
        ? fiberingSearchResult.status === "found"
          ? lawfulFiberingSearchResult
            ? `The lawful track did not certify; the full Davis fallback passed after ${fiberingSearchResult.candidatesEvaluated} candidates.`
            : `Found a coorientation passing the full subdivided-Davis link checks after ${fiberingSearchResult.candidatesEvaluated} candidates.`
          : fiberingSearchResult.status === "not-found"
            ? "Both exact sign-space searches finished without a certificate for this quotient."
            : `Track B (full Davis quotient) is ${describeStatus(fiberingSearchResult.status)}; ${describeTerminationReason(fiberingSearchResult.terminationReason)}.`
        : lawfulFiberingSearchResult
          ? `Track A (lawful complex) is ${describeStatus(lawfulFiberingSearchResult.status)}; ${describeTerminationReason(lawfulFiberingSearchResult.terminationReason)}.`
          : fiberingSearchError;

  return (
    <div
      className={`app-shell${viewerOnly ? " viewer-only" : ""}`}
      data-ui-mode={uiMode}
      data-theme={colorScheme}
    >
      <aside className="sidebar" aria-label="Viewer controls">
        <Panel title={uiMode === "teaching" ? "Choose Example" : "Source"}>
          <label className="field" htmlFor="example-select">
            <span>Source Coxeter system</span>
            <select
              id="example-select"
              value={exampleId}
              onChange={(event) => handleExampleChange(event.target.value)}
            >
              <optgroup label="Core and featured examples">
                {bundledExamples
                  .filter(
                    (entry) =>
                      entry.role !== "catalogue" &&
                      entry.role !== "nine-facet-catalogue",
                  )
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Certified eight-facet catalogue">
                {bundledExamples
                  .filter((entry) => entry.role === "catalogue")
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Certified nine-facet catalogue (Ma-Zheng)">
                {bundledExamples
                  .filter((entry) => entry.role === "nine-facet-catalogue")
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <p className="field-help" data-testid="active-source-system">
            Active source: <strong>{system.name}</strong>
            {coverSource ? " (from the finite action)" : ""}
          </p>
          {uiMode === "research" ? (
            <details
              className="advanced-details compact-details"
              data-testid="compact-research-campaigns"
            >
              <summary>Compact H5 campaign status</summary>
              <ul className="compact-status-list">
                {compactResearchCatalogueNotices.map((notice) => (
                  <li key={notice.id}>
                    <strong>{notice.label}</strong>: {notice.status}.{" "}
                    {notice.summary}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {(model === "davis" || model === "projection") && (
            <label className="field" htmlFor="radius-input">
              <span>Ball radius: {radius}</span>
              <input
                id="radius-input"
                type="range"
                min={1}
                max={8}
                value={radius}
                onChange={(event) =>
                  handleRadiusChange(Number(event.target.value))
                }
              />
            </label>
          )}
          {model === "projection" ? (
            <label className="field" htmlFor="projection-select">
              <span>Projection</span>
              <select
                id="projection-select"
                value={projection}
                onChange={(event) =>
                  setProjection(event.target.value as HyperbolicProjection)
                }
              >
                <option value="klein-axes">Klein model, coordinate axes</option>
                <option value="klein-pca">Klein model, PCA</option>
                <option value="poincare-axes">
                  Poincaré ball, coordinate axes
                </option>
                <option value="poincare-pca">Poincaré ball, PCA</option>
              </select>
            </label>
          ) : null}
        </Panel>

        {uiMode === "teaching" ? (
          <Panel title="Start Here">
            <div className="start-here-list">
              {startHereActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="start-here-action"
                  onClick={() => handleStartHere(action.id)}
                >
                  <strong>{action.label}</strong>
                  <span>{action.summary}</span>
                </button>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel title="View">
          <div
            className="model-switch-grid"
            role="group"
            aria-label="Mathematical model"
          >
            {MODEL_ORDER.map((modelId) => (
              <button
                key={modelId}
                type="button"
                className="button"
                aria-pressed={model === modelId}
                data-tour={`model-${modelId}`}
                disabled={modelId === "projection" && !projectionStatus.ok}
                title={
                  modelId === "projection" && !projectionStatus.ok
                    ? projectionStatus.reason
                    : undefined
                }
                onClick={() => setModel(modelId)}
              >
                {modelExplanations[modelId].teachingLabel}
              </button>
            ))}
          </div>
          <p className="model-switch-help">{currentModel.shortDescription}</p>
        </Panel>

        <CoversWallsPanel
          uiMode={uiMode}
          cover={cover}
          coverError={coverState.coverError ?? coverImportError}
          sourceName={coverSource?.name}
          wallSystem={wallSystem}
          coorientation={coorientation}
          lawfulSubcomplex={lawfulSubcomplex}
          morseLinks={morseLinks}
          selectedWallId={activeSelectedWallId}
          selectedVertexId={activeBarVertexId}
          selectedRelationFamily={activeBarRelationFamily}
          linkLens={linkLens}
          showWalls={showWalls}
          wallDisplayMode={wallDisplayMode}
          showInducedDirections={showInducedDirections}
          colorEdgesByWall={colorEdgesByWall}
          showCells={showCells}
          showDiscardedCells={showDiscardedCells}
          searchRunning={searchRunning}
          searchStatus={searchStatus}
          fiberingSearchRunning={fiberingSearchRunning}
          fiberingSearchStatus={fiberingSearchStatus}
          virtualFiberingCertificate={virtualFiberingCertificate}
          lawfulFiberingCertificate={lawfulFiberingSearchResult?.certificate}
          fullDavisFiberingCertificate={fiberingSearchResult?.certificate}
          discoveryPlan={coverDiscoveryPlan}
          nativeCoverDiscovery={hasNativeDesktopRuntime()}
          discoveryOptions={coverDiscoveryOptions}
          discoveryState={coverDiscovery}
          onDiscoveryOptionsChange={handleCoverDiscoveryOptionsChange}
          onDiscoverCover={handleDiscoverCoverClick}
          onExportDiscoveryRequest={handleExportDiscoveryRequestClick}
          onImportDiscoveryArtifact={handleImportDiscoveryArtifact}
          onImportCover={handleImportCover}
          importProgress={quotientImportProgress}
          onCancelImport={handleCancelImport}
          onSelectWall={setSelectedWallId}
          onSelectVertex={handleSelectBarVertex}
          onRelationFamilyChange={handleBarRelationFamilyChange}
          onLinkLensChange={setLinkLens}
          onFlipWall={handleFlipWall}
          onOptimize={handleOptimize}
          onFindVirtualFibering={handleFindVirtualFibering}
          onFindFullDavisFibering={handleFindFullDavisFibering}
          onExportVirtualFibering={handleExportVirtualFiberingClick}
          onShowWallsChange={setShowWalls}
          onWallDisplayModeChange={setWallDisplayMode}
          onShowInducedDirectionsChange={setShowInducedDirections}
          allInducedArrows={allInducedArrows}
          onAllInducedArrowsChange={setAllInducedArrows}
          onColorEdgesByWallChange={setColorEdgesByWall}
          onShowCellsChange={setShowCells}
          onShowDiscardedCellsChange={setShowDiscardedCells}
        />

        <Panel title="Labels">
          <Toggle
            checked={showNodeLabels}
            label="Show vertex labels"
            onChange={setShowNodeLabels}
          />
          <Toggle
            checked={showEdgeLabels}
            label="Show edge labels"
            onChange={setShowEdgeLabels}
          />
          <Toggle
            checked={focusOnSelection}
            label="Fade far from the selected vertex"
            title="Dims everything more than one edge away from the selected vertex"
            onChange={setFocusOnSelection}
          />
          {model === "hat-x" || model === "bar-x" ? (
            <Toggle
              checked={fillAllCells}
              label="Fill all cells"
              title="By default crowded covers fill only the selected cell and the cells at the selected vertex; hover any outline to fill it"
              onChange={setFillAllCells}
            />
          ) : null}
          {unitCellActive && cover ? (
            <>
              <Toggle
                checked={showUnitCellCopies}
                label="Show neighbouring copies"
                title="Draws faint translates h D of the unit cell across its gluings, so the tiling around it is visible"
                onChange={setShowUnitCellCopies}
              />
              {/* Keyboard route to a chamber; the same id as the bar X vertex. */}
              <label className="field" htmlFor="unit-cell-chamber">
                <span>Unit-cell chamber</span>
                <select
                  id="unit-cell-chamber"
                  value={
                    cover.barX.vertices.some(
                      (vertex) => vertex.id === selectedNodeId,
                    )
                      ? selectedNodeId
                      : ""
                  }
                  onChange={(event) =>
                    event.target.value
                      ? handleSelectBarVertex(event.target.value)
                      : setSelectedNodeId(undefined)
                  }
                >
                  <option value="">None selected</option>
                  {cover.barX.vertices.map((vertex) => (
                    <option key={vertex.id} value={vertex.id}>
                      {vertex.label ?? vertex.id}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {model === "hat-x" ? (
            <Toggle
              checked={bigonsAsTwoEdges}
              label="Show bigons as two edges"
              title="Each generator bigon is the pair of lifts x to xs and xs to x; by default the pair is drawn as one rail"
              onChange={setBigonsAsTwoEdges}
            />
          ) : null}
        </Panel>
      </aside>

      <main className="main-stage">
        <header className="top-strip">
          <div className="app-title">
            <h1>CoxeterViewer5D</h1>
          </div>
          <div className="stats-row">
            <Stat label="Vertices" value={semanticNodeCount} />
            <Stat label="Edges" value={semanticEdgeCount} />
            <Stat label="Cells" value={showCells ? scene.cells.length : 0} />
            {model === "bar-x" && wallSystem ? (
              <Stat label="Walls" value={wallSystem.walls.length} />
            ) : null}
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              type="button"
              title="Guided tour"
              aria-label="Start guided tour"
              onClick={startTour}
            >
              <CircleQuestionMark size={17} />
            </button>
            <button
              className="icon-button"
              type="button"
              title={
                colorScheme === "dark" ? "Use light theme" : "Use dark theme"
              }
              aria-label={
                colorScheme === "dark" ? "Use light theme" : "Use dark theme"
              }
              onClick={toggleColorScheme}
            >
              {colorScheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className="icon-button"
              type="button"
              title={viewerOnly ? "Restore controls (U)" : "Viewer only (U)"}
              aria-label={viewerOnly ? "Restore controls" : "Viewer only"}
              onClick={() => {
                setViewerOnly((current) => !current);
                setSceneLayoutVersion((current) => current + 1);
              }}
            >
              {viewerOnly ? <Minimize2 size={17} /> : <Expand size={17} />}
            </button>
            <button
              className="icon-button"
              type="button"
              title="Export PNG"
              aria-label="Export PNG"
              onClick={() => void handleCapture()}
            >
              <ImageDown size={17} />
            </button>
          </div>
        </header>

        <div className="viewer-frame">
          <SceneView
            nodes={displayScene.nodes}
            edges={displayScene.edges}
            cells={displayScene.cells}
            generators={scene.generators}
            structureVersion={structureVersion}
            appearanceVersion={appearanceVersion}
            layoutVersion={sceneLayoutVersion}
            selectedNodeId={selectedNodeId}
            selectedNodeScale={
              sourceModelActive ? SOURCE_SELECTED_NODE_SCALE : 1
            }
            selectedCellId={selectedCellId}
            showCells={showCells}
            showNodeLabels={showNodeLabels}
            showEdgeLabels={showEdgeLabels}
            showReferenceBall={
              model === "projection" && Boolean(scene.referenceBallRadius)
            }
            referenceBallRadius={scene.referenceBallRadius}
            labelScope={showNodeLabels || showEdgeLabels ? "budgeted" : "off"}
            localCellRenderMode="in-graph"
            cellOpacity={model === "bar-x" ? 0.16 : 0.24}
            topologyMode={model === "hat-x" || model === "bar-x"}
            cameraFocusTarget={
              unitCellBase?.camera?.target ??
              (coverCameraOffset ? SCENE_ORIGIN : undefined)
            }
            cameraFocusOffset={
              unitCellBase?.camera?.offset ?? coverCameraOffset
            }
            cameraPreset="global"
            occlusionMode={focusActive ? "fade-far" : "hide-far"}
            semanticLabelsOnly={
              model === "hat-x" || model === "bar-x" || model === "gamma"
            }
            colorScheme={colorScheme}
            sceneLabel={`${currentModel.teachingLabel} viewer`}
            workerGenerationMs={generation.generationMs}
            onCapturePngReady={handleCapturePngReady}
            onRenderStats={renderStatsStore.publish}
            onSelectNode={handleSceneSelectNode}
            onSelectCell={handleSceneSelectCell}
            onSelectEdge={handleSceneSelectEdge}
            // Edge colours mean walls, not generators, in this mode.
            showGeneratorLegend={
              !(
                (model === "hat-x" || model === "bar-x") &&
                showWalls &&
                colorEdgesByWall
              )
            }
          />
          {viewerOnly ? (
            <button
              type="button"
              className="viewer-ui-toggle"
              aria-keyshortcuts="U"
              onClick={() => {
                setViewerOnly(false);
                setSceneLayoutVersion((current) => current + 1);
              }}
            >
              <Minimize2 size={15} /> Show controls (U)
            </button>
          ) : null}
          {(model === "hat-x" || model === "bar-x") && cover ? (
            <div
              className={`cover-view-switch${viewerOnly ? " below-ui-toggle" : ""}`}
              role="group"
              aria-label="Cover view"
            >
              <button
                type="button"
                aria-pressed={coverView === "3d"}
                onClick={() => setCoverView("3d")}
              >
                3D
              </button>
              <button
                type="button"
                aria-pressed={coverView === "atlas"}
                onClick={() => setCoverView("atlas")}
              >
                Cell atlas
              </button>
            </div>
          ) : null}
          {model === "davis" && cover ? (
            <div
              className={`cover-view-switch${viewerOnly ? " below-ui-toggle" : ""}`}
              role="group"
              aria-label="Davis view"
            >
              <button
                type="button"
                aria-pressed={davisView === "ball"}
                onClick={() => setDavisView("ball")}
              >
                Ball
              </button>
              <button
                type="button"
                aria-pressed={davisView === "unit-cell"}
                title="A fundamental domain of H in the Davis complex, with its gluings"
                onClick={() => setDavisView("unit-cell")}
              >
                Unit cell
              </button>
            </div>
          ) : null}
          {/* The atlas covers the canvas instead of replacing it: SceneView
              stays mounted, so returning to 3D keeps the camera and skips a
              full scene rebuild (seconds for C44's 364 cells). */}
          {(model === "hat-x" || model === "bar-x") &&
          cover &&
          coverView === "atlas" ? (
            <CellAtlas
              cover={cover}
              complex={model}
              wallSystem={wallSystem}
              coorientation={coorientation}
              lawfulSubcomplex={lawfulSubcomplex}
              selectedWallId={activeSelectedWallId}
              generators={scene.generators}
              colorScheme={colorScheme}
              selectedCellId={selectedCellId}
              onSelectCell={handleAtlasSelectCell}
            />
          ) : null}
          {viewerBadges.length > 0 && !sceneEmpty ? (
            <ul className="viewer-badges" aria-label="Drawing status">
              {viewerBadges.map((badge) => (
                <li key={badge}>{badge}</li>
              ))}
            </ul>
          ) : null}
          {sceneEmpty ? (
            <div className="viewer-empty-overlay">
              <strong>
                {unitCellBase?.unavailableReason
                  ? "The unit cell cannot be drawn for this system."
                  : `No ${currentModel.teachingLabel} data is loaded.`}
              </strong>
              <span>
                {unitCellBase?.unavailableReason ??
                  coverMessage ??
                  generation.error}
              </span>
            </div>
          ) : null}
          {generation.pending &&
          !unitCellActive &&
          (model === "davis" || model === "projection") ? (
            <div className="viewer-progress">Generating radius {radius}…</div>
          ) : null}
          {coverState.analysisPending ? (
            <div className="viewer-progress">
              Analyzing the imported cover in a background worker…
            </div>
          ) : coverState.coorientationPending ? (
            <div className="viewer-progress">
              Updating lawful cells and directed links…
            </div>
          ) : null}
        </div>
      </main>

      <aside className="right-rail" aria-label="Inspector and research tools">
        <ResearchInspector
          modelLabel={currentModel.teachingLabel}
          modelDescription={currentModel.whyUseIt}
          summary={inspectorSummary}
          warnings={warnings}
        />

        {uiMode === "research" ? (
          <>
            <Panel title="Data + Status">
              <dl className="inspector-definition-list">
                <StatusRow
                  label="Source data"
                  value={system.dataStatus ?? "unspecified"}
                />
                <StatusRow
                  label="Cover action"
                  value={cover?.hatX.provenance.actionEvidence ?? "not loaded"}
                />
                <StatusRow
                  label="Torsion-free evidence"
                  value={
                    cover?.hatX.provenance.torsionFreeEvidence ?? "not loaded"
                  }
                />
                <StatusRow
                  label="Automatic cover search"
                  value={coverDiscovery.status}
                />
                <StatusRow
                  label="Necessary index divisor"
                  value={coverDiscoveryPlan.indexLowerBound.value.decimal}
                />
                <StatusRow
                  label="Compression"
                  value={cover?.certificate.status ?? "not run"}
                />
                <StatusRow
                  label="Wall system"
                  value={
                    wallSystem ? wallDiagnosticLabel(wallSystem) : "not run"
                  }
                />
                <RenderCallsRow store={renderStatsStore} />
              </dl>
              {desktopMessage ? (
                <p className="field-help" role="status">
                  {desktopMessage}
                </p>
              ) : null}
            </Panel>
            <Panel title="Notebook + Export">
              <div className="button-row">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => void handleExport()}
                >
                  <FileJson size={16} /> Export experiment
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => void handleCapture()}
                >
                  <Download size={16} /> Export figure
                </button>
              </div>
              <p className="field-help">
                The experiment bundle records the discovery request and
                artifact, source cover, compression map, wall classes,
                coorientation, lawful cells, link checks, and view state.
              </p>
            </Panel>
          </>
        ) : null}

        <Panel title="Interface">
          <div className="segmented" role="group" aria-label="Interface mode">
            <button
              type="button"
              aria-pressed={uiMode === "teaching"}
              onClick={() => setUiMode("teaching")}
            >
              Teaching
            </button>
            <button
              type="button"
              aria-pressed={uiMode === "research"}
              onClick={() => setUiMode("research")}
            >
              Research
            </button>
          </div>
        </Panel>
      </aside>
      {tourOpen ? (
        <GuidedTour
          steps={tourSteps}
          onStepEnter={handleTourStepEnter}
          onClose={handleTourClose}
        />
      ) : null}
    </div>
  );
}

function emptyScene(message?: string): RenderScene {
  return {
    nodes: [],
    edges: [],
    cells: [],
    generators: [],
    warnings: message ? [message] : [],
  };
}

function buildInspectorSummary(args: {
  model: TopLevelModelId;
  systemName: string;
  scene: RenderScene;
  selectedNodeId?: string;
  selectedCellId?: string;
  selectedEdgeId?: string;
  selectedWallId?: string;
  cover?: CoverCompressionResult;
  wallSystem?: ReturnType<typeof findWallSystem>;
  lawfulSubcomplex?: ReturnType<typeof evaluateLawfulSubcomplex>;
  morseLinks?: ReturnType<typeof deriveMorseLinks>;
  linkLens: "none" | "ascending" | "descending";
  selectedBarVertexId?: string;
}): InspectorSummary {
  const selectedNode = args.scene.nodes.find(
    (node) => node.id === args.selectedNodeId,
  );
  const selectedCell = args.scene.cells.find(
    (cell) => cell.id === args.selectedCellId,
  );
  const selectedEdge = args.selectedEdgeId
    ? args.scene.edges.find((edge) => edge.id === args.selectedEdgeId)
    : undefined;
  if (selectedEdge) {
    const nodeLabel = (id: string) => {
      const node = args.scene.nodes.find((candidate) => candidate.id === id);
      return node?.label ?? id;
    };
    const generator =
      selectedEdge.semanticLabelKind === "coxeter-order"
        ? undefined
        : args.scene.generators[selectedEdge.generator];
    const endpoints = `${nodeLabel(selectedEdge.source)} and ${nodeLabel(selectedEdge.target)}`;
    return {
      selected: generator
        ? `An edge labelled ${generator.label}, joining ${endpoints}.`
        : `An edge of ${modelExplanations[args.model].teachingLabel}, joining ${endpoints}.`,
      reason:
        args.model === "gamma"
          ? "Gamma has an edge for each pair of generators with finite m."
          : generator
            ? `With right multiplication, w and w·${generator.label} are joined by an edge labelled ${generator.label}.`
            : "It is one of the edges of the current complex.",
      status:
        "The edge and its label are data; where it is drawn is a drawing convention.",
      details: [
        { label: "Edge", value: selectedEdge.id },
        { label: "Endpoints", value: endpoints },
      ],
    };
  }
  if (
    args.model === "bar-x" &&
    args.linkLens !== "none" &&
    args.selectedBarVertexId &&
    args.morseLinks
  ) {
    const vertexLinks = args.morseLinks.vertices.find(
      (entry) => entry.vertexId === args.selectedBarVertexId,
    );
    const link = vertexLinks?.[args.linkLens];
    if (link) {
      const title = args.linkLens === "ascending" ? "Ascending" : "Descending";
      return {
        selected: `${title} link at ${args.selectedBarVertexId} in bar X.`,
        reason: `The active wall coorientation points along exactly ${link.vertices.length} incident edge ends in the ${args.linkLens} direction. Relation-cell corners join those link vertices when the whole crossing pattern points consistently at this vertex.`,
        status:
          "The wall classes, induced directions, and link incidences are exact browser-derived combinatorics for the loaded compression. Their 3D placement and highlighting are drawings.",
        details: [
          { label: "Link vertices", value: link.vertices.length },
          { label: "Link edges", value: link.corners.length },
          { label: "Components", value: link.components.length },
          { label: "Nonempty", value: link.nonempty ? "yes" : "no" },
          { label: "Connected", value: link.connected ? "yes" : "no" },
        ],
      };
    }
  }
  if (
    !selectedCell &&
    args.model === "bar-x" &&
    args.wallSystem &&
    args.selectedWallId
  ) {
    const wall = args.wallSystem.walls.find(
      (entry) => entry.id === args.selectedWallId,
    );
    if (wall) {
      return {
        selected: `${wallLabel(args.wallSystem, wall.id)}, an abstract wall in bar X.`,
        reason: `Its ${wall.edgeIds.length} edges lie in one equivalence class generated by opposition in relation polygons.`,
        status:
          "The wall class, crossing incidences, and coorientation parity are exact browser-derived combinatorics. Straight wall arcs and 3D positions are drawings.",
        details: [
          { label: "Dual edges", value: wall.edgeIds.length },
          { label: "Crossing segments", value: wall.crossingSegmentIds.length },
          { label: "Relation cells met", value: wall.cellIds.length },
          { label: "Two-sided", value: wall.twoSided ? "yes" : "no" },
          {
            label: "Lawful cells retained",
            value:
              args.lawfulSubcomplex?.retainedCellIds.length ?? "not checked",
          },
        ],
      };
    }
  }
  if (selectedCell) {
    const lawful = args.lawfulSubcomplex?.cells.find(
      (cell) => cell.cellId === selectedCell.id,
    );
    const firstGenerator =
      args.scene.generators[selectedCell.generatorPair[0]]?.label ??
      `s${selectedCell.generatorPair[0]}`;
    const secondGenerator =
      args.scene.generators[selectedCell.generatorPair[1]]?.label ??
      `s${selectedCell.generatorPair[1]}`;
    return {
      selected: `${selectedCell.id}, a relation cell in ${modelExplanations[args.model].teachingLabel}.`,
      reason: `Its boundary alternates ${firstGenerator} and ${secondGenerator}. ${
        lawful
          ? lawful.lawful
            ? "The active coorientation gives one source and one sink."
            : `The boundary has ${lawful.transitionCount} sign transitions, so this cell is not lawful.`
          : "No wall coorientation is active in this model."
      }`,
      status:
        args.model === "projection"
          ? "The cell incidence is exact in the loaded ball; its projected surface is a drawing."
          : "The boundary ids are combinatorial data. The filled polygon and its 3D shape are drawing conventions.",
      details: [
        {
          label: "Boundary length",
          value: selectedCell.boundaryNodeIds.length,
        },
        ...(lawful
          ? [
              { label: "Lawful", value: lawful.lawful ? "yes" : "no" },
              {
                label: "Boundary signs",
                value: lawful.boundarySigns
                  .map((sign) => (sign === 1 ? "+" : "-"))
                  .join(" "),
              },
              ...(lawful.sourceVertexId
                ? [{ label: "Source", value: lawful.sourceVertexId }]
                : []),
              ...(lawful.sinkVertexId
                ? [{ label: "Sink", value: lawful.sinkVertexId }]
                : []),
            ]
          : []),
      ],
    };
  }
  if (selectedNode) {
    return {
      selected: `${selectedNode.label ?? selectedNode.id}, a vertex in ${modelExplanations[args.model].teachingLabel}.`,
      reason:
        args.model === "hat-x"
          ? "It is a lift of the presentation-complex base vertex under the supplied finite action."
          : args.model === "bar-x"
            ? "Compression preserves the vertices of hat X."
            : `It belongs to the current view of ${args.systemName}.`,
      status:
        args.model === "projection"
          ? "The chamber word is data; the 3D position is a hyperbolic projection drawing."
          : "The vertex id and incidence are data; its 3D position is a drawing.",
      details: [{ label: "Id", value: selectedNode.id }],
    };
  }
  const torsionEvidence = args.cover?.hatX.provenance.torsionFreeEvidence;
  return {
    selected: `The ${modelExplanations[args.model].teachingLabel} view for ${args.systemName}.`,
    reason: modelExplanations[args.model].whyUseIt,
    status:
      args.model === "hat-x" || args.model === "bar-x"
        ? torsionEvidence === "supplied-passed"
          ? "Cellular incidence and the attached external torsion-free certificate passed. The 3D layout is a drawing."
          : torsionEvidence === "in-repo-checked"
            ? "Cellular incidence passed exact in-repo checks, with in-repo torsion evidence. The 3D layout is a drawing."
            : "Cellular incidence is derived exactly from the supplied finite action. Torsion-freeness still requires its own certificate. The layout is a drawing."
        : args.model === "projection"
          ? "Source and certificate metadata are data; the 3D projection is a drawing unless a bound is explicitly certified."
          : "Source relations and generated incidence carry their displayed status; positions are drawing conventions.",
  };
}

function activeWarnings(args: {
  model: TopLevelModelId;
  sceneWarnings: string[];
  cover?: CoverCompressionResult;
  coverError?: string;
  wallSystem?: ReturnType<typeof findWallSystem>;
  searchError?: string;
  isCompact: boolean;
}): string[] {
  const warnings = [...args.sceneWarnings];
  if (args.coverError) warnings.push(args.coverError);
  if (args.searchError) warnings.push(args.searchError);
  if ((args.model === "hat-x" || args.model === "bar-x") && args.cover) {
    if (args.cover.hatX.provenance.torsionFreeEvidence === "not-supplied") {
      warnings.push(
        "The finite action constructs a cellular cover, but no torsion-free subgroup certificate was supplied.",
      );
    }
  }
  if (args.model === "bar-x" && args.wallSystem) {
    if (!args.wallSystem.diagnostics.embedded)
      warnings.push("At least one wall is not embedded.");
    if (!args.wallSystem.diagnostics.twoSided)
      warnings.push(
        "At least one wall is one-sided and cannot be globally cooriented.",
      );
    if (!args.wallSystem.diagnostics.selfOsculationFree)
      warnings.push("At least one wall self-osculates at a vertex link.");
    warnings.push(
      "A large lawful subcomplex alone is combinatorial evidence. Track A promotion additionally requires a primitive wall character, nonempty connected directed links, the finite-height-band π₁ certificate, and kernel transfer.",
    );
  }
  if (args.isCompact) {
    warnings.push(
      "For compact 5-dimensional examples, use the coface-closed lawful complex and its actual subdivided links. CAT(0)/asphericity is useful stronger evidence but is not required for Track A finite-generation promotion.",
    );
  }
  return [...new Set(warnings.filter(Boolean))];
}

/** Subscribes to the renderer's draw-call count only. */
function RenderCallsRow({ store }: { store: RenderStatsStore }) {
  const drawCalls = useSyncExternalStore(
    store.subscribe,
    store.drawCalls,
    store.drawCalls,
  );
  return <StatusRow label="Render calls" value={drawCalls ?? "-"} />;
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function wallDiagnosticLabel(
  wallSystem: ReturnType<typeof findWallSystem>,
): string {
  const parts = [
    wallSystem.diagnostics.embedded ? "embedded" : "nonembedded",
    wallSystem.diagnostics.twoSided ? "two-sided" : "one-sided",
    wallSystem.diagnostics.selfOsculationFree
      ? "no self-osculation"
      : "self-osculation",
  ];
  return parts.join(", ");
}

function readColorScheme(): ColorScheme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(COLOR_SCHEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Storage blocked; fall through to the OS preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function asUnknownRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function exportWithDesktopBridge(
  request: DesktopExportRequest,
  browserFallback: () => void,
): Promise<void> {
  // Browser downloads must remain inside the original click activation.
  // Loading the Tauri bridge first can make Chromium reject a large Blob
  // download after the activation window has expired.
  if (!hasNativeDesktopRuntime()) {
    browserFallback();
    return;
  }
  const result = await (await loadDesktopBridge()).exportFile(request);
  if (!result.ok && result.fallbackDownload) {
    browserFallback();
    return;
  }
  if (!result.ok) {
    throw new Error(result.message ?? `Could not export ${request.fileName}.`);
  }
}

function downloadText(
  filenameContents: string,
  filename: string,
  mediaType: string,
): void {
  const blob = new Blob([filenameContents], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  document.documentElement.dataset.lastBrowserExport = filename;
  // Large research bundles are still being read after click returns in
  // Chromium. Revoking immediately can silently cancel those downloads.
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1_000);
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  window.setTimeout(() => anchor.remove(), 1_000);
}

function formatGap(gap: number | null): string {
  return gap === null ? "unknown" : String(gap);
}
