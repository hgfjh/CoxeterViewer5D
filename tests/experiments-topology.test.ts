import { describe, expect, it } from "vitest";

import I2_5 from "../public/examples/I2_5.json";
import {
  createExperimentBundle,
  compareExperimentRuns,
} from "../src/app/experiments";
import { generateViewerBall } from "../src/app/generationPipeline";
import {
  createFiniteSimplicialComplex,
  diagnoseFlagLinkCondition,
  summarizeTopologyDiagnostics,
} from "../src/topology";
import type { CoxeterSystemInput } from "../src/types";

const createdAt = "2026-01-01T00:00:00.000Z";

describe("experiment bundles", () => {
  it("creates deterministic bundles from dataset, view, render, and topology inputs", () => {
    const { ball } = generateViewerBall(I2_5 as CoxeterSystemInput, {
      radius: 2,
      createdAt,
    });
    const topology = summarizeTopologyDiagnostics(
      createFiniteSimplicialComplex({
        vertices: ["s0", "s1"],
        simplices: [["s0", "s1"]],
      }),
    );
    const input = {
      label: "I2 local chamber sweep",
      createdAt,
      runs: [
        {
          label: "radius 2 shell",
          dataset: { id: "I2_5", radius: 2 },
          view: { mode: "shell", localDepth: 1 },
          render: { labels: "selected", cells: true },
          topology,
          ball,
        },
      ],
    };

    const first = createExperimentBundle(input);
    const second = createExperimentBundle(input);

    expect(second).toEqual(first);
    expect(first.summary).toMatchObject({
      runCount: 1,
      statusCounts: {
        passed: 0,
        warning: 1,
        failed: 0,
        unknown: 0,
      },
    });
    expect(first.runs[0].counts).toMatchObject({
      nodes: ball.nodes.length,
      edges: ball.edges.length,
      rankTwoCells: ball.twoCells.length,
      missingFlagSimplices: 0,
    });
  });

  it("compares runs by count deltas, status, and warning changes", () => {
    const baseline = createExperimentBundle({
      createdAt,
      runs: [
        {
          id: "baseline",
          dataset: { id: "toy" },
          view: { mode: "shell" },
          render: { cells: false },
          topology: {},
          counts: { nodes: 3, edges: 2 },
          warnings: ["old warning", "shared warning"],
        },
        {
          id: "candidate",
          dataset: { id: "toy" },
          view: { mode: "shell" },
          render: { cells: true },
          topology: {},
          counts: { nodes: 5, edges: 4, rankTwoCells: 1 },
          warnings: ["new warning", "shared warning"],
          status: "failed",
        },
      ],
    });

    const comparison = compareExperimentRuns(
      baseline.runs.find((run) => run.id === "baseline")!,
      baseline.runs.find((run) => run.id === "candidate")!,
    );

    expect(comparison.statusChanged).toBe(true);
    expect(comparison.countDeltas).toEqual({
      edges: 2,
      nodes: 2,
      rankTwoCells: 1,
    });
    expect(comparison.addedWarnings).toEqual(["new warning"]);
    expect(comparison.removedWarnings).toEqual(["old warning"]);
    expect(comparison.unchangedWarnings).toEqual(["shared warning"]);
  });
});

describe("link-condition diagnostics", () => {
  it("passes the flag condition when every clique is filled", () => {
    const complex = createFiniteSimplicialComplex({
      simplices: [["a", "b", "c"]],
    });
    const diagnostics = diagnoseFlagLinkCondition(complex);

    expect(complex.simplexCountByDimension).toEqual({
      "0": 3,
      "1": 3,
      "2": 1,
    });
    expect(diagnostics.status).toBe("passes");
    expect(diagnostics.missingFlagSimplices).toEqual([]);
  });

  it("finds a missing simplex when a clique is not filled", () => {
    const complex = createFiniteSimplicialComplex({
      vertices: ["a", "b", "c"],
      simplices: [
        ["a", "b"],
        ["a", "c"],
        ["b", "c"],
      ],
    });
    const summary = summarizeTopologyDiagnostics(complex);

    expect(summary.linkCondition.status).toBe("fails");
    expect(summary.linkCondition.missingFlagSimplices).toEqual([
      { vertices: ["a", "b", "c"], dimension: 2 },
    ]);
    expect(summary.maximalSimplexDimensions).toEqual([1]);
  });
});
