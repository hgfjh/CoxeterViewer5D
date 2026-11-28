/**
 * Kernel pool over Node worker_threads.  Node-only: browser code imports
 * kernelPool.ts, which never references node:worker_threads.
 */
import { Worker } from "node:worker_threads";
import {
  createInlineKernelPool,
  poolOverPorts,
  type KernelPool,
} from "./kernelPool";

/**
 * Start `size` workers.  Workers inherit the parent's execArgv, so under tsx
 * they load the TypeScript entry directly.  Returns the inline pool when
 * workers cannot start (for example inside a test runner that does not
 * propagate its module loader).
 */
export async function createNodeKernelPool(size: number): Promise<KernelPool> {
  if (size <= 1) return createInlineKernelPool();
  const entry = new URL("./kernelWorker.node.ts", import.meta.url);
  const workers: Worker[] = [];
  try {
    for (let index = 0; index < size; index += 1) {
      workers.push(new Worker(entry));
    }
    // A worker that cannot load its module reports an error before its
    // first message; probe each one with a trivial kernel (id -1, ignored by
    // the pool).
    const probe = new Uint32Array(new SharedArrayBuffer(8));
    probe[0] = 1;
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((resolve, reject) => {
            worker.once("error", reject);
            worker.once("message", () => {
              worker.off("error", reject);
              resolve();
            });
            worker.postMessage({
              id: -1,
              name: "alternatingRelation",
              args: {
                left: probe,
                right: probe,
                m: 1,
                degree: 2,
                involutions: true,
              },
            });
          }),
      ),
    );
  } catch {
    await Promise.all(workers.map((worker) => worker.terminate()));
    return createInlineKernelPool();
  }
  return poolOverPorts(
    "node-workers",
    workers,
    (port, onMessage, onFailure) => {
      const worker = port as Worker;
      worker.on("message", onMessage);
      worker.on("error", onFailure);
    },
  );
}
