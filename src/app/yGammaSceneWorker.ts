import { buildYGamma2SkeletonScene } from "./yGammaScene";
import type {
  YGammaSceneWorkerRequest,
  YGammaSceneWorkerResponse,
} from "./yGammaSceneWorkerTypes";

self.onmessage = (event: MessageEvent<YGammaSceneWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "build-ygamma-scene") {
    return;
  }

  try {
    const startedAt = performance.now();
    const scene = buildYGamma2SkeletonScene(request.atlas, request.options);
    const response: YGammaSceneWorkerResponse = {
      type: "build-ygamma-scene-success",
      requestId: request.requestId,
      sceneVersion: request.sceneVersion,
      scene,
      buildMs: performance.now() - startedAt,
    };
    self.postMessage(response);
  } catch (error) {
    const response: YGammaSceneWorkerResponse = {
      type: "build-ygamma-scene-failure",
      requestId: request.requestId,
      sceneVersion: request.sceneVersion,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
