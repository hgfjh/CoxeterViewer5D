import type { QuotientComplex } from "../quotient";
import type {
  LawfulCoorientationSearchOptions,
  LawfulCoorientationSearchResult,
} from "./lawfulSearch";

export interface LawfulWorkerRequest {
  type: "search-lawful-subcomplex-fibering";
  requestId: number;
  quotient: QuotientComplex;
  options: LawfulCoorientationSearchOptions;
}

export type LawfulWorkerResponse =
  | {
      type: "search-lawful-subcomplex-fibering-success";
      requestId: number;
      result: LawfulCoorientationSearchResult;
    }
  | {
      type: "search-lawful-subcomplex-fibering-failure";
      requestId: number;
      error: string;
    };
