import type { VirtualAlgebraicFiberingCertificate } from "../fibering/certificate";
import type { QuotientComplex } from "../quotient";
import type {
  CoorientationAnalysis,
  CoverAnalysis,
  WallSigns,
} from "./coverAnalysis";

export type CoverAnalysisWorkerRequest =
  | { type: "analyze-cover"; requestId: number; quotient: QuotientComplex }
  | {
      type: "evaluate-coorientation";
      requestId: number;
      /** requestId of the analyze-cover call this evaluation refers to. */
      coverRequestId: number;
      wallSigns: WallSigns;
    };

export type CoverAnalysisWorkerResponse =
  | {
      type: "cover-analyzed";
      requestId: number;
      analysis: CoverAnalysis;
      elapsedMs: number;
    }
  | {
      type: "coorientation-evaluated";
      requestId: number;
      result: CoorientationAnalysis;
      certificate?: VirtualAlgebraicFiberingCertificate;
      elapsedMs: number;
    }
  | { type: "cover-analysis-failed"; requestId: number; message: string };
