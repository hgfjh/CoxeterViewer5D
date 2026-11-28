import type { BarXRelationFamilyId } from "../barXRelationFamilies";
import type { TopLevelModelId } from "../orientation";
import type { TourStep } from "./GuidedTour";

/**
 * App state a tour step sets up when it is entered. Each field maps to an
 * existing App handler, so the tour drives the same code paths as the
 * controls it describes. Fields are applied in the order listed here.
 */
export interface TourAction {
  example?: string;
  relationFamily?: BarXRelationFamilyId;
  model?: TopLevelModelId;
  radius?: number;
  selectNode?: string;
  wallDisplayMode?: "all" | "selected";
  linkLens?: "none" | "ascending" | "descending";
  /** Selector of a closed <details> element to open after the step renders. */
  openDetails?: string;
}

export interface AppTourStep extends TourStep {
  action?: TourAction;
}

/**
 * The tour example. It is the only bundled system on which every panel,
 * including cover construction, wall search and the lawful-first certificate,
 * finishes in well under a second in a browser, so no step waits on a long
 * computation. Its noncompactness is stated in the tour text.
 */
export const TOUR_EXAMPLE_ID = "ideal_hyperbolic_3_cube_m3";

export const tourSteps: readonly AppTourStep[] = [
  {
    id: "purpose",
    title: "What CoxeterViewer5D is for",
    body: [
      "CoxeterViewer5D draws finite pieces of Coxeter groups: balls in the Davis complex, finite covers built from torsion-free subgroups, and the walls of those covers. It follows the route of Jankiewicz and Wise from a cover to walls, lawful cells and a map H → Z, which is used to study virtual algebraic fibering.",
      "It is an inspection tool, not a theorem prover. Throughout, incidence computed exactly from finite data is kept separate from the 3D placement, which is a drawing.",
      "This tour runs through every view on one example and takes a few minutes. It changes the current example. You can skip it at any point.",
    ],
  },
  {
    id: "example",
    title: "Choose a Coxeter system",
    target: "#example-select",
    action: { example: TOUR_EXAMPLE_ID },
    body: [
      "The tour uses the regular ideal hyperbolic 3-cube whose adjacent facets meet at angle π/3. Its reflection group W has six generators t12, …, t34, one per facet.",
      "Opposite facets are ultraparallel, so those three pairs have m = ∞. All eight vertices of the cube are ideal: the polyhedron has finite volume but is not compact.",
      "The list also holds finite groups and certified compact 5-dimensional examples.",
    ],
  },
  {
    id: "gamma",
    title: "The defining graph Γ",
    target: '[data-tour="model-gamma"]',
    action: { model: "gamma" },
    body: [
      "Γ has a vertex for each generator and an edge for each pair with finite m. Here every finite entry is m = 3 and Γ is the octahedron.",
      "Γ is read directly from the Coxeter matrix. Only where its vertices sit on screen is a drawing choice.",
    ],
  },
  {
    id: "davis",
    title: "The Davis complex near the identity",
    target: '[data-testid="scene-canvas"]',
    action: { model: "davis", radius: 3, selectNode: "e" },
    body: [
      "Vertices are the group elements of word length at most 3, joined by edges coloured by generator. Each pair with m = 3 contributes one hexagon (a 2m-gon) for every coset of the subgroup ⟨s, t⟩ that it generates.",
      "A hexagon is filled only when its whole boundary lies inside the ball. Each element w is placed at its reflection orbit point w·x₀ and drawn by a central projection that keeps every hexagon flat, so the cells sit inside their edges. Incidence is exact; the positions are a drawing.",
    ],
    hint: "Drag to orbit and scroll to zoom. W A S D Q E move the camera; hold Shift to move faster.",
  },
  {
    id: "radius",
    title: "Ball radius",
    target: "#radius-input",
    body: [
      "Balls grow exponentially: radius 3 has 175 vertices and radius 5 has several thousand. Generation runs in a background worker and stops at fixed caps.",
      "Group elements are identified by rounding their reflection matrices. That approximation is listed in the Caveats panel rather than hidden.",
    ],
  },
  {
    id: "inspector",
    title: "Inspector and caveats",
    target: '[data-tour="focus-inspector"]',
    body: [
      "The inspector answers three questions about the current selection: what it is, why it appears in this view, and whether the claim is exact or a drawing. Click a vertex, edge or cell in the viewer to change the selection; the identity e is selected now.",
      "The Caveats panel below collects every approximation and omission that applies to the current view.",
    ],
  },
  {
    id: "projection",
    title: "Projection drawing",
    target: '[data-tour="model-projection"]',
    action: { model: "projection" },
    body: [
      "Here each element w is placed at w·x₀, where x₀ is a basepoint in the hyperboloid model and the reflections come from the example's exact normal vectors. The points are then drawn in the Poincaré or Klein ball.",
      "This example lives in H³, so nothing is lost to a projection from higher dimension, but both ball models still distort lengths. Treat the picture as intuition, not measurement.",
    ],
  },
  {
    id: "hat-x",
    title: "A finite cover: hat X",
    target: '[data-tour="model-hat-x"]',
    action: { model: "hat-x" },
    body: [
      "Sending each generator tij to the transposition (ij) defines a surjection W → S4. Its kernel H has index 24 and is torsion-free; the bundled checker verifies this on every spherical subgroup of type A1 and A2.",
      "hat X is the corresponding 24-sheeted cover of the presentation 2-complex of W: lifted generator bigons and lifted relation cells. Its incidence is exact.",
    ],
  },
  {
    id: "bar-x",
    title: "Compress to bar X",
    target: '[aria-label="bar X relation reader"]',
    action: { relationFamily: "all" },
    body: [
      "bar X collapses each generator bigon of hat X to a single edge. Here that leaves 24 vertices, 72 edges and 48 hexagons.",
      "This control pulls the cells of one edge of Γ, or of all edges, apart so that each disk can be traced to its attaching cycle. Only the bending of cell interiors is a drawing choice; every cell stays attached to the same 1-skeleton.",
    ],
  },
  {
    id: "walls",
    title: "Walls",
    target: '[aria-label="Wall reader"]',
    action: { relationFamily: "shared-complex", wallDisplayMode: "selected" },
    body: [
      "A wall of bar X is an equivalence class of edges, generated by declaring two edges equivalent when they are opposite sides of a relation hexagon. This cover has 6 walls, all embedded and two-sided.",
      "Choosing a side of each wall (a coorientation) directs every edge that crosses it. The arrowheads show those directions; the wall arcs themselves carry no direction.",
    ],
  },
  {
    id: "lawful",
    title: "Lawful cells",
    target: '[data-tour="find-lawful"]',
    body: [
      "A relation cell is lawful when the induced directions on its boundary have exactly one source and one sink. With the current coorientation all 48 hexagons are lawful.",
      "Flip the selected wall to see which cells stop being lawful, then press Find largest lawful subcomplex. On this cover the search finishes in milliseconds and proves its answer optimal.",
    ],
  },
  {
    id: "links",
    title: "Links and the fibering certificate",
    target: '[aria-label="Virtual algebraic fibering certificate"]',
    action: {
      linkLens: "ascending",
      openDetails: '[data-tour="induced-orientation"]',
    },
    body: [
      "At each vertex the ascending and descending links record which incident edges point up and which point down. The Morse-theoretic argument needs these links to be connected, and the viewer now highlights the ascending link at the chosen vertex.",
      "Run lawful-first certification checks the lawful complex first and falls back to the full Davis quotient. On this example the first check passes in under a second, and the certificate can be exported as JSON.",
    ],
  },
  {
    id: "next",
    title: "Research mode and further reading",
    target: '[role="group"][aria-label="Interface mode"]',
    body: [
      "Research mode adds a data and status summary (source, cover evidence, compression and wall diagnostics) and experiment export. Try the same steps on the compact tetrahedron C(4,4;2,2;3,3), whose cover is a closed hyperbolic 3-manifold; its searches take longer.",
      "The README and docs/walkthroughs.md explain the mathematics and the exact-versus-drawing conventions. Restart this tour with the question-mark button at the top of the viewer.",
    ],
  },
];
