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
        "Inspect the certified [5,3,3,3,3] prism source with local/projection views.",
      actionLabel: "Open example",
    },
    {
      id: "compact:5-polytope-p1",
      label: "P1 double of P0",
      family: "compact",
      summary: "Open the verified-source Coxeter double from Emery-Kellerhals.",
      actionLabel: "Open example",
    },
    {
      id: "compact:5-prism-p2",
      label: "Makarov 5-prism P2",
      family: "compact",
      summary:
        "Open the verified-source [5,3,3,3,4] prism from Emery-Kellerhals.",
      actionLabel: "Open example",
    },
    {
      id: "catalogue:8facet:all",
      label: "15 eight-facet 5D cases",
      family: "catalogue",
      summary:
        "Browse the certified Tumarkin Table 4.10 G11411 examples without crowding the main gallery.",
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
      id: "catalogue:8facet:08",
      label: "Eight-facet case #8",
      family: "catalogue",
      summary:
        "Middle representative certified G11411 entry from Tumarkin Table 4.10.",
      actionLabel: "Open catalogue",
    },
    {
      id: "catalogue:8facet:15",
      label: "Eight-facet case #15",
      family: "catalogue",
      summary:
        "Final representative certified G11411 entry from Tumarkin Table 4.10.",
      actionLabel: "Open catalogue",
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
