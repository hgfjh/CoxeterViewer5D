export type GuidedInspectionId =
  | "find-a-hexagon"
  | "understand-rank-three-cell"
  | "inspect-ygamma"
  | "quotient-game-experiment"
  | "one-relation"
  | "rank-three-cell"
  | "local-link"
  | "ygamma-2-skeleton"
  | "quotient-game";

export interface GuidedInspectionStep {
  id: string;
  title: string;
  body: string;
  focus: "relation" | "rank-three" | "local-link" | "ygamma" | "quotient";
}

export interface GuidedInspectionDefinition {
  id: GuidedInspectionId;
  label: string;
  summary: string;
  steps: GuidedInspectionStep[];
  aliases?: GuidedInspectionId[];
}

export interface GuidedInspectionState {
  id: GuidedInspectionId;
  stepIndex: number;
}

const guideDefinitions: GuidedInspectionDefinition[] = [
  {
    id: "find-a-hexagon",
    label: "Find a hexagon",
    summary:
      "Find an m=3 rank-two Davis cell and read its alternating boundary.",
    aliases: ["one-relation"],
    steps: [
      {
        id: "choose-m3-pair",
        title: "Choose an m=3 pair",
        body: "A finite pair with m=3 contributes a six-sided Davis relation cell.",
        focus: "relation",
      },
      {
        id: "read-boundary",
        title: "Read the boundary word",
        body: "The boundary alternates the two generator labels for 2m directed edges; for m=3 this is a hexagon.",
        focus: "relation",
      },
      {
        id: "check-cell-status",
        title: "Check what is filled",
        body: "Filled polygons require the full boundary in the current radius ball; clipped cells should remain unfilled.",
        focus: "relation",
      },
    ],
  },
  {
    id: "understand-rank-three-cell",
    label: "Understand a rank-three cell",
    summary: "Open the fundamental-domain view around one spherical triple.",
    aliases: ["rank-three-cell"],
    steps: [
      {
        id: "open-ygamma",
        title: "Open Y_Gamma",
        body: "The guide switches to the one-vertex fundamental-domain complex.",
        focus: "ygamma",
      },
      {
        id: "rank-three-focus",
        title: "Focus a rank-three relation",
        body: "Square and hexagon faces are shown together when a spherical triple is available.",
        focus: "rank-three",
      },
      {
        id: "read-shared-incidence",
        title: "Read shared incidence",
        body: "The useful view is three-dimensional: faces should meet along visible shared edges, not as a flat diagram.",
        focus: "rank-three",
      },
    ],
  },
  {
    id: "local-link",
    label: "Local link at a chamber",
    summary: "Center the selected chamber and show its spherical subsets.",
    steps: [
      {
        id: "center-chamber",
        title: "Center the chamber",
        body: "The selected chamber is the local object; neighbors are generator directions.",
        focus: "local-link",
      },
      {
        id: "inspect-link",
        title: "Inspect the link",
        body: "Finite spherical subsets explain which local cells are present.",
        focus: "local-link",
      },
    ],
  },
  {
    id: "inspect-ygamma",
    label: "Inspect Y_Gamma",
    summary: "Show the cohesive one-vertex fundamental-domain 2-skeleton.",
    aliases: ["ygamma-2-skeleton"],
    steps: [
      {
        id: "base-vertex",
        title: "One base vertex",
        body: "Y_Gamma has one quotient vertex with oriented generator arrows.",
        focus: "ygamma",
      },
      {
        id: "relation-faces",
        title: "Relation faces",
        body: "Finite Coxeter pairs attach rank-two relation polytopes to that spine.",
        focus: "ygamma",
      },
      {
        id: "separate-drawing-from-quotient",
        title: "Separate drawing from quotient",
        body: "Y_Gamma records fundamental-domain incidence; the 3D placement is a readability layout.",
        focus: "ygamma",
      },
    ],
  },
  {
    id: "quotient-game-experiment",
    label: "Quotient/game experiment",
    summary: "Use quotient-style data to inspect cocycles and link directions.",
    aliases: ["quotient-game"],
    steps: [
      {
        id: "open-quotient",
        title: "Open quotient-style data",
        body: "Imported quotients and Y_Gamma share the quotient/game diagnostic surface.",
        focus: "quotient",
      },
      {
        id: "read-cocycle",
        title: "Read game diagnostics",
        body: "Boundary sums and ascending/descending links are shown at the selected vertex.",
        focus: "quotient",
      },
      {
        id: "record-certificates",
        title: "Record certificates",
        body: "Quotient and game conclusions should cite the imported artifact status instead of relying on the drawing.",
        focus: "quotient",
      },
    ],
  },
];

const guideById = new Map<GuidedInspectionId, GuidedInspectionDefinition>();
for (const guide of guideDefinitions) {
  guideById.set(guide.id, guide);
  for (const alias of guide.aliases ?? []) {
    guideById.set(alias, guide);
  }
}

/**
 * Static guide definitions. Guides change view state and text only; they never
 * mutate Coxeter data, quotient artifacts, or certificates.
 */
export function guidedInspectionDefinitions(): GuidedInspectionDefinition[] {
  return guideDefinitions;
}

export function guidedInspectionDefinition(
  id: GuidedInspectionId,
): GuidedInspectionDefinition {
  const guide = guideById.get(id);
  if (!guide) {
    throw new Error(`Unknown guided inspection "${id}".`);
  }
  return guide;
}

export function activeGuidedInspectionStep(
  state: GuidedInspectionState | undefined,
): GuidedInspectionStep | undefined {
  if (!state) {
    return undefined;
  }
  const guide = guidedInspectionDefinition(state.id);
  return guide.steps[clampStepIndex(state.stepIndex, guide.steps.length)];
}

export function moveGuidedInspectionStep(
  state: GuidedInspectionState,
  delta: number,
): GuidedInspectionState {
  const guide = guidedInspectionDefinition(state.id);
  return {
    ...state,
    stepIndex: clampStepIndex(state.stepIndex + delta, guide.steps.length),
  };
}

function clampStepIndex(index: number, count: number): number {
  return Math.max(0, Math.min(Math.max(0, count - 1), Math.trunc(index)));
}
