// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import {
  createViewerInteractionStore,
  useViewerInteractionSelector,
} from "../src/app/viewerInteractionStore";

describe("viewer interaction store", () => {
  it("notifies only selectors whose selected value changed", () => {
    const store = createViewerInteractionStore();
    const selectedNodeChanged = vi.fn();
    const selectedCellChanged = vi.fn();
    const cameraChanged = vi.fn();

    store.subscribeSelector(
      "selection",
      (selection) => selection.selectedNodeId,
      selectedNodeChanged,
    );
    store.subscribeSelector(
      "selection",
      (selection) => selection.selectedCellId,
      selectedCellChanged,
    );
    store.subscribeSelector(
      "camera",
      (camera) => camera.position,
      cameraChanged,
    );

    store.setHover({ hoveredCellId: "cell:hovered" });
    store.setSelection({ selectedCellId: "cell:selected" });

    expect(selectedNodeChanged).not.toHaveBeenCalled();
    expect(selectedCellChanged).toHaveBeenCalledOnce();
    expect(cameraChanged).not.toHaveBeenCalled();

    store.setCamera({ position: [2, 3, 4] });

    expect(cameraChanged).toHaveBeenCalledOnce();
    expect(selectedCellChanged).toHaveBeenCalledOnce();
  });

  it("batches nested updates into one notification per affected selector", () => {
    const store = createViewerInteractionStore();
    const allChanges = vi.fn();
    const nodeChanges = vi.fn();
    const cameraChanges = vi.fn();

    store.subscribe(allChanges);
    store.subscribeSelector(
      "selection",
      (selection) => selection.selectedNodeId,
      nodeChanges,
    );
    store.subscribeSelector(
      "camera",
      (camera) => camera.position,
      cameraChanges,
    );

    store.batch(() => {
      store.setSelection({ selectedNodeId: "node:1" });
      store.setSelection({ selectedNodeId: "node:2" });
      store.batch(() => {
        store.setCamera({ position: [1, 0, 8] });
        store.setCamera({ position: [2, 0, 6] });
      });
      store.setHover({ hoveredEdgeId: "edge:1" });

      expect(allChanges).not.toHaveBeenCalled();
      expect(nodeChanges).not.toHaveBeenCalled();
      expect(cameraChanges).not.toHaveBeenCalled();
    });

    expect(allChanges).toHaveBeenCalledOnce();
    expect(nodeChanges).toHaveBeenCalledOnce();
    expect(nodeChanges).toHaveBeenCalledWith("node:2", undefined);
    expect(cameraChanges).toHaveBeenCalledOnce();
    expect(cameraChanges).toHaveBeenCalledWith([2, 0, 6], [0, 0, 10]);
  });

  it("publishes frozen snapshots and retains unchanged slice identities", () => {
    const mutablePosition: [number, number, number] = [4, 5, 6];
    const store = createViewerInteractionStore({
      camera: { position: mutablePosition },
    });
    const before = store.getSnapshot();
    mutablePosition[0] = 99;

    expect(before.camera.position).toEqual([4, 5, 6]);
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.camera)).toBe(true);
    expect(Object.isFrozen(before.camera.position)).toBe(true);

    store.setHover({ hoveredNodeId: "node:hovered" });
    const after = store.getSnapshot();

    expect(after).not.toBe(before);
    expect(after.camera).toBe(before.camera);
    expect(after.selection).toBe(before.selection);
    expect(after.hover).not.toBe(before.hover);
  });

  it("does not re-render a React selector consumer for unrelated updates", async () => {
    const store = createViewerInteractionStore();
    const renderedValues: Array<string | undefined> = [];
    const container = document.createElement("div");
    const root = createRoot(container);

    function SelectionProbe() {
      const selectedNodeId = useViewerInteractionSelector(
        store,
        "selection",
        (selection) => selection.selectedNodeId,
      );
      renderedValues.push(selectedNodeId);
      return createElement("span", null, selectedNodeId ?? "none");
    }

    await act(async () => root.render(createElement(SelectionProbe)));
    const initialRenderCount = renderedValues.length;

    await act(async () => {
      store.setHover({ hoveredNodeId: "node:hovered" });
      store.setRenderStats({ renderCount: 1, renderReason: "hover" });
    });

    expect(renderedValues).toHaveLength(initialRenderCount);

    await act(async () => {
      store.batch(() => {
        store.setSelection({ selectedNodeId: "node:1" });
        store.setSelection({ selectedNodeId: "node:2" });
      });
    });

    expect(renderedValues).toHaveLength(initialRenderCount + 1);
    expect(renderedValues.at(-1)).toBe("node:2");
    expect(container.textContent).toBe("node:2");

    await act(async () => root.unmount());
  });
});
