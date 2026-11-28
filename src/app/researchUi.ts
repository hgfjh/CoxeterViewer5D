import type { TopologyLensId } from "./researchWorkflow";
import type { ViewPresetId } from "./localView";

export type UiMode = "teaching" | "research";

export type ViewComparisonMode =
  | "single"
  | "davis-vs-ygamma"
  | "ygamma-vs-quotient"
  | "projection-vs-local";

export interface Annotation {
  id: string;
  label: string;
  body: string;
  targetKind: "node" | "edge" | "cell" | "view";
  targetId?: string;
  createdAt: string;
}

export interface CameraBookmark {
  id: string;
  label: string;
  createdAt: string;
  preset: ViewPresetId;
  topologyLensId: TopologyLensId;
  selectedNodeId?: string;
  selectedCellId?: string;
  activeGeneratorPairKey?: string;
  yGammaCameraBookmark?: string;
}

export interface FigureExportBundle {
  schemaVersion: 1;
  kind: "coxeter-figure-export";
  createdAt: string;
  dataset: {
    id: string;
    label: string;
  };
  view: {
    uiMode: UiMode;
    preset: ViewPresetId;
    comparisonMode: ViewComparisonMode;
    topologyLensId: TopologyLensId;
    yGammaReadableView?: unknown;
  };
  selected: {
    nodeId?: string;
    cellId?: string;
    generatorPairKey?: string;
  };
  annotations: Annotation[];
  bookmarks: CameraBookmark[];
  screenshot?: {
    mimeType: "image/png";
    dataUrl: string;
  };
}

export interface ExampleGalleryEntry {
  id: string;
  label: string;
  family:
    | "toy"
    | "compact"
    | "generated"
    | "quotient"
    | "walkthrough"
    | "catalogue";
  summary: string;
  actionLabel: string;
}

export interface CompactResearchCatalogueNotice {
  id:
    | "makarov-p0-p1"
    | "tumarkin-06-15"
    | "makarov-p2"
    | "tumarkin-g12221"
    | "h5-p7-22";
  label: string;
  status: string;
  summary: string;
  sourceAvailability: "bundled-source" | "external-evidence-required";
}

const deterministicTimestamp = "1970-01-01T00:00:00.000Z";

export const viewComparisonOptions: Array<{
  id: ViewComparisonMode;
  label: string;
  summary: string;
}> = [
  {
    id: "single",
    label: "Single View",
    summary: "Show the active scene without a comparison overlay.",
  },
  {
    id: "davis-vs-ygamma",
    label: "Davis vs Y_Gamma",
    summary:
      "Compare universal Davis cells with the one-vertex fundamental-domain complex.",
  },
  {
    id: "ygamma-vs-quotient",
    label: "Y_Gamma vs Quotient",
    summary:
      "Compare the base fundamental domain with imported quotient/coset data.",
  },
  {
    id: "projection-vs-local",
    label: "Projection vs Local",
    summary:
      "Compare geometric projection status with the local combinatorial view.",
  },
];

/**
 * These notices describe research priority and evidence boundaries. They do
 * not promote a source example to a finite action or a fibering certificate.
 */
export const compactResearchCatalogueNotices: CompactResearchCatalogueNotice[] =
  [
    {
      id: "makarov-p0-p1",
      label: "Makarov P0 / P1",
      status: "paired primary campaign",
      summary:
        "Treat P0 and its index-two P1 double as one finite-action campaign.",
      sourceAvailability: "bundled-source",
    },
    {
      id: "tumarkin-06-15",
      label: "Tumarkin G11411 #06 / #15",
      status: "paired bounded comparison",
      summary:
        "Run #06 and #15 as peers under the same bounded search, not as mathematical exclusions.",
      sourceAvailability: "bundled-source",
    },
    {
      id: "makarov-p2",
      label: "Makarov P2",
      status: "Track B archived / NR affine CEGAR inconclusive",
      summary:
        "The declared 240-record multi-cellulation Track B portfolio is archived: one selected record and all 239 batch records have exact bad-link witnesses, with no prefix survivor or unresolved record. This closes only the declared characters, cellulations, gauges, and pulling subdivision—not Track B or P2 fibering in general. In the rank-312 Niblo-Reeves cubing, the canonical primitive coorientation and all sheet-independent projected-wall flips are closed. The exact component bridge is implemented, but common-family and key-specific affine residual CEGAR both reached their 32-round limits with exact bad sheets and found neither a principal survivor nor an obstruction. The gated frontier did not run. General component-resolved orientations remain open; these affine ansatzes are now deprioritized.",
      sourceAvailability: "bundled-source",
    },
    {
      id: "tumarkin-g12221",
      label: "Tumarkin G12221",
      status: "catalogued / deferred",
      summary:
        "The certified source is bundled, but this campaign is deferred; it is not mathematically excluded.",
      sourceAvailability: "bundled-source",
    },
    {
      id: "h5-p7-22",
      label: "H5-P7-22",
      status: "cover studied / no wall fibering",
      summary:
        "The certified source is bundled. Its index-39,628,800 torsion-free cover has one-sided walls; on the two-sided index-79,257,600 cover, CP-SAT shows every wall orientation leaves at least 818,128 chambers failing the first low-barycentric gate. Other covers and non-wall cocycles remain open. The large action is not bundled; see h5-p7-22_index39628800/.",
      sourceAvailability: "bundled-source",
    },
  ];

/**
 * Gallery entries are navigation affordances, not a source catalogue.
 */
