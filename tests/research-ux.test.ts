import { describe, expect, it } from "vitest";

import I2_5 from "../public/examples/I2_5.json";
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
import { buildTopologyExplanation } from "../src/app/topologyInspector";
import { createExperimentBundle } from "../src/app/experiments";
import {
  createQuotientBuildInput,
  parseSubgroupGeneratorWords,
  parseQuotientComplex,
} from "../src/quotient";
import {
  classifyIncidentEdges,
  resolveIntegerEdgeAssignment,
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
    expect(topologyLensDefinition("ascending-link").summary).toContain(
      "positive",
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
