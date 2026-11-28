// Web Worker entry for the kernel pool (see kernelPool.ts).
import { runKernel, transferablesOf, type KernelName } from "./kernels";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = (event) => {
  const message = event.data as { id: number; name: KernelName; args: never };
  try {
    const result = runKernel(message.name, message.args);
    scope.postMessage({ id: message.id, result }, transferablesOf(result));
  } catch (error) {
    scope.postMessage({
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
