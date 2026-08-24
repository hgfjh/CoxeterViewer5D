/// <reference lib="webworker" />

import { searchFullDavisWallCoorientations } from "./fullDavisSearch";
import type {
  FullDavisWorkerRequest,
  FullDavisWorkerResponse,
} from "./fullDavisWorkerTypes";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<FullDavisWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "search-full-davis-fibering") return;
  let response: FullDavisWorkerResponse;
  try {
    response = {
      type: "search-full-davis-fibering-success",
      requestId: request.requestId,
      result: searchFullDavisWallCoorientations({
        quotient: request.quotient,
        options: request.options,
      }),
    };
  } catch (error) {
    response = {
      type: "search-full-davis-fibering-failure",
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  scope.postMessage(response);
};
