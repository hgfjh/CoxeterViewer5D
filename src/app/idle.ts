export interface IdleDeadlineLike {
  didTimeout: boolean;
  timeRemaining(): number;
}

export interface IdleTaskOptions {
  timeout?: number;
}

export type CancelIdleTask = () => void;

type NativeIdleCallback = (deadline: IdleDeadlineLike) => void;

interface IdleCapableGlobal {
  requestIdleCallback?: (
    callback: NativeIdleCallback,
    options?: IdleTaskOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

export function scheduleIdleTask(
  callback: NativeIdleCallback,
  options: IdleTaskOptions = {},
  host: IdleCapableGlobal = globalThis,
): CancelIdleTask {
  if (typeof host.requestIdleCallback === "function") {
    const handle = host.requestIdleCallback(callback, options);
    return () => host.cancelIdleCallback?.(handle);
  }

  const startedAt = performanceNow();
  const handle = host.setTimeout(
    () => {
      callback({
        didTimeout: Boolean(options.timeout),
        timeRemaining: () => Math.max(0, 16 - (performanceNow() - startedAt)),
      });
    },
    Math.min(Math.max(options.timeout ?? 1, 1), 50),
  );

  return () => host.clearTimeout(handle);
}

export function scheduleIdleBatch<T>(
  items: readonly T[],
  visit: (item: T) => void,
  options: IdleTaskOptions & { minTimeRemainingMs?: number } = {},
): CancelIdleTask {
  let cancelled = false;
  let cursor = 0;
  let cancelCurrent: CancelIdleTask | undefined;
  const minTimeRemainingMs = options.minTimeRemainingMs ?? 4;

  const run = (deadline: IdleDeadlineLike) => {
    while (
      cursor < items.length &&
      (deadline.didTimeout || deadline.timeRemaining() > minTimeRemainingMs)
    ) {
      visit(items[cursor]);
      cursor += 1;
    }

    if (!cancelled && cursor < items.length) {
      cancelCurrent = scheduleIdleTask(run, options);
    }
  };

  cancelCurrent = scheduleIdleTask(run, options);
  return () => {
    cancelled = true;
    cancelCurrent?.();
  };
}

function performanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
