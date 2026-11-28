import type { SceneRenderStats } from "../render/SceneView";

/**
 * Renderer statistics live outside React state: the renderer publishes after
 * every scene update, and only the components that display a statistic
 * subscribe to it.  Storing them in App state re-rendered the whole shell
 * after each update just to refresh one number.
 */
export interface RenderStatsStore {
  publish: (stats: SceneRenderStats) => void;
  subscribe: (listener: () => void) => () => void;
  drawCalls: () => number | undefined;
}

export function createRenderStatsStore(): RenderStatsStore {
  let latest: SceneRenderStats | undefined;
  const listeners = new Set<() => void>();
  return {
    publish(stats) {
      const previousDrawCalls = latest?.drawCalls;
      latest = stats;
      if (stats.drawCalls !== previousDrawCalls) {
        for (const listener of listeners) listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    drawCalls: () => latest?.drawCalls,
  };
}
