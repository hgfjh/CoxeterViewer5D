import {
  searchFullDavisWallCoorientations,
  type FullDavisCoorientationSearchOptions,
  type FullDavisCoorientationSearchResult,
} from "./fullDavisSearch";
import type {
  FullDavisWorkerRequest,
  FullDavisWorkerResponse,
} from "./fullDavisWorkerTypes";
import type { QuotientComplex } from "../quotient";

interface PendingRequest {
  resolve: (result: FullDavisCoorientationSearchResult) => void;
  reject: (error: Error) => void;
}

/** Persistent worker client for full-poset subdivision and sign search. */
export class FullDavisCertificationClient {
  private worker: Worker | undefined;
  private nextRequestId = 1;
  private latestRequestId = 0;
  private readonly pending = new Map<number, PendingRequest>();

  search(
    quotient: QuotientComplex,
    options: FullDavisCoorientationSearchOptions = {},
  ): Promise<FullDavisCoorientationSearchResult> {
    const requestId = this.nextRequestId++;
    this.latestRequestId = requestId;
    if (typeof Worker === "undefined") {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(searchFullDavisWallCoorientations({ quotient, options }));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }, 0);
      });
    }
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      const request: FullDavisWorkerRequest = {
        type: "search-full-davis-fibering",
        requestId,
        quotient,
        options,
      };
      worker.postMessage(request);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const pending of this.pending.values()) {
      pending.reject(
        new Error("Full Davis certification worker was disposed."),
      );
    }
    this.pending.clear();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(
      new URL("./fullDavisWorker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    worker.onmessage = (event: MessageEvent<FullDavisWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.requestId);
      if (!pending) return;
      this.pending.delete(response.requestId);
      if (response.requestId !== this.latestRequestId) {
        pending.reject(
          new Error(
            "Full Davis certification was superseded by a newer request.",
          ),
        );
        return;
      }
      if (response.type === "search-full-davis-fibering-failure") {
        pending.reject(new Error(response.error));
      } else {
        pending.resolve(response.result);
      }
    };
    worker.onerror = (event) => {
      const error = new Error(
        event.message || "Full Davis certification worker failed.",
      );
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      worker.terminate();
      if (this.worker === worker) this.worker = undefined;
    };
    this.worker = worker;
    return worker;
  }
}
