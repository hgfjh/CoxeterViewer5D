import { describe, expect, it } from "vitest";

import I2_5 from "../public/examples/I2_5.json";
import compact5Cube from "../public/examples/compact_5_cube_gamma1.json";
import jnwCubeGraph from "../public/examples/jnw_cube_graph.json";
import {
  activeGuidedInspectionStep,
  guidedInspectionDefinition,
  moveGuidedInspectionStep,
} from "../src/app/guidedInspection";
import {
  activeResearchWorkflowStep,
  defaultResearchWorkflowState,
  moveResearchWorkflowStep,
  topologyLensDefinition,
} from "../src/app/researchWorkflow";
import {
  createAnnotation,
  createCameraBookmark,
  defaultGalleryEntries,
  viewComparisonOptions,
} from "../src/app/researchUi";
import { importRepairSuggestions } from "../src/app/importRepair";
import {
  compareLatestNotebookRuns,
  duplicateNotebookBundle,
  parseNotebookBundles,
} from "../src/app/notebookStorage";
import {
  inspectorAnswers,
  modelExplanationForLabel,
  modelExplanations,
  startHereActions,
} from "../src/app/orientation";
import {
  buildJnwStateLinkSubject,
  buildTopologyExplanation,
} from "../src/app/topologyInspector";
import { buildDefiningGraphScene } from "../src/app/definingGraphScene";
import {
  buildJnwGammaStateDiagram,
  buildJnwStateQuotientYGammaScene,
  decorateJnwStateQuotientScene,
  jnwStateChartColor,
} from "../src/app/jnwStateVisual";
import { quotientToGeneratedBall } from "../src/app/viewerDataset";
import { buildYGammaCellAtlas } from "../src/app/yGammaAtlas";
import { createExperimentBundle } from "../src/app/experiments";
import {
  createQuotientBuildInput,
  parseSubgroupGeneratorWords,
  parseQuotientComplex,
} from "../src/quotient";
import {
  classifyIncidentEdges,
  createBipartiteJnwMoveSystem,
  createJnwState,
  jnwOrbitToQuotientComplex,
  resolveIntegerEdgeAssignment,
  summarizeJnwLegalSystem,
  validateRankTwoCocycle,
} from "../src/game";
import type { CoxeterSystemInput } from "../src/types";
import I2_5_IDENTITY_QUOTIENT from "../src/examples/I2_5_identity_quotient.json";

const system = I2_5 as CoxeterSystemInput;

describe("guided inspection definitions", () => {
  it("steps through a guide without leaving its bounds", () => {
    const guide = guidedInspectionDefinition("one-relation");
    const first = activeGuidedInspectionStep({
      id: "one-relation",
      stepIndex: 0,
    });
    const moved = moveGuidedInspectionStep(
      { id: "one-relation", stepIndex: 99 },
      1,
    );

    expect(guide.steps.length).toBeGreaterThan(1);
    expect(first?.focus).toBe("relation");
    expect(moved.stepIndex).toBe(guide.steps.length - 1);
  });
});

describe("research workflow helpers", () => {
  it("moves through the locked quotient/game workflow", () => {
    const initial = defaultResearchWorkflowState();
    const next = moveResearchWorkflowStep(initial, 1);
    const final = moveResearchWorkflowStep(
      { ...initial, stepId: "local-topology-export" },
      1,
    );

    expect(activeResearchWorkflowStep(initial).id).toBe("source-system");
    expect(next.stepId).toBe("subgroup-cosets");
    expect(final.stepId).toBe("local-topology-export");
    expect(topologyLensDefinition("ascending-link").label).toBe(
      "Ascending link at selected state",
    );
    expect(topologyLensDefinition("ascending-link").statusText).toContain(
      "state-quotient link",
    );
    expect(topologyLensDefinition("edge-star").scope).toBe("star");
    expect(topologyLensDefinition("cell-star").summary).toContain(
      "selected cell",
    );
    expect(topologyLensDefinition("generator-family").scope).toBe("family");
    expect(topologyLensDefinition("rank-k-family").targetRank).toBe("k");
  });
});