export function defaultGalleryEntries(): ExampleGalleryEntry[] {
  return [
    {
      id: "walkthrough:hexagon",
      label: "Find a hexagon",
      family: "walkthrough",
      summary: "Focus an m=3 pair and read the alternating relation boundary.",
      actionLabel: "Start guide",
    },
    {
      id: "walkthrough:rank-three",
      label: "Understand a rank-three cell",
      family: "walkthrough",
      summary: "Open A3 and inspect square/hexagon incidence in Y_Gamma.",
      actionLabel: "Start guide",
    },
    {
      id: "quotient:i2-5",
      label: "I2(5) quotient/game demo",
      family: "quotient",
      summary: "Load the certified identity-subgroup quotient and cocycle.",
      actionLabel: "Open workflow",
    },
    {
      id: "jnw:cube-graph",
      label: "JNW cube legal-system demo",
      family: "quotient",
      summary:
        "Use the 3-cube defining graph to play the JNW state/move game with a faithful right-angled example.",
      actionLabel: "Open JNW game",
    },
    {
      id: "compact:5-cube",
      label: "Compact 5-cube",
      family: "compact",
      summary: "Use compact local topology presets and certification badges.",
      actionLabel: "Open example",
    },
    {
      id: "compact:5-prism",
      label: "Makarov 5-prism P0",
      family: "compact",
      summary:
        "Open the P0 half of the paired P0/P1 primary finite-action campaign.",
      actionLabel: "Open primary target",
    },
    {
      id: "compact:5-polytope-p1",
      label: "P1 double of P0",
      family: "compact",
      summary:
        "Open the index-two companion in the paired P0/P1 primary campaign.",
      actionLabel: "Open primary target",
    },
    {
      id: "compact:5-prism-p2",
      label: "Makarov 5-prism P2",
      family: "compact",
      summary:
        "Inspect the archived 240-record Track B portfolio and the bounded-inconclusive rank-312 component-resolved Niblo-Reeves CEGAR experiment. This is a scoped research result, not a cubulation or nonfibering theorem.",
      actionLabel: "View bounded experiment",
    },
    {
      id: "catalogue:8facet:all",
      label: "16 eight-facet 5D cases",
      family: "catalogue",
      summary:
        "Browse all certified Tumarkin sources; G12221 is catalogued and deferred, not excluded.",
      actionLabel: "Open catalogue",
    },
    {
      id: "catalogue:8facet:01",
      label: "Eight-facet case #1",
      family: "catalogue",
      summary:
        "Representative certified G11411 entry with exact algebraic dotted weights.",
      actionLabel: "Open catalogue",
    },
    {
      id: "catalogue:8facet:06",
      label: "Eight-facet case #06",
      family: "catalogue",
      summary:
        "One peer in the paired #06/#15 bounded finite-action comparison.",
      actionLabel: "Open comparison target",
    },
    {
      id: "catalogue:8facet:15",
      label: "Eight-facet case #15",
      family: "catalogue",
      summary:
        "One peer in the paired #06/#15 bounded finite-action comparison.",
      actionLabel: "Open comparison target",
    },
    {
      id: "catalogue:8facet:g12221",
      label: "Eight-facet G12221",
      family: "catalogue",
      summary:
        "Certified and catalogued, but deferred by campaign priority; it is not mathematically excluded.",
      actionLabel: "Open deferred source",
    },
    {
      id: "compact:5-prism-h5-p7-22",
      label: "H5-P7-22 prism",
      family: "compact",
      summary:
        "The third compact simplicial 5-prism. Its Sylow-7 cover is studied; no wall orientation of the two-sided cover fibers.",
      actionLabel: "Open example",
    },
    {
      id: "catalogue:9facet:all",
      label: "51 nine-facet 5D cases",
      family: "catalogue",
      summary:
        "Browse the complete Ma-Zheng classification of compact Coxeter 5-polytopes with 9 facets, certified in-repo.",
      actionLabel: "Open catalogue",
    },
    {
      id: "compact:3-tetrahedron-c44",
      label: "Closed 3D C(4,4;2,2;3,3)",
      family: "compact",
      summary:
        "Golden closed example: a 336-sheet PSL(2,7) cover with a wall orientation passing both low-barycentric gates.",
      actionLabel: "Open example",
    },
  ];
}

/**
 * Deterministic annotation ids keep figure bundles diffable.
 */
export function createAnnotation(input: {
  label: string;
  body: string;
  targetKind: Annotation["targetKind"];
  targetId?: string;
  createdAt?: string;
}): Annotation {
  const createdAt = input.createdAt ?? deterministicTimestamp;
  const id = `annotation:${stableHash([
    input.label,
    input.body,
    input.targetKind,
    input.targetId ?? "",
    createdAt,
  ])}`;
  return {
    id,
    label: input.label.trim() || "Annotation",
    body: input.body.trim(),
    targetKind: input.targetKind,
    targetId: input.targetId,
    createdAt,
  };
}

/**
 * Captures a named view state for experiments and paper/talk figures.
 */
export function createCameraBookmark(input: {
  label: string;
  preset: ViewPresetId;
  topologyLensId: TopologyLensId;
  selectedNodeId?: string;
  selectedCellId?: string;
  activeGeneratorPairKey?: string;
  yGammaCameraBookmark?: string;
  createdAt?: string;
}): CameraBookmark {
  const createdAt = input.createdAt ?? deterministicTimestamp;
  const id = `bookmark:${stableHash(input)}`;
  return {
    id,
    label: input.label.trim() || "View bookmark",
    createdAt,
    preset: input.preset,
    topologyLensId: input.topologyLensId,
    selectedNodeId: input.selectedNodeId,
    selectedCellId: input.selectedCellId,
    activeGeneratorPairKey: input.activeGeneratorPairKey,
    yGammaCameraBookmark: input.yGammaCameraBookmark,
  };
}

function stableHash(parts: unknown): string {
  const text = JSON.stringify(parts);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
