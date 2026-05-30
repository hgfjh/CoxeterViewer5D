import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PROJECT_SESSION_FILE_NAME,
  createProjectSession,
  createProjectSessionExport,
  createProjectSessionSnapshot,
  createProjectSessionWorkspace,
  formatSessionIssues,
  hasProjectSessionChanges,
  importProjectSession,
  serializeProjectSession,
  upsertRecentProjectSession,
  validateProjectSession,
} from "../src/app/projectSession";

const createdAt = "2026-01-01T00:00:00.000Z";

describe("project sessions", () => {
  it("creates a valid default session for the viewer shell", () => {
    const session = createProjectSession({ createdAt });
    const result = validateProjectSession(session);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        schemaVersion: 1,
        sessionKind: "coxeter-viewer-project-session",
        dataset: {
          sourceKind: "example",
          activeDatasetId: "I2_5",
        },
        generation: {
          radius: 3,
          backend: "browserApproxBackend",
        },
        desktop: {
          preferredRuntime: "web",
        },
      });
    }
  });

  it("round-trips session imports and exports deterministically", () => {
    const session = createProjectSession({
      createdAt,
      updatedAt: "2026-01-02T00:00:00.000Z",
      project: { id: "local-coxeter-study", label: "Local Coxeter study" },
      dataset: {
        sourceKind: "generated-ball",
        activeDatasetId: "A3-radius-3",
        generatedBallId: "ball:A3:radius-3",
      },
      generation: {
        radius: 3,
        maxRadius: 6,
        maxNodes: 1000,
        maxEdges: 4000,
      },
      view: {
        mode: "local-topology",
        labelScope: "focused",
        selectedNodeId: "e",
        activeGeneratorPairKey: "0-1",
        camera: {
          position: [2, 3, 5],
          target: [0, 0, 0],
          zoom: 1.25,
        },
      },
      files: {
        recent: [
          {
            id: "source:A3",
            kind: "coxeter-system",
            label: "A3",
            path: "public/examples/A3.json",
            sha256: "a".repeat(64),
            lastOpenedAt: createdAt,
          },
        ],
      },
      experiments: {
        activeBundleId: "bundle:local",
        bundleIds: ["bundle:local"],
      },
      warnings: ["rounded matrix hash", "rounded matrix hash"],
      notes: ["rank-two cells enabled"],
    });

    const exported = createProjectSessionExport(session);
    const imported = importProjectSession(exported.contents);

    expect(exported.fileName).toBe(PROJECT_SESSION_FILE_NAME);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      throw new Error(formatSessionIssues(imported.errors).join("\n"));
    }
    expect(serializeProjectSession(imported.value)).toBe(exported.contents);
    expect(JSON.parse(exported.contents)).toMatchObject({
      warnings: ["rounded matrix hash"],
      view: {
        camera: {
          position: [2, 3, 5],
        },
      },
    });
  });

  it("rejects malformed session state with field-level errors", () => {
    const invalid = {
      ...createProjectSession({ createdAt }),
      generation: {
        radius: -1,
        backend: "mysteryBackend",
        maxRadius: 3,
        maxNodes: 0,
        maxEdges: 10,
      },
      view: {
        mode: "flat-diagram",
        labelScope: "selected",
        showRankTwoCells: true,
        showHigherCells: false,
        showNodeLabels: false,
        showEdgeLabels: false,
      },
    };

    const result = validateProjectSession(invalid);

    expect(result.ok).toBe(false);
    expect(formatSessionIssues(result.errors).join("\n")).toContain(
      "$.generation.radius",
    );
    expect(formatSessionIssues(result.errors).join("\n")).toContain(
      "$.view.mode",
    );
  });

  it("tracks workspace metadata without requiring native desktop state", () => {
    const session = createProjectSession({
      createdAt,
      workspace: createProjectSessionWorkspace({
        id: "workspace:local",
        label: "Local study",
        runtime: "tauri",
        rootPathHint: "C:/coxeter/local-study",
        sessionPath: "C:/coxeter/local-study/.coxeter-session.json",
      }),
    });

    const result = validateProjectSession(session);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workspace).toMatchObject({
        id: "workspace:local",
        label: "Local study",
        runtime: "tauri",
      });
    }
  });

  it("fingerprints snapshots and upserts recent sessions deterministically", () => {
    const saved = createProjectSessionSnapshot(
      createProjectSession({ createdAt, generation: { radius: 2 } }),
    );
    const current = createProjectSessionSnapshot(
      createProjectSession({ createdAt, generation: { radius: 3 } }),
    );
    const recent = upsertRecentProjectSession(
      [
        {
          id: "session:old",
          kind: "session",
          label: "Old",
          path: "C:/old/.coxeter-session.json",
        },
      ],
      {
        id: "session:new",
        label: "New",
        path: "C:/new/.coxeter-session.json",
      },
    );

    expect(hasProjectSessionChanges(saved, current)).toBe(true);
    expect(recent.map((entry) => entry.id)).toEqual([
      "session:new",
      "session:old",
    ]);
    expect(recent[0].kind).toBe("session");
  });

  it("validates .coxeter-session.json files from the Node script", () => {
    const directory = mkdtempSync(join(tmpdir(), "coxeter-session-"));
    const validPath = join(directory, PROJECT_SESSION_FILE_NAME);
    const invalidPath = join(directory, "invalid-session.json");

    try {
      writeFileSync(
        validPath,
        serializeProjectSession(createProjectSession({ createdAt })),
        "utf8",
      );
      const validStdout = execFileSync(
        process.execPath,
        ["scripts/session_validate.mjs", validPath],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(JSON.parse(validStdout)).toMatchObject({
        ok: true,
        checked: 1,
      });

      writeFileSync(
        invalidPath,
        JSON.stringify({ schemaVersion: 1, sessionKind: "wrong" }),
        "utf8",
      );
      const invalidResult = spawnSync(
        process.execPath,
        ["scripts/session_validate.mjs", invalidPath],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      const invalidReport = JSON.parse(invalidResult.stdout);
      expect(invalidResult.status).toBe(1);
      expect(invalidReport.ok).toBe(false);
      expect(invalidReport.errors.join("\n")).toContain("$.sessionKind");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
