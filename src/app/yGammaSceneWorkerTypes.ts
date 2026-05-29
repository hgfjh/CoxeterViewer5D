import type {
  YGamma2SkeletonScene,
  YGamma2SkeletonSceneOptions,
} from "./yGammaScene";
import type { YGammaCellAtlas } from "./yGammaAtlas";

export interface BuildYGammaSceneRequest {
  type: "build-ygamma-scene";
  requestId: number;
  sceneVersion: string;
  atlas: YGammaCellAtlas;
  options: YGamma2SkeletonSceneOptions;
}

export interface BuildYGammaSceneSuccess {
  type: "build-ygamma-scene-success";
  requestId: number;
  sceneVersion: string;
  scene: YGamma2SkeletonScene;
  buildMs: number;
}

export interface BuildYGammaSceneFailure {
  type: "build-ygamma-scene-failure";
  requestId: number;
  sceneVersion: string;
  error: string;
}

export type YGammaSceneWorkerRequest = BuildYGammaSceneRequest;
export type YGammaSceneWorkerResponse =
  | BuildYGammaSceneSuccess
  | BuildYGammaSceneFailure;