describe("research UI helper data", () => {
  it("defines the release-orientation model labels and Start Here actions", () => {
    expect(
      Object.values(modelExplanations).map((entry) => entry.label),
    ).toEqual(["Davis", "hat X", "bar X", "Gamma", "Projection"]);
    expect(
      Object.values(modelExplanations).map((entry) => entry.teachingLabel),
    ).toEqual([
      "Davis complex",
      "hat X cover",
      "bar X compression",
      "Defining graph Gamma",
      "Projection drawing",
    ]);
    expect(modelExplanations.davis.shortDescription).toBe(
      "A finite Cayley ball with visible Davis cells.",
    );
    expect(modelExplanations["hat-x"].shortDescription).toBe(
      "The finite cover of the Coxeter presentation complex.",
    );
    expect(modelExplanations["bar-x"].shortDescription).toBe(
      "The compressed even-sided complex where walls live.",
    );
    expect(modelExplanations.gamma.shortDescription).toBe(
      "Generators joined by their finite Coxeter relations.",
    );
    expect(modelExplanations.projection.shortDescription).toBe(
      "Chamber barycenters projected into a 3D drawing.",
    );
    expect(modelExplanationForLabel("hat X cover").id).toBe("hat-x");
    expect(modelExplanationForLabel("bar X walls").id).toBe("bar-x");

    expect(startHereActions.map((action) => action.label)).toEqual([
      "Explore a Coxeter example",
      "Find a torsion-free cover",
      "Find walls in bar X",
      "Coorient walls",
      "Inspect exactness and data status",
    ]);
    expect(
      startHereActions.find((action) => action.id === "find-walls")?.model,
    ).toBe("bar-x");
    expect(
      startHereActions.find((action) => action.id === "inspect-finite-cover")
        ?.model,
    ).toBe("hat-x");
  });

  it("keeps the topology inspector organized around three answers", () => {
    expect(inspectorAnswers.map((answer) => answer.heading)).toEqual([
      "What is selected?",
      "Why is it here?",
      "Exact or drawing?",
    ]);
    expect(inspectorAnswers[2].purpose).toContain("exact incidence");
  });

  it("creates deterministic annotations, bookmarks, and gallery entries", () => {
    const annotation = createAnnotation({
      label: "Hexagon",
      body: "Boundary alternates s0 and s1.",
      targetKind: "cell",
      targetId: "cell:0-1:e",
    });
    const bookmark = createCameraBookmark({
      label: "Hexagon view",
      preset: "rank-two-cells",
      topologyLensId: "cell-star",
      selectedCellId: "cell:0-1:e",
    });

    expect(annotation.id).toMatch(/^annotation:/);
    expect(bookmark.id).toMatch(/^bookmark:/);
    expect(defaultGalleryEntries().map((entry) => entry.id)).toContain(
      "walkthrough:hexagon",
    );
    expect(defaultGalleryEntries().map((entry) => entry.id)).toContain(
      "catalogue:8facet:all",
    );
    expect(defaultGalleryEntries().map((entry) => entry.id)).toContain(
      "catalogue:8facet:08",
    );
    const jnwCubeEntry = defaultGalleryEntries().find(
      (entry) => entry.id === "jnw:cube-graph",
    );
    expect(jnwCubeEntry?.actionLabel).toBe("Open JNW game");
    expect(
      viewComparisonOptions.some((option) => option.id === "davis-vs-ygamma"),
    ).toBe(true);
  });

  it("suggests repairs for common import validation errors", () => {
    const suggestions = importRepairSuggestions(
      "stale hash for quotient certificate and unknown generator id",
    );

    expect(suggestions.map((suggestion) => suggestion.id)).toContain(
      "generator-ids",
    );
    expect(suggestions.map((suggestion) => suggestion.id)).toContain(
      "certificate-claims",
    );
  });
});

