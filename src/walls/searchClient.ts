import { searchMaximumLawfulSubcomplex } from "./search";
import type {
  MaximumLawfulSearchOptions,
  MaximumLawfulSearchResult,
  WallSystem,
} from "./types";
import type { BarXCompressedComplex } from "../compression/types";
import type {
  WallSearchWorkerRequest,
  WallSearchWorkerResponse,
} from "./searchWorkerTypes";

interface PendingSearch {
  resolve: (result: MaximumLawfulSearchResult) => void;
  reject: (error: Error) => void;
}

/** Long-lived worker client for the potentially exponential wall search. */
export class WallSearchClient {
  private worker: Worker | undefined;
  private nextRequestId = 1;
  private latestRequestId = 0;
  private readonly pending = new Map<number, PendingSearch>();

  search(
    barX: BarXCompressedComplex,
    wallSystem: WallSystem,
    options: MaximumLawfulSearchOptions = {},
  ): Promise<MaximumLawfulSearchResult> {
    const requestId = this.nextRequestId++;
    this.latestRequestId = requestId;
    if (typeof Worker === "undefined") {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(searchMaximumLawfulSubcomplex(barX, wallSystem, options));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }, 0);
      });
    }
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      const request: WallSearchWorkerRequest = {
        type: "search-lawful-subcomplex",
        requestId,
        barX,
        wallSystem,
        options,
      };
      worker.postMessage(request);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Wall search worker was disposed."));
    }
    this.pending.clear();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./searchWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<WallSearchWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.requestId);
      if (!pending) return;
      this.pending.delete(response.requestId);
      if (response.requestId !== this.latestRequestId) {
        pending.reject(
          new Error("Wall search was superseded by a newer request."),
        );
        return;
      }
      if (response.type === "search-lawful-subcomplex-failure") {
        pending.reject(new Error(response.error));
      } else {
        pending.resolve(response.result);
      }
    };
    worker.onerror = (event) => {
      const message = event.message || "Wall search worker failed.";
      for (const pending of this.pending.values()) {
        pending.reject(new Error(message));
      }
      this.pending.clear();
      worker.terminate();
      if (this.worker === worker) this.worker = undefined;
    };
    this.worker = worker;
    return worker;
  }
}
