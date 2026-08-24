import type { QuotientComplex } from "../quotient";
import type {
  FullDavisCoorientationSearchOptions,
  FullDavisCoorientationSearchResult,
} from "./fullDavisSearch";

export interface FullDavisWorkerRequest {
  type: "search-full-davis-fibering";
  requestId: number;
  quotient: QuotientComplex;
  options: FullDavisCoorientationSearchOptions;
}

export type FullDavisWorkerResponse =
  | {
      type: "search-full-davis-fibering-success";
      requestId: number;
      result: FullDavisCoorientationSearchResult;
    }
  | {
      type: "search-full-davis-fibering-failure";
      requestId: number;
      error: string;
    };
