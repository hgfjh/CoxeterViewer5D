import type { ExperimentBundle } from "./experiments";

export type ResearchWorkflowId = "quotient-game-i2-5";

export type ResearchWorkflowStepId =
  | "source-system"
  | "subgroup-cosets"
  | "quotient-complex"
  | "cocycle-game"
  | "local-topology-export";

export interface ResearchWorkflowStep {
  id: ResearchWorkflowStepId;
  label: string;
  title: string;
  body: string;
  primaryAction: string;
}

export interface ResearchWorkflowState {
  id: ResearchWorkflowId;
  stepId: ResearchWorkflowStepId;
}

export type TopologyLensId =
  | "edge-star"
  | "cell-star"
  | "generator-family"
  | "rank-k-family"
  | "generator-star"
  | "rank-three-spherical-cell"
  | "cells-incident-edge"
  | "ascending-link"
  | "descending-link"
  | "level-link"
  | "full-local-link";

export type TopologyLensScope = "star" | "family" | "quotient-link";

export interface TopologyLensDefinition {
  id: TopologyLensId;
  label: string;
  summary: string;
  scope: TopologyLensScope;
  statusText: string;
  targetRank?: number | "k";
}

export interface TopologyLensState {
  id: TopologyLensId;
  selectedGenerator?: number;
  selectedEdgeId?: string;
  selectedCellId?: string;
  selectedRank?: number;
}

export interface WorkflowExperimentBundle extends ExperimentBundle {
  workflow?: {
    id: ResearchWorkflowId;
    stepId: ResearchWorkflowStepId;
    topologyLensId: TopologyLensId;
    quotientArtifactHash?: string;
    activeCocycleId?: string;
  };
}

const workflowSteps: ResearchWorkflowStep[] = [
  {
    id: "source-system",
    label: "Source",
    title: "Choose the source Coxeter system",
    body: "Start with I2(5) for the golden quotient/game demo. Compact examples remain source systems until a subgroup/coset artifact is imported.",
    primaryAction: "Load I2(5)",
  },
  {
    id: "subgroup-cosets",
    label: "Subgroup",
    title: "Record the subgroup/coset request",
    body: "The demo uses the identity subgroup, so the quotient cover has one coset for every element of I2(5). The request JSON is deterministic and can be sent to Sage or GAP.",
    primaryAction: "Use identity request",
  },
  {
    id: "quotient-complex",
    label: "Quotient",
    title: "Inspect the quotient complex",
    body: "Load the certified demo quotient artifact with coset representatives, permutation actions, rank-two cells, and backend metadata.",
    primaryAction: "Load demo quotient",
  },
  {
    id: "cocycle-game",
    label: "Cocycle",
    title: "Choose the cocycle/game assignment",
    body: "The demo cocycle labels s0 by +1 and s1 by -1. Boundary sums around the decagon vanish, so ascending and descending edges are visible at each vertex.",
    primaryAction: "Show cocycle links",
  },
  {
    id: "local-topology-export",
    label: "Topology",
    title: "Inspect local topology and export",
    body: "Use topology lenses to isolate generator stars, relation cells, and ascending or descending links, then save a reproducible experiment bundle.",
    primaryAction: "Save workflow run",
  },
];