describe("topology-first explanations", () => {
  it("uses the three-answer inspector data for ordinary chambers", () => {
    const explanation = buildTopologyExplanation({
      system,
      subject: { kind: "node", id: "e", word: [], length: 0 },
    });

    expect(explanation.title).toBe("e");
    expect(explanation.summary).toContain("word length 0");
    expect(explanation.rows.map((row) => row.label)).toEqual([
      "Node id",
      "Word",
      "Length",
    ]);
  });

  it("explains a rank-two Davis cell by relation word and status", () => {
    const cell = {
      id: "cell:0-1:e",
      generatorPair: [0, 1] as [number, number],
      m: 5,
      boundaryNodeIds: Array.from({ length: 10 }, (_, index) => `v${index}`),
    };
    const explanation = buildTopologyExplanation({
      system,
      subject: { kind: "rank-two-cell", cell },
    });

    expect(explanation.layer).toBe("Davis");
    expect(explanation.status).toBe("exact incidence");
    expect(explanation.boundaryWord).toHaveLength(10);
    expect(explanation.summary).toContain("m=5");
  });

  it("explains the relation-order partition at a selected Gamma vertex", () => {
    const gammaScene = buildDefiningGraphScene(system);
    const explanation = buildTopologyExplanation({
      system,
      subject: {
        kind: "gamma-vertex",
        incidence: gammaScene.incidencePartitions[0],
      },
    });

    expect(explanation.layer).toBe("Gamma");
    expect(explanation.title).toBe("Generator s0");
    expect(explanation.summary).toContain("split into disjoint classes");
    expect(explanation.rows).toContainEqual({
      label: "m=5 neighbors",
      value: "s1",
    });
    expect(explanation.rows.at(-1)?.value).toContain(
      "all 1 other generators accounted for once",
    );
  });

  it("labels compact-cube Gamma edges by Coxeter order, never generator", () => {
    const compactSystem = compact5Cube as CoxeterSystemInput;
    const gammaScene = buildDefiningGraphScene(compactSystem);

    expect(gammaScene.edges).toHaveLength(gammaScene.records.length);
    for (const edge of gammaScene.edges) {
      const record = gammaScene.records.find((entry) => entry.id === edge.id)!;
      expect(edge.compactLabel).toBe(String(record.entry));
      expect(
        compactSystem.generators.some(
          (generator) => generator.label === edge.compactLabel,
        ),
      ).toBe(false);
    }
  });

  it("explains Y_Gamma, quotient, and game subjects without changing claims", () => {
    const yGammaExplanation = buildTopologyExplanation({
      system,
      subject: {
        kind: "ygamma-cell",
        cell: {
          id: "ygamma:face:0-1",
          kind: "rank-two-relation",
          label: "s0-s1 relation",
          description: "A one-vertex relation face.",
          rank: 2,
          dimension: 2,
          generators: [0, 1],
          generatorLabels: ["s0", "s1"],
          attachingWord: ["s0", "s1", "s0", "s1"],
          rankTwoFaceIds: [],
          boundaryLength: 4,
        },
      },
    });
    const quotient = parseQuotientComplex(I2_5_IDENTITY_QUOTIENT);
    const quotientExplanation = buildTopologyExplanation({
      system,
      subject: {
        kind: "quotient-cell",
        quotient,
        cell: quotient.twoCells[0],
      },
    });
    const gameExplanation = buildTopologyExplanation({
      system,
      subject: {
        kind: "game-assignment",
        quotient,
        selectedVertexId: quotient.vertices[0]?.id,
      },
    });
    const jnwSystem = jnwCubeGraph as CoxeterSystemInput;
    const jnwMoveSystem = createBipartiteJnwMoveSystem(jnwSystem);
    expect(jnwMoveSystem).toBeDefined();
    const jnwSummary = summarizeJnwLegalSystem(
      jnwSystem,
      jnwMoveSystem!,
      createJnwState([0, 1, 2, 5]),
    );
    const jnwQuotient = jnwOrbitToQuotientComplex(jnwSystem, jnwSummary);
    const jnwExplanation = buildTopologyExplanation({
      system: jnwSystem,
      subject: buildJnwStateLinkSubject(
        jnwQuotient,
        jnwSummary,
        jnwSummary.states[0].id,
        "ascending-link",
      ),
    });

    expect(yGammaExplanation.layer).toBe("Y_Gamma");
    expect(yGammaExplanation.status).toBe("exact incidence");
    expect(yGammaExplanation.boundaryWord).toEqual(["s0", "s1", "s0", "s1"]);
    expect(quotientExplanation.layer).toBe("quotient");
    expect(quotientExplanation.summary).toContain("rank-two cell");
    expect(gameExplanation.summary).toContain("browser diagnostics");
    expect(jnwExplanation.layer).toBe("JNW move-kernel cover");
    expect(jnwExplanation.status).toBe("exact incidence");
    expect(jnwExplanation.title).toContain("Ascending link at selected state");
    expect(jnwExplanation.summary).toContain("move-kernel cover");
    expect(jnwExplanation.rows.map((row) => row.label)).toEqual([
      "Selected state",
      "Active link",
      "Claim status",
    ]);
  });

  it("draws JNW state vertices as highlighted Gamma subsets", () => {
    const jnwSystem = jnwCubeGraph as CoxeterSystemInput;
    const jnwMoveSystem = createBipartiteJnwMoveSystem(jnwSystem);
    expect(jnwMoveSystem).toBeDefined();
    const jnwSummary = summarizeJnwLegalSystem(
      jnwSystem,
      jnwMoveSystem!,
      createJnwState([0, 1, 2, 5]),
    );
    const jnwQuotient = jnwOrbitToQuotientComplex(jnwSystem, jnwSummary);
    const scene = decorateJnwStateQuotientScene({
      system: jnwSystem,
      summary: jnwSummary,
      selectedStateId: jnwSummary.states[0].id,
      nodes: jnwQuotient.vertices.map((vertex, index) => ({
        id: vertex.id,
        label: vertex.label,
        compactLabel: vertex.label,
        length: 0,
        position: [index * 2, 0, 0],
      })),
      edges: jnwQuotient.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        generator: edge.generator,
      })),
    });
    const diagram = buildJnwGammaStateDiagram(jnwSystem, jnwSummary.states[0]);

    expect(
      scene.nodes.some((node) => node.id === jnwSummary.states[0].id),
    ).toBe(true);
    expect(
      scene.nodes.filter((node) => node.id.startsWith("jnw:gamma-glyph:")),
    ).toHaveLength(jnwSummary.states.length * jnwSystem.rank);
    expect(
      scene.edges.some((edge) => edge.id.startsWith("jnw:state-membership:")),
    ).toBe(true);
    const selectedGlyphLabels = scene.nodes
      .filter(
        (node) =>
          node.id.startsWith(`jnw:gamma-glyph:${jnwSummary.states[0].id}:`) &&
          node.alwaysLabel,
      )
      .map((node) => node.compactLabel)
      .sort();
    expect(selectedGlyphLabels).toEqual(["v000", "v001", "v010", "v101"]);
    expect(diagram.activeLabels).toEqual(["v000", "v001", "v010", "v101"]);

    const ball = quotientToGeneratedBall(jnwQuotient);
    expect(ball.nodes.map((node) => node.compactLabel)).toEqual([
      "S_1",
      "S_2",
      "S_3",
      "S_4",
    ]);
    const zCoordinates = new Set(
      ball.nodes.map((node) => node.position?.[2]?.toFixed(3)),
    );
    expect(zCoordinates.size).toBeGreaterThan(2);

    const orbitScene = buildJnwStateQuotientYGammaScene({
      system: jnwSystem,
      atlas: buildYGammaCellAtlas(jnwSystem),
      summary: jnwSummary,
      selectedStateId: jnwSummary.states[0].id,
    });
    const stateBaseNodes = orbitScene.nodes.filter((node) =>
      jnwSummary.states.some((state) => state.id === node.id),
    );
    expect(orbitScene.stateCopyCount).toBe(4);
    expect(orbitScene.stateVertexCount).toBe(4);
    expect(jnwSummary.states).toHaveLength(4);
    expect(jnwSummary.edges).toHaveLength(16);
    expect(
      jnwSummary.rankTwoDiagnostics.filter((diagnostic) => diagnostic.ok),
    ).toHaveLength(12);
    expect(stateBaseNodes.map((node) => node.compactLabel)).toEqual([
      "S_1",
      "S_2",
      "S_3",
      "S_4",
    ]);
    const midpointNodes = orbitScene.nodes.filter((node) =>
      node.id.startsWith("jnw:cover:midpoint:"),
    );
    const centerNodes = orbitScene.nodes.filter((node) =>
      node.id.startsWith("jnw:cover:center:"),
    );
    expect(midpointNodes).toHaveLength(jnwSummary.edges.length);
    expect(centerNodes).toHaveLength(12);
    expect(orbitScene.coverModel?.invariants.ok).toBe(true);
    expect(orbitScene.coverModel?.invariants.counts).toEqual({
      states: 4,
      rails: 16,
      relationCells: 12,
      railMidpoints: 16,
      relationCenters: 12,
      sectors: 48,
    });
    const stateDepths = stateBaseNodes.map((node) => node.position?.[2] ?? 0);
    expect(Math.max(...stateDepths) - Math.min(...stateDepths)).toBeGreaterThan(
      10,
    );
    const subdivisionDepths = orbitScene.nodes
      .filter(
        (node) =>
          node.id.startsWith("jnw:cover:midpoint:") ||
          node.id.startsWith("jnw:cover:center:"),
      )
      .map((node) => node.position?.[2] ?? 0);
    expect(
      Math.max(...subdivisionDepths) - Math.min(...subdivisionDepths),
    ).toBeGreaterThan(10);
    expect(
      orbitScene.nodes.some((node) => node.id.startsWith("jnw:endpoint:")),
    ).toBe(false);
    expect(
      orbitScene.nodes.some((node) => node.id.startsWith("jnw:chart-corner:")),
    ).toBe(false);
    const semanticRailId = (renderedId: string) => {
      const fromIndex = renderedId.indexOf(":from:");
      return fromIndex >= 0
        ? renderedId.slice(0, fromIndex)
        : renderedId.endsWith(":continuation")
          ? renderedId.slice(0, -":continuation".length)
          : renderedId;
    };
    const orbitEdgeIds = new Set(jnwSummary.edges.map((edge) => edge.id));
    const railSegments = orbitScene.edges.filter((edge) =>
      orbitEdgeIds.has(semanticRailId(edge.id)),
    );
    expect(railSegments).toHaveLength(jnwSummary.edges.length * 2);
    for (const railId of orbitEdgeIds) {
      expect(
        railSegments.filter((edge) => semanticRailId(edge.id) === railId),
      ).toHaveLength(2);
    }
    expect(
      railSegments.filter(
        (edge) => edge.compactLabel && !edge.suppressSemanticLabel,
      ),
    ).toHaveLength(jnwSummary.edges.length);
    expect(
      railSegments.filter((edge) => edge.suppressSemanticLabel),
    ).toHaveLength(jnwSummary.edges.length);
    expect(orbitScene.cells).toHaveLength(48);
    expect(
      orbitScene.edges.some((edge) =>
        edge.id.startsWith("jnw:state-transition-bundle:"),
      ),
    ).toBe(false);
    expect(
      orbitScene.nodes.some((node) => node.id.startsWith("jnw:copy-arrow:")),
    ).toBe(false);
    expect(
      orbitScene.edges.some(
        (edge) =>
          edge.id.startsWith("jnw:copy-local-edge:") ||
          edge.id.startsWith("jnw:copy-glue:"),
      ),
    ).toBe(false);
    const sceneNodeIds = new Set(orbitScene.nodes.map((node) => node.id));
    expect(
      orbitScene.cells.every(
        (cell) =>
          cell.boundaryNodeIds.length === 4 &&
          cell.boundaryNodeIds.every((nodeId) => sceneNodeIds.has(nodeId)),
      ),
    ).toBe(true);
    const relationDiagnosticIds = new Set(
      jnwSummary.rankTwoDiagnostics
        .filter((diagnostic) => diagnostic.ok)
        .map((diagnostic) => diagnostic.id),
    );
    const relationDiagnosticById = new Map(
      jnwSummary.rankTwoDiagnostics
        .filter((diagnostic) => diagnostic.ok)
        .map((diagnostic) => [diagnostic.id, diagnostic]),
    );
    expect(
      orbitScene.cells.every(
        (cell) =>
          cell.sourceCellId !== undefined &&
          relationDiagnosticIds.has(cell.sourceCellId),
      ),
    ).toBe(true);
    for (const diagnostic of relationDiagnosticById.values()) {
      const sectors = orbitScene.cells.filter(
        (cell) => cell.sourceCellId === diagnostic.id,
      );
      expect(sectors).toHaveLength(4);
      expect(sectors.map((cell) => cell.boundaryNodeIds[0]).sort()).toEqual(
        [...diagnostic.boundaryStateIds].sort(),
      );
    }
    expect(
      orbitScene.cells.some((cell) => cell.id.startsWith("jnw:chart-shell:")),
    ).toBe(false);
    expect(stateBaseNodes[0]?.colorHint).toBe(
      jnwStateChartColor(jnwSummary, jnwSummary.states[0].id),
    );
    expect(orbitScene.selectedNodeId).toBe(jnwSummary.states[0].id);

    const exactSkeleton = buildJnwStateQuotientYGammaScene({
      system: jnwSystem,
      atlas: buildYGammaCellAtlas(jnwSystem),
      summary: jnwSummary,
      readerMode: "exact-skeleton",
      readerLens: "none",
      constructionStage: 4,
    });
    expect(exactSkeleton.readerMode).toBe("exact-skeleton");
    expect(exactSkeleton.nodes).toHaveLength(jnwSummary.states.length);
    expect(exactSkeleton.edges).toHaveLength(jnwSummary.edges.length);
    expect(exactSkeleton.cells).toHaveLength(0);
    expect(
      exactSkeleton.nodes.some((node) => node.id.startsWith("jnw:chart-port:")),
    ).toBe(false);
    expect(
      exactSkeleton.edges.every(
        (edge) =>
          orbitEdgeIds.has(edge.id) &&
          jnwSummary.states.some((state) => state.id === edge.source) &&
          jnwSummary.states.some((state) => state.id === edge.target) &&
          edge.compactLabel !== "" &&
          edge.alwaysLabel === true,
      ),
    ).toBe(true);
    expect(midpointNodes.every((node) => node.drawingOnly === true)).toBe(true);
    expect(centerNodes.every((node) => node.drawingOnly === true)).toBe(true);
    expect(railSegments.every((edge) => edge.drawingOnly === true)).toBe(true);
    expect(orbitScene.cells.every((cell) => cell.drawingOnly !== true)).toBe(
      true,
    );

    const bundledOverview = buildJnwStateQuotientYGammaScene({
      system: jnwSystem,
      atlas: buildYGammaCellAtlas(jnwSystem),
      summary: jnwSummary,
      moveSystem: jnwMoveSystem!,
      railGrouping: "move-class-overview",
      constructionStage: 3,
    });
    const bundledEdges = bundledOverview.edges.filter((edge) =>
      edge.id.startsWith("jnw:move-class-bundle:"),
    );
    expect(bundledOverview.railGrouping).toBe("move-class-overview");
    expect(bundledOverview.bundledRailCount).toBeGreaterThan(0);
    expect(bundledEdges.length).toBeLessThan(jnwSummary.edges.length);
    expect(
      bundledOverview.edges.some((edge) => orbitEdgeIds.has(edge.id)),
    ).toBe(false);
    expect(bundledOverview.cells).toHaveLength(0);
    expect(bundledOverview.warnings.join(" ")).toContain("Bundled drawing");

    const statesOnly = buildJnwStateQuotientYGammaScene({
      system: jnwSystem,
      atlas: buildYGammaCellAtlas(jnwSystem),
      summary: jnwSummary,
      constructionStage: 1,
    });
    expect(statesOnly.nodes).toHaveLength(jnwSummary.states.length);
    expect(statesOnly.edges).toHaveLength(0);
    expect(statesOnly.cells).toHaveLength(0);

    const oneSkeleton = buildJnwStateQuotientYGammaScene({
      system: jnwSystem,
      atlas: buildYGammaCellAtlas(jnwSystem),
      summary: jnwSummary,
      constructionStage: 2,
    });
    expect(oneSkeleton.nodes).toHaveLength(
      jnwSummary.states.length + jnwSummary.edges.length,
    );
    expect(oneSkeleton.edges).toHaveLength(jnwSummary.edges.length * 2);
    expect(oneSkeleton.cells).toHaveLength(0);

    const selectedDiagnostic = jnwSummary.rankTwoDiagnostics.find(
      (diagnostic) => diagnostic.ok,
    );
    expect(selectedDiagnostic).toBeDefined();
    const relationFocus = buildJnwStateQuotientYGammaScene({
      system: jnwSystem,
      atlas: buildYGammaCellAtlas(jnwSystem),
      summary: jnwSummary,
      selectedRelationId: selectedDiagnostic?.id,
      constructionStage: 4,
    });
    expect(
      relationFocus.cells.some(
        (cell) => cell.sourceCellId === selectedDiagnostic?.id,
      ),
    ).toBe(true);
    expect(
      relationFocus.cells.every(
        (cell) => !cell.id.startsWith("jnw:chart-shell:"),
      ),
    ).toBe(true);
    const ghostedSemanticEdges = relationFocus.edges.filter(
      (edge) => orbitEdgeIds.has(semanticRailId(edge.id)) && edge.ghost,
    );
    expect(ghostedSemanticEdges.length).toBeGreaterThan(0);
    const focusedBoundaryEdges = relationFocus.edges.filter(
      (edge) =>
        orbitEdgeIds.has(semanticRailId(edge.id)) &&
        edge.selectedHighlight === "outline",
    );
    expect(focusedBoundaryEdges.length).toBeGreaterThan(0);
  });
});

