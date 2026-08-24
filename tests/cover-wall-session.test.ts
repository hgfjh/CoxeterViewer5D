import { describe, expect, it } from "vitest";
import type { QuotientComplex } from "../src/quotient";
import {
  parseCoverWallViewSession,
  type CoverWallViewSession,
} from "../src/app/coverWallSession";
import I2_5_IDENTITY_QUOTIENT from "../src/examples/I2_5_identity_quotient.json";

function validSession(): CoverWallViewSession {
  return {
    schemaVersion: 1,
    sessionKind: "coxeter-cover-wall-session",
    appVersion: "0.2.0",
    updatedAt: "2026-08-10T12:00:00.000Z",
    exampleId: "I2_5",
    sourceCover: I2_5_IDENTITY_QUOTIENT as unknown as QuotientComplex,
    view: {
      model: "bar-x",
      radius: 5,
      projection: "poincare-axes",
      selectedNodeId: "q0",
      selectedCellId: "bar:cell:g0:g1:source-orbit-cell",
      selectedWallId: "wall:0",
      barRelationFamily: "all",
      wallSigns: { "wall:0": 1, "wall:1": -1 },
      showCells: true,
      showWalls: true,
      wallDisplayMode: "selected",
      showInducedDirections: true,
      colorEdgesByWall: true,
      showDiscardedCells: false,
      showNodeLabels: true,
      showEdgeLabels: true,
      linkLens: "ascending",
      uiMode: "research",
      colorScheme: "dark",
    },
  };
}

describe("cover/wall view sessions", () => {
  it("round-trips the active cover, coorientation, and view state", () => {
    const session = validSession();
    const parsed = parseCoverWallViewSession(JSON.stringify(session));

    expect(parsed).toEqual(session);
    expect(parsed.sourceCover?.vertices).toHaveLength(10);
    expect(parsed.view.wallSigns).toEqual({ "wall:0": 1, "wall:1": -1 });
  });

  it("rejects an unrelated session envelope", () => {
    const session = validSession() as unknown as Record<string, unknown>;
    session.sessionKind = "coxeter-project-session";

    expect(() => parseCoverWallViewSession(JSON.stringify(session))).toThrow(
      /coxeter-cover-wall-session/,
    );
  });

  it("rejects coorientation values other than plus or minus one", () => {
    const session = validSession() as unknown as {
      view: { wallSigns: Record<string, number> };
    };
    session.view.wallSigns["wall:0"] = 0;

    expect(() => parseCoverWallViewSession(JSON.stringify(session))).toThrow(
      /must be \+1 or -1/,
    );
  });

  it("restores wall-reader defaults from sessions saved before the reader controls", () => {
    const session = validSession() as unknown as {
      view: Record<string, unknown>;
    };
    delete session.view.wallDisplayMode;
    delete session.view.showInducedDirections;
    delete session.view.colorEdgesByWall;
    delete session.view.barRelationFamily;

    const parsed = parseCoverWallViewSession(JSON.stringify(session));

    expect(parsed.view.wallDisplayMode).toBe("all");
    expect(parsed.view.showInducedDirections).toBe(true);
    expect(parsed.view.colorEdgesByWall).toBe(true);
    expect(parsed.view.barRelationFamily).toBe("shared-complex");
  });

  it("revalidates an embedded finite action before restoring it", () => {
    const session = validSession();
    const corrupted = structuredClone(session) as CoverWallViewSession;
    corrupted.sourceCover!.edges[0].target = "missing-vertex";

    expect(() =>
      parseCoverWallViewSession(JSON.stringify(corrupted)),
    ).toThrow();
  });
});
