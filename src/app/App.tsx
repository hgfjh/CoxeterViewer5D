import {
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
import {
  buildCoverCompression,
  type CoverCompressionResult,
} from "../compression";
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
  type SceneRenderStats,
} from "../render/SceneView";
import type { GeneratedCayleyBall, HyperbolicProjection } from "../types";
import {
  FullDavisCertificationClient,
  LawfulCertificationClient,
  buildSchreierPresentationFromQuotient,
  buildVirtualAlgebraicFiberingCertificate,
  type FullDavisCoorientationSearchResult,
  type LawfulCoorientationSearchResult,
  type VirtualAlgebraicFiberingCertificate,
} from "../fibering";
import { buildIdealHyperbolic3CubeS4Cover } from "../torsionFree";
import type {
  DesktopBridge,
  DesktopExportRequest,
  DesktopMenuCommand,
} from "../desktop/bridge";
import {
  createWallCoorientation,
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
import { createGenerationClient } from "./generationClient";
import {
  modelExplanations,
  startHereActions,
  type StartHereActionId,
  type TopLevelModelId,
} from "./orientation";
import { ResearchInspector, type InspectorSummary } from "./ResearchInspector";
import { buildSourceComplexScene } from "./sourceComplexScene";
import { buildWallScene, wallLabel } from "./wallScene";
import { createQuotientValidationClient } from "./quotientValidationClient";
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
const IDEAL_3_CUBE_EXAMPLE_ID = "ideal_hyperbolic_3_cube_m3";
const COLOR_SCHEME_KEY = "coxeter-viewer:color-scheme";

let desktopBridgePromise: Promise<DesktopBridge> | undefined;
let ideal3CubeS4Cover: QuotientComplex | undefined;

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
  const [exampleId, setExampleId] = useState("I2_5");
  const [model, setModel] = useState<TopLevelModelId>("bar-x");
  const [radius, setRadius] = useState(5);
  const [projection, setProjection] =
    useState<HyperbolicProjection>("poincare-axes");
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
  const [renderStats, setRenderStats] = useState<SceneRenderStats>();
  const [sceneLayoutVersion, setSceneLayoutVersion] = useState(0);
  const [desktopMessage, setDesktopMessage] = useState<string>();
  const capturePngRef = useRef<(() => Promise<string>) | undefined>(undefined);
  const desktopMenuHandlerRef = useRef<(command: DesktopMenuCommand) => void>(
    () => undefined,
  );
  const coverDiscoveryRunRef = useRef(0);
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
    () => buildAutomaticCoverSearchPlan(system, coverDiscoveryOptions),
    [coverDiscoveryOptions, system],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = colorScheme;
    localStorage.setItem(COLOR_SCHEME_KEY, colorScheme);
  }, [colorScheme]);

  useEffect(() => {
    return () => {
      generationClient.dispose();
      wallSearchClient.dispose();
      lawfulCertificationClient.dispose();
      fullDavisCertificationClient.dispose();
      quotientValidationClient.dispose();
    };
  }, [
    fullDavisCertificationClient,
    generationClient,
    lawfulCertificationClient,
    quotientValidationClient,
    wallSearchClient,
  ]);

  useEffect(() => {
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
        if (!active) return;
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

  const coverBuild = useMemo(() => {
    if (!coverSource)
      return {} as { result?: CoverCompressionResult; error?: string };
    try {
      return { result: buildCoverCompression(coverSource) };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [coverSource]);
  const cover = coverBuild.result;
  const barRelationFamilies = useMemo(
    () => (cover ? listBarXRelationFamilies(cover) : []),
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
  const wallSystem = useMemo(
    () => (cover ? findWallSystem(cover.barX) : undefined),
    [cover],
  );
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

  const coorientation = useMemo(
    () =>
      wallSystem ? createWallCoorientation(wallSystem, wallSigns) : undefined,
    [wallSigns, wallSystem],
  );
  const lawfulSubcomplex = useMemo(
    () =>
      cover && coorientation
        ? evaluateLawfulSubcomplex(cover.barX, coorientation)
        : undefined,
    [coorientation, cover],
  );
  const morseLinks = useMemo(
    () =>
      cover && coorientation && lawfulSubcomplex
        ? deriveMorseLinks(cover.barX, coorientation, lawfulSubcomplex)
        : undefined,
    [coorientation, cover, lawfulSubcomplex],
  );
  const schreierPresentation = useMemo(() => {
    if (!coverSource) return undefined;
    try {
      return buildSchreierPresentationFromQuotient(coverSource);
    } catch {
      // The certificate builder records the full presentation error. Keeping
      // this cache optional lets malformed imports reach that diagnostic path.
      return undefined;
    }
  }, [coverSource]);
  const virtualFiberingCertificate = useMemo<
    VirtualAlgebraicFiberingCertificate | undefined
  >(() => {
    if (
      !coverSource ||
      !cover ||
      !wallSystem ||
      !coorientation ||
      !lawfulSubcomplex ||
      !morseLinks
    ) {
      return undefined;
    }
    return buildVirtualAlgebraicFiberingCertificate({
      quotient: coverSource,
      cover,
      wallSystem,
      coorientation,
      lawfulSubcomplex,
      morseLinks,
      schreierPresentation,
    });
  }, [
    coorientation,
    cover,
    coverSource,
    lawfulSubcomplex,
    morseLinks,
    schreierPresentation,
    wallSystem,
  ]);

  const sourceScene = useMemo(
    () =>
      generation.ball
        ? buildSourceComplexScene(system, generation.ball, {
            selectedNodeId,
            selectedCellId,
            geometric: model === "projection",
            projection,
          })
        : emptyScene(generation.error),
    [
      generation.ball,
      generation.error,
      model,
      projection,
      selectedCellId,
      selectedNodeId,
      system,
    ],
  );
  const gammaScene = useMemo(() => buildDefiningGraphScene(system), [system]);
  const hatScene = useMemo(
    () =>
      cover
        ? buildHatXScene(cover.hatX, {
            selectedVertexId: selectedNodeId,
            selectedCellId,
            showRelationCells: showCells,
          })
        : emptyScene(coverBuild.error ?? coverImportError),
    [
      cover,
      coverBuild.error,
      coverImportError,
      selectedCellId,
      selectedNodeId,
      showCells,
    ],
  );
  const barScene = useMemo(
    () =>
      cover && wallSystem
        ? buildWallScene(cover.barX, wallSystem, {
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
            linkLens,
          })
        : emptyScene(coverBuild.error ?? coverImportError),
    [
      coorientation,
      cover,
      coverBuild.error,
      coverImportError,
      lawfulSubcomplex,
      activeBarVertexId,
      activeBarRelationPair,
      spreadBarRelationCells,
      linkLens,
      selectedCellId,
      activeSelectedWallId,
      colorEdgesByWall,
      showDiscardedCells,
      showCells,
      showInducedDirections,
      showWalls,
      wallDisplayMode,
      wallSystem,
    ],
  );
  const scene = useMemo<RenderScene>(() => {
    if (model === "gamma") {
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
    if (model === "hat-x") return hatScene;
    if (model === "bar-x") return barScene;
    return sourceScene;
  }, [barScene, gammaScene, hatScene, model, sourceScene, system.generators]);

  const currentModel = modelExplanations[model];
  const inspectorSummary = useMemo(
    () =>
      buildInspectorSummary({
        model,
        systemName: system.name,
        scene,
        selectedNodeId,
        selectedCellId,
        selectedWallId: activeSelectedWallId,
        cover,
        wallSystem,
        lawfulSubcomplex,
        morseLinks,
        linkLens,
        selectedBarVertexId: activeBarVertexId,
      }),
    [
      activeBarVertexId,
      activeSelectedWallId,
      cover,
      lawfulSubcomplex,
      linkLens,
      model,
      morseLinks,
      scene,
      selectedCellId,
      selectedNodeId,
      system.name,
      wallSystem,
    ],
  );
  const warnings = useMemo(
    () =>
      activeWarnings({
        model,
        sceneWarnings: scene.warnings,
        cover,
        coverError: coverBuild.error ?? coverImportError,
        wallSystem,
        searchError,
        isCompact: example.role === "compact",
      }),
    [
      cover,
      coverBuild.error,
      coverImportError,
      example.role,
      model,
      scene.warnings,
      searchError,
      wallSystem,
    ],
  );

  const structureVersion = [
    "scene-v2",
    model,
    example.id,
    radius,
    generation.requestId,
    cover?.hatX.vertices.length ?? 0,
    cover?.barX.geometricEdges.length ?? 0,
    activeBarRelationFamily,
    showWalls ? 1 : 0,
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
  ].join(":");

  const handleExampleChange = useCallback(
    (nextExampleId: string) => {
      coverDiscoveryRunRef.current += 1;
      setExampleId(nextExampleId);
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
    setProjection("poincare-axes");
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
  const searchStatus = searchResult
    ? searchResult.certificate.optimalityProven
      ? `Proven optimum: ${searchResult.objectiveValue ?? 0} lawful cells.`
      : `Best found: ${searchResult.objectiveValue ?? 0} lawful cells; gap ${formatGap(searchResult.certificate.absoluteGap)}.`
    : searchError;
  const fiberingSearchStatus = fiberingSearchRunning
    ? lawfulFiberingSearchResult
      ? "The lawful track did not certify; checking the complete Davis quotient."
      : "Checking the lawful 2-complex first."
    : lawfulFiberingSearchResult?.status === "found" &&
        lawfulFiberingSearchResult.certificate?.status === "passed"
      ? `The lawful 2-complex certified after ${lawfulFiberingSearchResult.candidatesEvaluated} coorientations; the full Davis check is optional.`
      : fiberingSearchResult
        ? fiberingSearchResult.status === "found"
          ? lawfulFiberingSearchResult
            ? `The lawful track did not certify; the full Davis fallback passed after ${fiberingSearchResult.candidatesEvaluated} candidates.`
            : `Found a coorientation passing the full subdivided-Davis link checks after ${fiberingSearchResult.candidatesEvaluated} candidates.`
          : fiberingSearchResult.status === "not-found"
            ? "Both exact sign-space searches finished without a certificate for this quotient."
            : `The fallback is ${fiberingSearchResult.status}; ${fiberingSearchResult.terminationReason.replaceAll("-", " ")}.`
        : lawfulFiberingSearchResult
          ? `The lawful track is ${lawfulFiberingSearchResult.status}; ${lawfulFiberingSearchResult.terminationReason.replaceAll("-", " ")}.`
          : fiberingSearchError;

  return (
    <div
      className={`app-shell${viewerOnly ? " viewer-only" : ""}`}
      data-ui-mode={uiMode}
      data-theme={colorScheme}
    >
      <aside className="sidebar" aria-label="Viewer controls">
        <Panel
          title={uiMode === "teaching" ? "Choose Example" : "Choose / Load"}
        >
          <label className="field" htmlFor="example-select">
            <span>Source Coxeter system</span>
            <select
              id="example-select"
              value={exampleId}
              onChange={(event) => handleExampleChange(event.target.value)}
            >
              <optgroup label="Core and featured examples">
                {bundledExamples
                  .filter((entry) => entry.role !== "catalogue")
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
            </select>
          </label>
          <p className="field-help" data-testid="active-source-system">
            Active source: <strong>{system.name}</strong>
            {coverSource ? " (from the finite action)" : ""}
          </p>
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
                <option value="poincare-axes">Poincare axes</option>
                <option value="poincare-pca">Poincare PCA</option>
                <option value="klein-axes">Klein axes</option>
                <option value="klein-pca">Klein PCA</option>
              </select>
            </label>
          ) : null}
        </Panel>

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
                onClick={() => setModel(modelId)}
              >
                {modelExplanations[modelId].teachingLabel}
              </button>
            ))}
          </div>
          <p className="model-switch-help">{currentModel.shortDescription}</p>
        </Panel>

        <CoversWallsPanel
          cover={cover}
          coverError={coverBuild.error ?? coverImportError}
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
          discoveryOptions={coverDiscoveryOptions}
          discoveryState={coverDiscovery}
          onDiscoveryOptionsChange={handleCoverDiscoveryOptionsChange}
          onDiscoverCover={() => void handleDiscoverCover()}
          onExportDiscoveryRequest={() => void handleExportDiscoveryRequest()}
          onImportDiscoveryArtifact={handleImportDiscoveryArtifact}
          onImportCover={handleImportCover}
          importProgress={quotientImportProgress}
          onCancelImport={() => quotientValidationClient.cancel()}
          onSelectWall={setSelectedWallId}
          onSelectVertex={(vertexId) => {
            setSelectedNodeId(vertexId);
            setSelectedCellId(undefined);
          }}
          onRelationFamilyChange={handleBarRelationFamilyChange}
          onLinkLensChange={setLinkLens}
          onFlipWall={handleFlipWall}
          onOptimize={handleOptimize}
          onFindVirtualFibering={handleFindVirtualFibering}
          onFindFullDavisFibering={handleFindFullDavisFibering}
          onExportVirtualFibering={() => void handleExportVirtualFibering()}
          onShowWallsChange={setShowWalls}
          onWallDisplayModeChange={setWallDisplayMode}
          onShowInducedDirectionsChange={setShowInducedDirections}
          onColorEdgesByWallChange={setColorEdgesByWall}
          onShowCellsChange={setShowCells}
          onShowDiscardedCellsChange={setShowDiscardedCells}
        />

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
        </Panel>
      </aside>

      <main className="main-stage">
        <header className="top-strip">
          <div className="app-title">
            <h1>CoxeterViewer5D</h1>
            <p>
              {currentModel.teachingLabel}: {currentModel.shortDescription}
            </p>
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
              title={
                colorScheme === "dark" ? "Use light theme" : "Use dark theme"
              }
              aria-label={
                colorScheme === "dark" ? "Use light theme" : "Use dark theme"
              }
              onClick={() =>
                setColorScheme((current) =>
                  current === "dark" ? "light" : "dark",
                )
              }
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
            nodes={scene.nodes}
            edges={scene.edges}
            cells={scene.cells}
            generators={scene.generators}
            structureVersion={structureVersion}
            appearanceVersion={appearanceVersion}
            layoutVersion={sceneLayoutVersion}
            selectedNodeId={selectedNodeId}
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
            cameraFocusTarget={coverCameraOffset ? [0, 0, 0] : undefined}
            cameraFocusOffset={coverCameraOffset}
            cameraPreset="global"
            semanticLabelsOnly={
              model === "hat-x" || model === "bar-x" || model === "gamma"
            }
            colorScheme={colorScheme}
            sceneLabel={`${currentModel.teachingLabel} viewer`}
            workerGenerationMs={generation.generationMs}
            onCapturePngReady={(capture) => {
              capturePngRef.current = capture;
            }}
            onRenderStats={setRenderStats}
            onSelectNode={setSelectedNodeId}
            onSelectCell={setSelectedCellId}
          />
          {sceneEmpty ? (
            <div className="viewer-empty-overlay">
              <strong>No {currentModel.teachingLabel} data is loaded.</strong>
              <span>
                {coverBuild.error ?? coverImportError ?? generation.error}
              </span>
            </div>
          ) : null}
          {generation.pending &&
          (model === "davis" || model === "projection") ? (
            <div className="viewer-progress">Generating radius {radius}...</div>
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
                <StatusRow
                  label="Render calls"
                  value={renderStats?.drawCalls ?? "-"}
                />
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
      "A large lawful subcomplex is a combinatorial result. Applying the paper's incoherence or Morse conclusions also requires its stated hypotheses.",
    );
  }
  if (args.isCompact) {
    warnings.push(
      "Compact 5-dimensional examples need not satisfy the paper's two-dimensional/asphericity hypotheses; wall calculations remain diagnostics unless those hypotheses are checked separately.",
    );
  }
  return [...new Set(warnings.filter(Boolean))];
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
  const stored = localStorage.getItem(COLOR_SCHEME_KEY);
  return stored === "dark" ? "dark" : "light";
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
