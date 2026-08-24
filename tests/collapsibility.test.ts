import { describe, expect, it } from "vitest";

import {
  canonicalSimplexId,
  checkSimplicialCollapsibility,
  verifyCollapseCertificate,
  verifyCollapsibilityCertificate,
  verifyNonCollapsibilityCertificate,
  type CollapseSequenceCertificate,
  type ExhaustiveNonCollapsibilityCertificate,
} from "../src/topology/collapsibility";

describe("simplicial collapsibility", () => {
  it("returns and replays a deterministic collapse sequence", () => {
    const input = { simplices: [["c", "a", "b"]] };
    const first = checkSimplicialCollapsibility(input, {
      maxMilliseconds: Number.POSITIVE_INFINITY,
    });
    const reordered = checkSimplicialCollapsibility(
      { simplices: [["b", "c", "a"]] },
      { maxMilliseconds: Number.POSITIVE_INFINITY },
    );

    expect(first.status).toBe("collapsible");
    expect(reordered.status).toBe("collapsible");
    if (first.status !== "collapsible" || reordered.status !== "collapsible") {
      throw new Error("A simplex must collapse to a point.");
    }
    expect(first.certificate).toEqual(reordered.certificate);
    expect(first.sequence.length).toBe(3);
    expect(verifyCollapseCertificate(input, first.certificate)).toMatchObject({
      valid: true,
      stepsVerified: 3,
      finalVertexId: canonicalSimplexId(["c"]),
    });
  });

  it("proves noncollapsibility only after exhausting every collapse branch", () => {
    const circleWithTail = {
      simplices: [
        ["a", "b"],
        ["b", "c"],
        ["a", "c"],
        ["a", "d"],
      ],
    };
    const result = checkSimplicialCollapsibility(circleWithTail, {
      maxMilliseconds: Number.POSITIVE_INFINITY,
    });

    expect(result.status).toBe("proven-not-collapsible");
    if (result.status !== "proven-not-collapsible") {
      throw new Error(
        "A circle with a collapsible tail remains noncollapsible.",
      );
    }
    expect(result.stats.exhaustive).toBe(true);
    expect(result.stats.transitionsExamined).toBeGreaterThan(0);
    expect(
      verifyNonCollapsibilityCertificate(circleWithTail, result.certificate),
    ).toMatchObject({ valid: true });
  });

  it("uses unknown-budget instead of guessing when search cannot begin", () => {
    const result = checkSimplicialCollapsibility(
      { simplices: [["a", "b", "c"]] },
      {
        maxStates: 0,
        maxMilliseconds: Number.POSITIVE_INFINITY,
      },
    );

    expect(result).toMatchObject({
      status: "unknown-budget",
      collapsible: null,
      reason: "state-budget",
    });
    expect("certificate" in result).toBe(false);
  });

  it("supports deterministic archival budgets without wall-clock dependence", () => {
    const options = {
      maxStates: 100,
      maxTransitions: 1_000,
      // This would stop immediately in interactive mode.
      maxMilliseconds: 0,
      deterministicStateBudgetOnly: true,
    } as const;
    const first = checkSimplicialCollapsibility(
      { simplices: [["a", "b", "c"]] },
      options,
    );
    const second = checkSimplicialCollapsibility(
      { simplices: [["a", "b", "c"]] },
      options,
    );
    expect(first.status).toBe("collapsible");
    expect(first).toEqual(second);
    expect(first.stats.elapsedMilliseconds).toBe(0);
  });

  it("rejects a tampered positive certificate", () => {
    const input = { simplices: [["a", "b", "c"]] };
    const result = checkSimplicialCollapsibility(input, {
      maxMilliseconds: Number.POSITIVE_INFINITY,
    });
    if (result.status !== "collapsible") {
      throw new Error("Expected a positive certificate.");
    }
    const tampered = structuredClone(
      result.certificate,
    ) as CollapseSequenceCertificate;
    tampered.steps[0].freeFaceId = canonicalSimplexId(["a"]);

    expect(verifyCollapsibilityCertificate(input, tampered)).toMatchObject({
      valid: false,
    });
  });

  it("rejects a tampered exhaustive certificate", () => {
    const input = {
      simplices: [
        ["a", "b"],
        ["b", "c"],
        ["a", "c"],
        ["a", "d"],
      ],
    };
    const result = checkSimplicialCollapsibility(input, {
      maxMilliseconds: Number.POSITIVE_INFINITY,
    });
    if (result.status !== "proven-not-collapsible") {
      throw new Error("Expected an exhaustive negative certificate.");
    }
    const tampered = structuredClone(
      result.certificate,
    ) as ExhaustiveNonCollapsibilityCertificate;
    const root = tampered.states.find(
      (state) => state.stateId === tampered.rootStateId,
    );
    if (root === undefined || root.collapses.length === 0) {
      throw new Error("Fixture must have a nonterminal root state.");
    }
    root.collapses.pop();

    expect(verifyCollapsibilityCertificate(input, tampered)).toMatchObject({
      valid: false,
    });
  });

  it("distinguishes isolated components from a single collapsible point", () => {
    const point = checkSimplicialCollapsibility({
      vertices: ["only"],
      simplices: [],
    });
    const twoPoints = checkSimplicialCollapsibility({
      vertices: ["left", "right"],
      simplices: [],
    });

    expect(point.status).toBe("collapsible");
    expect(twoPoints.status).toBe("proven-not-collapsible");
  });

  it("uses unambiguous simplex ids for labels containing separators", () => {
    expect(canonicalSimplexId(["a,b", "c"])).not.toBe(
      canonicalSimplexId(["a", "b,c"]),
    );
    expect(canonicalSimplexId(["c", "a,b"])).toBe(
      canonicalSimplexId(["a,b", "c"]),
    );
  });
});
