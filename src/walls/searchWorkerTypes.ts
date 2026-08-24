import type { BarXCompressedComplex } from "../compression/types";
import type {
  MaximumLawfulSearchOptions,
  MaximumLawfulSearchResult,
  WallSystem,
} from "./types";

export interface WallSearchWorkerRequest {
  type: "search-lawful-subcomplex";
  requestId: number;
  barX: BarXCompressedComplex;
  wallSystem: WallSystem;
  options: MaximumLawfulSearchOptions;
}

export type WallSearchWorkerResponse =
  | {
      type: "search-lawful-subcomplex-success";
      requestId: number;
      result: MaximumLawfulSearchResult;
    }
  | {
      type: "search-lawful-subcomplex-failure";
      requestId: number;
      error: string;
    };
