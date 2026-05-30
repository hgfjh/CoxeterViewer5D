import type {
  CayleyGenerationOptions,
  CoxeterSystemInput,
  GeneratedCayleyBall,
} from "../types";

/**
 * Persistent generation-worker request. The system may be omitted after the
 * first request for a matching inputHash; the worker keeps that system in its
 * own cache to avoid repeated structured clones.
 */
export interface GenerateBallRequest {
  type: "generate-ball";
  requestId: number;
  cacheKey: string;
  inputHash: string;
  system?: CoxeterSystemInput;
  options: CayleyGenerationOptions;
}

export interface GenerateBallSuccess {
  type: "generate-ball-success";
  requestId: number;
  cacheKey: string;
  inputHash: string;
  ball: GeneratedCayleyBall;
  generationMs: number;
}

export interface GenerateBallFailure {
  type: "generate-ball-failure";
  requestId: number;
  cacheKey: string;
  inputHash: string;
  error: string;
}

export type GenerationWorkerRequest = GenerateBallRequest;
export type GenerationWorkerResponse =
  | GenerateBallSuccess
  | GenerateBallFailure;