describe("experiment notebook helpers", () => {
  it("imports, duplicates, and compares deterministic notebook bundles", () => {
    const first = createExperimentBundle({
      createdAt: "2026-01-01T00:00:00.000Z",
      runs: [
        {
          dataset: { id: "I2" },
          view: { radius: 2 },
          render: { labels: true },
          counts: { nodes: 4 },
        },
      ],
    });
    const second = duplicateNotebookBundle(first);
    const parsed = parseNotebookBundles([first, second]);
    const comparison = compareLatestNotebookRuns(parsed);

    expect(parsed).toHaveLength(2);
    expect(second.label).toContain("copy");
    expect(comparison).toBeDefined();
  });
});

describe("quotient builder requests", () => {
  it("parses subgroup words and exports request JSON", () => {
    const parsed = parseSubgroupGeneratorWords("s0 s1\n1 0", system);
    const request = createQuotientBuildInput({
      sourceSystem: system,
      subgroupText: "s0 s1\n1 0",
      maxCosets: 16,
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.words).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(request.errors).toEqual([]);
    expect(request.request?.subgroupGeneratorRecords?.[0].label).toBe("s0 s1");
  });

  it("exports identity-subgroup workflow requests with backend metadata", () => {
    const request = createQuotientBuildInput({
      sourceSystem: system,
      subgroupText: "",
      subgroupName: "identity subgroup",
      requestedBackend: "sage",
      includeGamePreset: "i2-5-height",
      maxCosets: 16,
    });

    expect(request.errors).toEqual([]);
    expect(request.request?.subgroupGenerators).toEqual([]);
    expect(request.request?.subgroupName).toBe("identity subgroup");
    expect(request.request?.includeGamePreset).toBe("i2-5-height");
  });

  it("rejects unknown subgroup word tokens", () => {
    const request = createQuotientBuildInput({
      sourceSystem: system,
      subgroupText: "s0 nope",
    });

    expect(request.request).toBeUndefined();
    expect(request.errors.join(" ")).toContain("unknown generator");
  });
});

describe("I2(5) quotient/game workflow demo", () => {
  it("has a nonzero cocycle with ascending and descending local links", () => {
    const quotient = parseQuotientComplex(I2_5_IDENTITY_QUOTIENT);
    const assignment = resolveIntegerEdgeAssignment(
      quotient.game,
      quotient.edges,
      quotient.sourceSystem?.rank,
    );
    const checks = validateRankTwoCocycle(
      quotient.twoCells,
      quotient.edges,
      assignment.edgeStates,
    );
    const flows = classifyIncidentEdges(
      "q0",
      quotient.edges,
      assignment.edgeStates,
    );

    expect(quotient.vertices).toHaveLength(10);
    expect(quotient.twoCells[0].boundaryVertexIds).toHaveLength(10);
    expect(assignment.source).toBe("imported");
    expect(checks.ok).toBe(true);
    expect(flows.some((flow) => flow.classification === "ascending")).toBe(
      true,
    );
    expect(flows.some((flow) => flow.classification === "descending")).toBe(
      true,
    );
  });
});
