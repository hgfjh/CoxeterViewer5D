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
  family: "toy" | "compact" | "generated" | "quotient" | "walkthrough";
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
      label: "Makarov 5-prism",
      family: "compact",
      summary:
        "Inspect the certified prism source with local/projection views.",
      actionLabel: "Open example",
    },
  ];
}

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
