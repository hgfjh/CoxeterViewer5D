import type { QuotientComplex } from "../quotient";
import {
  analyzeCoorientation,
  analyzeCover,
  fiberingCertificate,
  wallCoorientation,
  type CoverAnalysis,
} from "./coverAnalysis";
import type {
  CoverAnalysisWorkerRequest,
  CoverAnalysisWorkerResponse,
} from "./coverAnalysisWorkerTypes";

/**
 * Message handler of the cover-analysis worker, as a plain function so tests
 * can drive the client against it without a browser.  It keeps the last
 * analysed cover, so each wall flip only sends the new signs.
 */
export function createCoverAnalysisHandler(): (
  request: CoverAnalysisWorkerRequest,
) => CoverAnalysisWorkerResponse {
  let current:
    | { requestId: number; quotient: QuotientComplex; analysis: CoverAnalysis }
    | undefined;
  return (request) => {
    const started = performance.now();
    try {
      if (request.type === "analyze-cover") {
        const analysis = analyzeCover(request.quotient);
        current = {
          requestId: request.requestId,
          quotient: request.quotient,
          analysis,
        };
        return {
          type: "cover-analyzed",
          requestId: request.requestId,
          analysis,
          elapsedMs: performance.now() - started,
        };
      }
      if (current?.requestId !== request.coverRequestId) {
        throw new Error("The cover this evaluation refers to was replaced.");
      }
      const { cover, wallSystem } = current.analysis;
      if (!cover || !wallSystem) {
        throw new Error("The cover has no wall system to coorient.");
      }
      const coorientation = wallCoorientation(wallSystem, request.wallSigns);
      const result = analyzeCoorientation(cover, coorientation);
      return {
        type: "coorientation-evaluated",
        requestId: request.requestId,
        result,
        certificate: fiberingCertificate({
          quotient: current.quotient,
          analysis: current.analysis,
          coorientation,
          coorientationAnalysis: result,
        }),
        elapsedMs: performance.now() - started,
      };
    } catch (error) {
      return {
        type: "cover-analysis-failed",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
