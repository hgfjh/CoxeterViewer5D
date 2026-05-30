import { describe, expect, it, vi } from "vitest";

import {
  createBrowserDesktopBridge,
  createTauriDesktopBridge,
  readStoredRecentSessions,
  shouldPromptForUnsavedChanges,
  writeStoredRecentSessions,
} from "../src/desktop";
import { createProjectSession } from "../src/app/projectSession";

describe("desktop bridge", () => {
  it("uses browser-safe fallbacks when native APIs are absent", async () => {
    const bridge = createBrowserDesktopBridge({ confirm: () => true });
    const status = await bridge.getStatus();
    const exportResult = await bridge.exportFile({
      kind: "project-session",
      fileName: ".coxeter-session.json",
      contents: "{}",
      mediaType: "application/json",
    });

    expect(status).toMatchObject({
      runtime: "browser",
      nativeAvailable: false,
      workspace: { label: "Browser workspace" },
    });
    expect(exportResult).toMatchObject({
      ok: false,
      runtime: "browser",
      fallbackDownload: true,
    });
  });

  it("loads the Tauri API lazily and invokes native export commands", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> =
      [];
    const invoke = async <T>(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<T> => {
      calls.push({ command, args });
      if (command === "write_text_export") {
        return { path: "C:/tmp/.coxeter-session.json" } as T;
      }
      return {} as T;
    };
    const loadTauriCore = vi.fn(async () => ({ invoke }));
    const loadTauriDialog = vi.fn(async () => ({
      open: async () => null,
      save: async () => "C:/tmp/.coxeter-session.json",
      confirm: async () => true,
    }));
    const bridge = createTauriDesktopBridge({ loadTauriCore, loadTauriDialog });

    expect(loadTauriCore).not.toHaveBeenCalled();

    const result = await bridge.exportFile({
      kind: "project-session",
      fileName: ".coxeter-session.json",
      contents: "{}",
      mediaType: "application/json",
    });

    expect(loadTauriCore).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        command: "write_text_export",
        args: {
          request: {
            kind: "sessionJson",
            path: "C:/tmp/.coxeter-session.json",
            contents: "{}",
            overwrite: true,
          },
        },
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      runtime: "tauri",
      path: "C:/tmp/.coxeter-session.json",
    });
  });

  it("uses the native Tauri window API for fullscreen", async () => {
    const setFullscreen = vi.fn(async () => undefined);
    const bridge = createTauriDesktopBridge({
      loadTauriWindow: async () => ({
        getCurrentWindow: () => ({
          isFullscreen: async () => false,
          setFullscreen,
        }),
      }),
    });

    const result = await bridge.toggleFullscreen();

    expect(setFullscreen).toHaveBeenCalledWith(true);
    expect(result).toMatchObject({
      ok: true,
      runtime: "tauri",
    });
  });

  it("falls back to a browser download when native session save fails", async () => {
    const bridge = createTauriDesktopBridge({
      confirm: () => true,
      loadTauriCore: async () => ({
        invoke: async () => {
          throw new Error("command not registered");
        },
      }),
      loadTauriDialog: async () => ({
        open: async () => null,
        save: async () => "C:/tmp/.coxeter-session.json",
        confirm: async () => true,
      }),
    });

    const result = await bridge.saveProjectSession(createProjectSession());

    expect(result).toMatchObject({
      ok: false,
      runtime: "tauri",
      fallbackDownload: true,
    });
    expect(result.message).toContain("command not registered");
  });

  it("stores only valid recent session records", () => {
    const storage = window.localStorage;
    storage.clear();
    writeStoredRecentSessions(
      [
        {
          id: "session:one",
          kind: "session",
          label: "One",
          lastOpenedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "not-a-session",
          kind: "coxeter-system",
        },
      ],
      storage,
    );

    expect(readStoredRecentSessions(storage)).toEqual([
      {
        id: "session:one",
        kind: "session",
        label: "One",
        lastOpenedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("exposes a tiny pure hook for unsaved-change prompts", () => {
    expect(shouldPromptForUnsavedChanges(undefined, "a")).toBe(false);
    expect(shouldPromptForUnsavedChanges("a", "a")).toBe(false);
    expect(shouldPromptForUnsavedChanges("a", "b")).toBe(true);
  });
});
