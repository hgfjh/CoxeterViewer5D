import type { VirtualAlgebraicFiberingCertificate } from "../fibering/certificate";
import type { QuotientComplex } from "../quotient";
import type {
  CoorientationAnalysis,
  CoverAnalysis,
  WallSigns,
} from "./coverAnalysis";
import type {
  CoverAnalysisWorkerRequest,
  CoverAnalysisWorkerResponse,
} from "./coverAnalysisWorkerTypes";

/** A newer request replaced this one before it finished. */
export class CoverAnalysisSupersededError extends Error {
  constructor() {
    super("A newer cover analysis request replaced this one.");
    this.name = "CoverAnalysisSupersededError";
  }
}

export interface CoorientationEvaluation {
  wallSigns: WallSigns;
  result: CoorientationAnalysis;
  certificate?: VirtualAlgebraicFiberingCertificate;
}

interface Pending<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Owns the cover-analysis worker.  A new cover supersedes the previous one.
 * Wall-sign evaluations are coalesced: while one runs, only the most recent
 * request waits, so a burst of flips costs at most one extra evaluation.
 */
export class CoverAnalysisClient {
  private worker: Worker | undefined;
  private nextRequestId = 1;
  private coverRequestId: number | undefined;
  private coverPending: Pending<CoverAnalysis> | undefined;
  private evaluationInFlight:
    | {
        requestId: number;
        wallSigns: WallSigns;
        pending: Pending<CoorientationEvaluation>;
      }
    | undefined;
  private evaluationQueued:
    | { wallSigns: WallSigns; pending: Pending<CoorientationEvaluation> }
    | undefined;

  constructor(private readonly workerFactory?: () => Worker) {}

  analyze(quotient: QuotientComplex): Promise<CoverAnalysis> {
    this.coverPending?.reject(new CoverAnalysisSupersededError());
    this.dropEvaluations();
    // A running analysis cannot be interrupted inside the worker, so a new
    // cover starts on a fresh worker.
    this.worker?.terminate();
    this.worker = undefined;
    const requestId = this.nextRequestId++;
    this.coverRequestId = requestId;
    return new Promise((resolve, reject) => {
      this.coverPending = { resolve, reject };
      this.post({ type: "analyze-cover", requestId, quotient });
    });
  }

  evaluate(wallSigns: WallSigns): Promise<CoorientationEvaluation> {
    return new Promise((resolve, reject) => {
      if (this.coverRequestId === undefined) {
        reject(new Error("No cover has been analysed."));
        return;
      }
      if (this.evaluationInFlight) {
        this.evaluationQueued?.pending.reject(
          new CoverAnalysisSupersededError(),
        );
        this.evaluationQueued = { wallSigns, pending: { resolve, reject } };
        return;
      }
      this.sendEvaluation(wallSigns, { resolve, reject });
    });
  }

  dispose(): void {
    this.coverPending?.reject(new CoverAnalysisSupersededError());
    this.coverPending = undefined;
    this.dropEvaluations();
    this.worker?.terminate();
    this.worker = undefined;
  }

  private dropEvaluations() {
    this.evaluationInFlight?.pending.reject(new CoverAnalysisSupersededError());
    this.evaluationQueued?.pending.reject(new CoverAnalysisSupersededError());
    this.evaluationInFlight = undefined;
    this.evaluationQueued = undefined;
  }

  private sendEvaluation(
    wallSigns: WallSigns,
    pending: Pending<CoorientationEvaluation>,
  ) {
    const requestId = this.nextRequestId++;
    this.evaluationInFlight = { requestId, wallSigns, pending };
    this.post({
      type: "evaluate-coorientation",
      requestId,
      coverRequestId: this.coverRequestId!,
      wallSigns,
    });
  }

  private post(request: CoverAnalysisWorkerRequest) {
    this.ensureWorker().postMessage(request);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker =
      this.workerFactory?.() ??
      new Worker(new URL("./coverAnalysisWorker.ts", import.meta.url), {
        type: "module",
      });
    worker.onmessage = (event: MessageEvent<CoverAnalysisWorkerResponse>) =>
      this.handle(event.data);
    worker.onerror = (event) =>
      this.fail(event.message || "The cover-analysis worker failed.");
    this.worker = worker;
    return worker;
  }

  private handle(response: CoverAnalysisWorkerResponse) {
    if (response.requestId === this.coverRequestId && this.coverPending) {
      const pending = this.coverPending;
      this.coverPending = undefined;
      if (response.type === "cover-analyzed")
        pending.resolve(response.analysis);
      else if (response.type === "cover-analysis-failed") {
        pending.reject(new Error(response.message));
      }
      return;
    }
    const inFlight = this.evaluationInFlight;
    if (!inFlight || response.requestId !== inFlight.requestId) return;
    this.evaluationInFlight = undefined;
    if (response.type === "coorientation-evaluated") {
      inFlight.pending.resolve({
        wallSigns: inFlight.wallSigns,
        result: response.result,
        certificate: response.certificate,
      });
    } else if (response.type === "cover-analysis-failed") {
      inFlight.pending.reject(new Error(response.message));
    }
    const queued = this.evaluationQueued;
    this.evaluationQueued = undefined;
    if (queued) this.sendEvaluation(queued.wallSigns, queued.pending);
  }

  private fail(message: string) {
    const error = new Error(message);
    this.coverPending?.reject(error);
    this.coverPending = undefined;
    this.evaluationInFlight?.pending.reject(error);
    this.evaluationQueued?.pending.reject(error);
    this.evaluationInFlight = undefined;
    this.evaluationQueued = undefined;
    this.coverRequestId = undefined;
    this.worker?.terminate();
    this.worker = undefined;
  }
}
