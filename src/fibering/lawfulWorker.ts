/// <reference lib="webworker" />

import { searchLawfulSubcomplexCoorientations } from "./lawfulSearch";
import type {
  LawfulWorkerRequest,
  LawfulWorkerResponse,
} from "./lawfulWorkerTypes";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<LawfulWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "search-lawful-subcomplex-fibering") return;
  let response: LawfulWorkerResponse;
  try {
    response = {
      type: "search-lawful-subcomplex-fibering-success",
      requestId: request.requestId,
      result: searchLawfulSubcomplexCoorientations({
        quotient: request.quotient,
        options: request.options,
      }),
    };
  } catch (error) {
    response = {
      type: "search-lawful-subcomplex-fibering-failure",
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  scope.postMessage(response);
};
