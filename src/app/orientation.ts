export type TopLevelModelId =
  | "davis"
  | "hat-x"
  | "bar-x"
  | "gamma"
  | "projection";

export interface ModelExplanation {
  id: TopLevelModelId;
  label: string;
  teachingLabel: string;
  shortDescription: string;
  whyUseIt: string;
  mathematicalStatus: "source" | "derived-exact" | "drawing";
}

export type StartHereActionId =
  | "explore-coxeter-example"
  | "inspect-finite-cover"
  | "find-walls"
  | "coorient-walls"
  | "check-certificates-data";

export interface StartHereAction {
  id: StartHereActionId;
  label: string;
  summary: string;
  model: TopLevelModelId;
}

export interface InspectorAnswer {
  heading: "What is selected?" | "Why is it here?" | "Exact or drawing?";
  purpose: string;
}

export const modelExplanations: Record<TopLevelModelId, ModelExplanation> = {
  davis: {
    id: "davis",
    label: "Davis",
    teachingLabel: "Davis complex",
    shortDescription: "A finite Cayley ball with visible Davis cells.",
    whyUseIt:
      "Use this source view to inspect chamber adjacency and spherical-subgroup cells.",
    mathematicalStatus: "source",
  },
  "hat-x": {
    id: "hat-x",
    label: "hat X",
    teachingLabel: "hat X cover",
    shortDescription: "The finite cover of the Coxeter presentation complex.",
    whyUseIt:
      "Use this to inspect lifted generator bigons and lifted relation cells before compression.",
    mathematicalStatus: "derived-exact",
  },
  "bar-x": {
    id: "bar-x",
    label: "bar X",
    teachingLabel: "bar X compression",
    shortDescription: "The compressed even-sided complex where walls live.",
    whyUseIt:
      "Use this to find walls, choose coorientations, and retain the largest lawful subcomplex found.",
    mathematicalStatus: "derived-exact",
  },
  gamma: {
    id: "gamma",
    label: "Gamma",
    teachingLabel: "Defining graph Gamma",
    shortDescription: "Generators joined by their finite Coxeter relations.",
    whyUseIt:
      "Use this to read relation orders and generator neighborhoods in the source system.",
    mathematicalStatus: "source",
  },
  projection: {
    id: "projection",
    label: "Projection",
    teachingLabel: "Projection drawing",
    shortDescription: "Chamber barycenters projected into a 3D drawing.",
    whyUseIt:
      "Use this for geometric intuition when reflection data is available; it is not the cover or compression.",
    mathematicalStatus: "drawing",
  },
};

export const startHereActions: StartHereAction[] = [
  {
    id: "explore-coxeter-example",
    label: "Explore a Coxeter example",
    summary: "Open a local Davis ball and read one relation polygon.",
    model: "davis",
  },
  {
    id: "inspect-finite-cover",
    label: "Find a torsion-free cover",
    summary:
      "Search for a certified finite action, then inspect hat X before compression.",
    model: "hat-x",
  },
  {
    id: "find-walls",
    label: "Find walls in bar X",
    summary:
      "Compress the cover and follow opposite edges through relation cells.",
    model: "bar-x",
  },
  {
    id: "coorient-walls",
    label: "Coorient walls",
    summary: "Flip wall directions and compare the induced lawful subcomplex.",
    model: "bar-x",
  },
  {
    id: "check-certificates-data",
    label: "Inspect exactness and data status",
    summary:
      "Review cover evidence, compression checks, wall diagnostics, and caveats.",
    model: "bar-x",
  },
];

export const inspectorAnswers: InspectorAnswer[] = [
  {
    heading: "What is selected?",
    purpose:
      "Names the chamber, cover cell, compressed cell, edge, or wall under inspection.",
  },
  {
    heading: "Why is it here?",
    purpose:
      "Explains the presentation lift, compression fiber, or opposite-edge wall relation.",
  },
  {
    heading: "Exact or drawing?",
    purpose:
      "Separates exact incidence and browser checks from 3D placement conventions.",
  },
];

export function modelExplanationForLabel(label: string): ModelExplanation {
  const normalized = label.toLowerCase();
  if (normalized.includes("hat") || normalized.includes("cover")) {
    return modelExplanations["hat-x"];
  }
  if (
    normalized.includes("bar") ||
    normalized.includes("compress") ||
    normalized.includes("wall")
  ) {
    return modelExplanations["bar-x"];
  }
  if (normalized.includes("gamma")) {
    return modelExplanations.gamma;
  }
  if (normalized.includes("projection")) {
    return modelExplanations.projection;
  }
  return modelExplanations.davis;
}
