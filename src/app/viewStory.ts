import type {
  CayleyNode,
  CoxeterSystemInput,
  GeneratedCayleyBall,
} from "../types";
import type { LabelScope, ViewPresetId } from "./localView";

export interface WhatAmISeeingSummary {
  title: string;
  facts: string[];
}

export type WarningGroupId =
  | "important"
  | "approximation"
  | "omitted"
  | "backend";

export interface WarningGroup {
  id: WarningGroupId;
  label: string;
  warnings: string[];
}

/**
 * Short, mode-aware explanation for the visible scene.
 *
 * This is user-facing storytelling, not a validator. It summarizes status
 * already computed by the data pipeline and keeps exact/proxy/projection
 * language close to the current view.
 */
export function buildWhatAmISeeingSummary(input: {
  system: CoxeterSystemInput;
  ball: GeneratedCayleyBall | undefined;
  selectedNode: CayleyNode | undefined;
  mode: "shell" | "geometric";
  graphView: "global" | "on-graph";
  localDepth: number;
  labelScope: LabelScope;
  activePreset: ViewPresetId;
  visibleNodeCount: number;
  visibleEdgeCount: number;
  visibleRankTwoCellCount: number;
  visibleHigherProxyCount: number;
  geometryAvailable: boolean;
  geometryCertified: boolean;
  exactIncidenceCount: number;
  isYGammaBaseComplex?: boolean;
  yGammaMainView?: "complex" | "nerve";
}): WhatAmISeeingSummary {
  const radius = input.ball?.metadata.radius ?? "?";
  const selected = input.selectedNode?.id ?? "none";
  const viewFact = input.isYGammaBaseComplex
    ? input.yGammaMainView === "nerve"
      ? "Nerve diagnostic: the main viewer shows generator vertices, finite rank-two chords, and spherical simplices derived from Y_Gamma. This is not the complex itself."
      : "Y_Gamma complex view: the main 3D viewer shows the 2-skeleton as one object: a base vertex, oriented generator arrows, and filled rank-two relation sheets glued to those arrows."
    : input.graphView === "on-graph"
      ? `Local Chamber 3D: selected chamber ${selected} is centered; only the distance-${input.localDepth} graph neighborhood is drawn with visual cell-panel offsets when cells are enabled.`
      : "Global view: the full generated finite-radius ball is drawn subject to render budgets.";
  const geometryFact =
    input.mode === "geometric"
      ? input.geometryCertified
        ? "Geometric mode uses certified interval diagnostics for reflections; the 3D projection is still a visualization."
        : "Geometric mode projects hyperbolic chamber barycenters to 3D for inspection."
      : "Shell mode is a deterministic drawing convention for the Cayley graph, not hyperbolic geometry.";
  const davisFact =
    input.visibleHigherProxyCount > 0
      ? `${input.visibleRankTwoCellCount} exact rank-two Davis cells and ${input.visibleHigherProxyCount} higher-rank visual proxies are visible.`
      : `${input.visibleRankTwoCellCount} exact rank-two Davis cells are visible.`;

  return {
    title: input.isYGammaBaseComplex
      ? input.yGammaMainView === "nerve"
        ? "Nerve diagnostic derived from Y_Gamma"
        : "Y_Gamma fundamental-domain cell complex"
      : input.graphView === "on-graph"
        ? "Local chamber neighborhood"
        : "Finite-radius Cayley ball",
    facts: [
      `Dataset: ${input.system.name}; radius ${radius}; preset ${input.activePreset}.`,
      viewFact,
      `Visible scene: ${input.visibleNodeCount} nodes and ${input.visibleEdgeCount} edges; label scope is ${input.labelScope}.`,
      davisFact,
      `${input.exactIncidenceCount} exact Davis incidence records are available in the current ball.`,
      input.geometryAvailable
        ? geometryFact
        : "This dataset has no usable hyperbolic geometry data, so geometric projection is disabled.",
    ],
  };
}

/**
 * Groups warnings by the action a reader is likely to take.
 */
export function groupWarnings(warnings: string[]): WarningGroup[] {
  const buckets: Record<WarningGroupId, string[]> = {
    important: [],
    approximation: [],
    omitted: [],
    backend: [],
  };

  for (const warning of [...new Set(warnings)]) {
    const lower = warning.toLowerCase();
    if (
      lower.includes("placeholder") ||
      lower.includes("invalid") ||
      lower.includes("error") ||
      lower.includes("must not")
    ) {
      buckets.important.push(warning);
    } else if (
      lower.includes("approx") ||
      lower.includes("projection") ||
      lower.includes("numerical") ||
      lower.includes("rounded") ||
      lower.includes("visualization")
    ) {
      buckets.approximation.push(warning);
    } else if (
      lower.includes("omitted") ||
      lower.includes("hidden") ||
      lower.includes("truncated") ||
      lower.includes("local") ||
      lower.includes("budget")
    ) {
      buckets.omitted.push(warning);
    } else {
      buckets.backend.push(warning);
    }
  }

  const groups: WarningGroup[] = [
    { id: "important", label: "Important", warnings: buckets.important },
    {
      id: "approximation",
      label: "Approximation",
      warnings: buckets.approximation,
    },
    { id: "omitted", label: "Omitted by view", warnings: buckets.omitted },
    { id: "backend", label: "Backend/status", warnings: buckets.backend },
  ];
  return groups.filter((group) => group.warnings.length > 0);
}
