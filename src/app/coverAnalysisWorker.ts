/// <reference lib="webworker" />
// Runs the cover chain for large imports (see coverAnalysisWorkerCore.ts).
import { createCoverAnalysisHandler } from "./coverAnalysisWorkerCore";
import type { CoverAnalysisWorkerRequest } from "./coverAnalysisWorkerTypes";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handle = createCoverAnalysisHandler();

scope.onmessage = (event: MessageEvent<CoverAnalysisWorkerRequest>) => {
  scope.postMessage(handle(event.data));
};
