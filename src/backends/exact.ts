import type {
  CayleyBallBackend,
  CayleyGenerationOptions,
  CoxeterSystemInput,
  GeneratedCayleyBall,
} from "../types";
import { parseGeneratedCayleyBall } from "./generatedJson";

export type ExactBackendKind = "sage" | "gap-kbmag";
export type ExactBackendOperation = "generate" | "export" | "import";

export interface ExactBackendUnavailableDetails {
  ok: false;
  code: "exact-backend-not-available";
  backend: ExactBackendKind;
  operation: ExactBackendOperation;
  backendName: string;
  browserAvailable: false;
  requiredRuntime: string;
  message: string;
}

export class ExactBackendUnavailableError extends Error {
  readonly details: ExactBackendUnavailableDetails;

  constructor(details: ExactBackendUnavailableDetails) {
    super(details.message);
    this.name = "ExactBackendUnavailableError";
    this.details = details;
  }
}

export interface ExactBackendAdapter extends CayleyBallBackend {
  kind: ExactBackendKind;
  browserAvailable: false;
  requiredRuntime: string;
  availability(
    operation?: ExactBackendOperation,
  ): ExactBackendUnavailableDetails;
  exportRequest(
    input: CoxeterSystemInput,
    radius: number,
    options?: Omit<CayleyGenerationOptions, "radius">,
  ): Promise<never>;
  importExactOutput(output: unknown): Promise<GeneratedCayleyBall>;
}

function unavailableDetails(
  backend: Pick<
    ExactBackendAdapter,
    "kind" | "name" | "requiredRuntime" | "browserAvailable"
  >,
  operation: ExactBackendOperation,
): ExactBackendUnavailableDetails {
  return {
    ok: false,
    code: "exact-backend-not-available",
    backend: backend.kind,
    operation,
    backendName: backend.name,
    browserAvailable: false,
    requiredRuntime: backend.requiredRuntime,
    message: `${backend.name} cannot ${operation} Cayley balls inside the browser. Run an external ${backend.requiredRuntime} exporter and import validated generated JSON instead.`,
  };
}

function createUnavailableExactBackend(config: {
  kind: ExactBackendKind;
  name: string;
  requiredRuntime: string;
}): ExactBackendAdapter {
  const backend: ExactBackendAdapter = {
    kind: config.kind,
    name: config.name,
    browserAvailable: false,
    requiredRuntime: config.requiredRuntime,
    availability(operation = "generate") {
      return unavailableDetails(this, operation);
    },
    async generate() {
      throw new ExactBackendUnavailableError(this.availability("generate"));
    },
    async exportRequest() {
      throw new ExactBackendUnavailableError(this.availability("export"));
    },
    async importExactOutput(output) {
      return parseGeneratedCayleyBall(output);
    },
  };

  return backend;
}

// Exact enumeration runs outside the browser. The Sage CLI exporter is
// implemented in scripts/, while this adapter keeps the React app honest about
// what it can and cannot do in-process.
export const sageExactBackend = createUnavailableExactBackend({
  kind: "sage",
  name: "sageExportBackend",
  requiredRuntime: "SageMath",
});

export const gapKbmagExactBackend = createUnavailableExactBackend({
  kind: "gap-kbmag",
  name: "gapKbmagExportBackend",
  requiredRuntime: "GAP with KBMAG",
});

export const exactBackendStubs = [sageExactBackend, gapKbmagExactBackend];