const topologyLenses: TopologyLensDefinition[] = [
  {
    id: "edge-star",
    label: "Edge Star",
    summary:
      "Show relation faces and higher cells incident to the selected edge.",
    scope: "star",
    statusText:
      "Edge-star lens: every visible cell using the focused edge is part of the local incidence story.",
  },
  {
    id: "cell-star",
    label: "Cell Star",
    summary:
      "Show chambers, edges, and neighboring cells incident to the selected cell.",
    scope: "star",
    statusText:
      "Cell-star lens: the selected cell is treated as the center of the local neighborhood.",
  },
  {
    id: "generator-family",
    label: "Generator Family",
    summary:
      "Collect cells and arrows involving one generator across the current topology view.",
    scope: "family",
    statusText:
      "Generator-family lens: all visible pieces carrying the chosen generator label are grouped together.",
  },
  {
    id: "rank-k-family",
    label: "Rank-k Family",
    summary:
      "Filter spherical-subgroup cells by rank; rank three is the first supported family.",
    scope: "family",
    targetRank: "k",
    statusText:
      "Rank-k-family lens: cells are grouped by spherical subset rank, with visual proxies named when used.",
  },
  {
    id: "generator-star",
    label: "Generator Star",
    summary: "Show cells and arrows incident to one generator.",
    scope: "star",
    statusText:
      "Generator-star lens: the chosen generator direction is the local spine.",
  },
  {
    id: "rank-three-spherical-cell",
    label: "Rank-Three Cell",
    summary: "Open the A3/Y_Gamma rank-three spherical-cell focus.",
    scope: "family",
    targetRank: 3,
    statusText:
      "Rank-three spherical-cell lens: one finite triple is isolated in the main 3D view.",
  },
  {
    id: "cells-incident-edge",
    label: "Cells Incident To Edge",
    summary: "Peel to relation faces sharing the selected generator edge.",
    scope: "star",
    statusText:
      "Cells-incident-edge lens: relation faces sharing the focused generator edge are peeled forward.",
  },
  {
    id: "ascending-link",
    label: "Ascending Link",
    summary:
      "Show quotient edges with positive cocycle value away from the selected vertex.",
    scope: "quotient-link",
    statusText:
      "Ascending-link lens: positive cocycle edges leave the selected quotient vertex.",
  },
  {
    id: "descending-link",
    label: "Descending Link",
    summary:
      "Show quotient edges with negative cocycle value away from the selected vertex.",
    scope: "quotient-link",
    statusText:
      "Descending-link lens: negative cocycle edges leave the selected quotient vertex.",
  },
  {
    id: "level-link",
    label: "Level Link",
    summary:
      "Show quotient edges with zero cocycle value away from the selected vertex.",
    scope: "quotient-link",
    statusText:
      "Level-link lens: zero cocycle edges are separated from ascending and descending directions.",
  },
  {
    id: "full-local-link",
    label: "Full Local Link",
    summary: "Show every incident quotient edge at the selected vertex.",
    scope: "quotient-link",
    statusText:
      "Full-local-link lens: every incident quotient edge at the selected vertex remains visible.",
  },
];

const topologyLensById = new Map(topologyLenses.map((lens) => [lens.id, lens]));

/**
 * Default workflow is a real, bundled quotient/game demo rather than a blank
 * builder. Compact examples enter this workflow only after quotient artifacts
 * are imported or generated by an external backend.
 */
export function defaultResearchWorkflowState(): ResearchWorkflowState {
  return { id: "quotient-game-i2-5", stepId: "source-system" };
}

export function researchWorkflowSteps(): ResearchWorkflowStep[] {
  return workflowSteps;
}

export function activeResearchWorkflowStep(
  state: ResearchWorkflowState,
): ResearchWorkflowStep {
  return (
    workflowSteps.find((step) => step.id === state.stepId) ?? workflowSteps[0]
  );
}

export function moveResearchWorkflowStep(
  state: ResearchWorkflowState,
  delta: number,
): ResearchWorkflowState {
  const index = workflowSteps.findIndex((step) => step.id === state.stepId);
  const nextIndex = Math.min(
    workflowSteps.length - 1,
    Math.max(0, (index < 0 ? 0 : index) + delta),
  );
  return { ...state, stepId: workflowSteps[nextIndex].id };
}

/**
 * Topology lenses are view presets: they filter and explain existing incidence
 * data but do not create new cells.
 */
export function topologyLensDefinitions(): TopologyLensDefinition[] {
  return topologyLenses;
}

export function topologyLensDefinition(
  id: TopologyLensId,
): TopologyLensDefinition {
  return topologyLensById.get(id) ?? topologyLenses[0];
}

export function topologyLensStatusText(id: TopologyLensId): string {
  return topologyLensDefinition(id).statusText;
}
