import type { QuotientComplex } from "../quotient";
import {
  searchLawfulSubcomplexCoorientations,
  type LawfulCoorientationSearchOptions,
  type LawfulCoorientationSearchResult,
} from "./lawfulSearch";
import type {
  LawfulWorkerRequest,
  LawfulWorkerResponse,
} from "./lawfulWorkerTypes";

interface PendingRequest {
  resolve: (result: LawfulCoorientationSearchResult) => void;
  reject: (error: Error) => void;
}

/** Persistent worker client for the inexpensive lawful-first sign search. */
export class LawfulCertificationClient {
  private worker: Worker | undefined;
  private nextRequestId = 1;
  private latestRequestId = 0;
  private readonly pending = new Map<number, PendingRequest>();

  search(
    quotient: QuotientComplex,
    options: LawfulCoorientationSearchOptions = {},
  ): Promise<LawfulCoorientationSearchResult> {
    const requestId = this.nextRequestId++;
    this.latestRequestId = requestId;
    if (typeof Worker === "undefined") {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(
              searchLawfulSubcomplexCoorientations({ quotient, options }),
            );
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }, 0);
      });
    }
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      const request: LawfulWorkerRequest = {
        type: "search-lawful-subcomplex-fibering",
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
      pending.reject(new Error("Lawful certification worker was disposed."));
    }
    this.pending.clear();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./lawfulWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<LawfulWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.requestId);
      if (!pending) return;
      this.pending.delete(response.requestId);
      if (response.requestId !== this.latestRequestId) {
        pending.reject(
          new Error("Lawful certification was superseded by a newer request."),
        );
        return;
      }
      if (response.type === "search-lawful-subcomplex-fibering-failure") {
        pending.reject(new Error(response.error));
      } else {
        pending.resolve(response.result);
      }
    };
    worker.onerror = (event) => {
      const error = new Error(
        event.message || "Lawful certification worker failed.",
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
