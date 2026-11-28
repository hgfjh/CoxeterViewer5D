/**
 * A fixed set of workers running the kernels in kernels.ts.
 *
 * The pool is environment-agnostic: Node uses worker_threads (see
 * nodeKernelPool.ts, kept separate so browser bundles never see
 * node:worker_threads), the browser uses module Web Workers, and anything
 * else (or a worker that fails to start) falls back to running kernels
 * inline on the calling thread.  The
 * fallback returns identical results, only slower.
 *
 * Sharing rows without copies needs SharedArrayBuffer.  Node always has it;
 * a browser page has it only when cross-origin isolated (COOP same-origin and
 * COEP require-corp, set in vite.config.ts and the Tauri config).
 */
import {
  runKernel,
  type KernelArgs,
  type KernelName,
  type KernelResult,
} from "./kernels";

export interface KernelPool {
  /** Number of kernels that can run at once. */
  readonly size: number;
  readonly kind: "node-workers" | "web-workers" | "inline";
  run<K extends KernelName>(
    name: K,
    args: KernelArgs<K>,
  ): Promise<KernelResult<K>>;
  close(): Promise<void>;
}

/** Pool that runs every kernel on the calling thread. */
export function createInlineKernelPool(): KernelPool {
  return {
    size: 1,
    kind: "inline",
    run: async (name, args) => runKernel(name, args),
    close: async () => {},
  };
}

export interface PortLike {
  postMessage(message: unknown): void;
  terminate(): unknown;
}

type PortMessage = { id: number; result?: unknown; error?: string };

/**
 * Queue kernels over started workers.  Each worker runs one kernel at a time;
 * memory-latency-bound kernels gain nothing from oversubscription.  `listen`
 * wires a port's messages to `onMessage` and its crash to `onFailure`; a
 * crash rejects the kernel that was running there.
 */
export function poolOverPorts(
  kind: KernelPool["kind"],
  ports: PortLike[],
  listen: (
    port: PortLike,
    onMessage: (data: PortMessage) => void,
    onFailure: (error: unknown) => void,
  ) => void,
): KernelPool {
  let nextId = 0;
  const idle = [...ports];
  const waiting: Array<() => void> = [];
  const running = new Map<
    PortLike,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  for (const port of ports) {
    listen(
      port,
      (data) => {
        const entry = running.get(port);
        if (!entry || data.id < 0) return;
        running.delete(port);
        idle.push(port);
        waiting.shift()?.();
        if (data.error !== undefined) entry.reject(new Error(data.error));
        else entry.resolve(data.result);
      },
      (error) => {
        const entry = running.get(port);
        running.delete(port);
        entry?.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      },
    );
  }
  const acquire = async (): Promise<PortLike> => {
    while (idle.length === 0) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    return idle.pop()!;
  };
  return {
    size: ports.length,
    kind,
    async run(name, args) {
      const port = await acquire();
      const id = nextId++;
      return new Promise((resolve, reject) => {
        running.set(port, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        port.postMessage({ id, name, args });
      });
    },
    async close() {
      await Promise.all(ports.map((port) => port.terminate()));
    },
  };
}

/** Worker count that leaves one core for the coordinating thread. */
export function defaultKernelPoolSize(): number {
  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  return Math.max(1, cores - 1);
}

/**
 * Browser pool over module Web Workers.  Without cross-origin isolation the
 * rows would be copied into every worker, so the inline pool is used instead.
 */
export function createBrowserKernelPool(size: number): KernelPool {
  if (
    size <= 1 ||
    typeof Worker === "undefined" ||
    typeof SharedArrayBuffer === "undefined" ||
    !(globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated
  ) {
    return createInlineKernelPool();
  }
  const workers = Array.from(
    { length: size },
    () =>
      new Worker(new URL("./kernelWorker.browser.ts", import.meta.url), {
        type: "module",
      }),
  );
  return poolOverPorts("web-workers", workers, (port, onMessage, onFailure) => {
    (port as Worker).addEventListener("message", (event) =>
      onMessage(event.data),
    );
    (port as Worker).addEventListener("error", onFailure);
  });
}

/**
 * Copy rows into one SharedArrayBuffer (no-op for rows already shared), so
 * kernels on other threads read them without a per-worker copy.
 */
export function shareRows(rows: readonly ArrayLike<number>[]): Uint32Array[] {
  if (
    rows.every(
      (row) =>
        row instanceof Uint32Array &&
        typeof SharedArrayBuffer !== "undefined" &&
        row.buffer instanceof SharedArrayBuffer,
    )
  ) {
    return rows as Uint32Array[];
  }
  if (typeof SharedArrayBuffer === "undefined") {
    return rows.map((row) => Uint32Array.from(row));
  }
  return rows.map((row) => {
    const shared = new Uint32Array(new SharedArrayBuffer(row.length * 4));
    shared.set(row);
    return shared;
  });
}

/**
 * Run `start` on each job with at most 2 * pool.size jobs in flight, and
 * hand results to `consume` strictly in job order.  Lets the calling thread
 * fold results sequentially (e.g. union-find, digests) while workers run
 * ahead, so the outcome is the same as a sequential loop.
 */
export async function runOrdered<J, R>(
  pool: KernelPool,
  jobs: Iterable<J>,
  start: (job: J) => Promise<R>,
  consume: (result: R) => void,
): Promise<void> {
  const window = Math.max(1, 2 * pool.size);
  const iterator = jobs[Symbol.iterator]();
  const inFlight: Array<Promise<R>> = [];
  const pull = () => {
    const next = iterator.next();
    if (!next.done) inFlight.push(start(next.value));
  };
  while (inFlight.length < window) {
    const before = inFlight.length;
    pull();
    if (inFlight.length === before) break;
  }
  while (inFlight.length > 0) {
    const result = await inFlight.shift()!;
    pull();
    consume(result);
  }
}

/**
 * The same typed array in shared memory: returned as is when it already is
 * shared (or when the environment has no SharedArrayBuffer), copied once
 * otherwise.  Large tables posted to workers must be shared, since posting
 * an ordinary typed array copies its whole buffer for every job.
 */
export function toShared<
  T extends Uint32Array | Int32Array | Int8Array | Uint8Array,
>(array: T): T {
  if (
    typeof SharedArrayBuffer === "undefined" ||
    array.buffer instanceof SharedArrayBuffer
  ) {
    return array;
  }
  return sharedCopy(array);
}

/** A fresh copy, in shared memory when the environment has it. */
export function sharedCopy<
  T extends Uint32Array | Int32Array | Int8Array | Uint8Array,
>(array: T): T {
  if (typeof SharedArrayBuffer === "undefined") return array.slice() as T;
  const Constructor = array.constructor as new (buffer: SharedArrayBuffer) => T;
  const copy = new Constructor(new SharedArrayBuffer(array.byteLength));
  copy.set(array as never);
  return copy;
}

type TypedArrayConstructor<T> = {
  new (length: number): T;
  new (buffer: SharedArrayBuffer): T;
  readonly BYTES_PER_ELEMENT: number;
};

/**
 * A zeroed typed array in shared memory when the environment has it, an
 * ordinary one otherwise.  Tables that worker kernels will read are
 * allocated this way so they never need a second copy.
 */
export function allocShared<T>(
  Constructor: TypedArrayConstructor<T>,
  length: number,
): T {
  return typeof SharedArrayBuffer === "undefined"
    ? new Constructor(length)
    : new Constructor(
        new SharedArrayBuffer(length * Constructor.BYTES_PER_ELEMENT),
      );
}
