// worker_threads entry for the kernel pool (see kernelPool.ts).
import { parentPort } from "node:worker_threads";
import { runKernel, transferablesOf, type KernelName } from "./kernels";

parentPort!.on(
  "message",
  (message: { id: number; name: KernelName; args: never }) => {
    try {
      const result = runKernel(message.name, message.args);
      parentPort!.postMessage(
        { id: message.id, result },
        transferablesOf(result),
      );
    } catch (error) {
      parentPort!.postMessage({
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
