/// <reference lib="webworker" />

import { searchMaximumLawfulSubcomplex } from "./search";
import type {
  WallSearchWorkerRequest,
  WallSearchWorkerResponse,
} from "./searchWorkerTypes";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WallSearchWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "search-lawful-subcomplex") return;
  let response: WallSearchWorkerResponse;
  try {
    response = {
      type: "search-lawful-subcomplex-success",
      requestId: request.requestId,
      result: searchMaximumLawfulSubcomplex(
        request.barX,
        request.wallSystem,
        request.options,
      ),
    };
  } catch (error) {
    response = {
      type: "search-lawful-subcomplex-failure",
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  scope.postMessage(response);
};
