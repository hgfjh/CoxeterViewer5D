import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

import { canonicalSha256 } from "../../utils/canonicalSha256";
import {
  buildExactConeOracleRequest,
  replayExactConeOracleCertificate,
  type AsyncExactConeFeasibilityOracle,
  type ExactConeOracleCertificate,
  type ExactConeOracleRequest,
} from "../scalableHeightCone";

export interface ExactConeRequestCapture {
  schemaVersion: 1;
  kind: "exact-height-cone-request-capture";
  status: "pending" | "completed" | "failed";
  request: ExactConeOracleRequest;
  capturedAt: string;
  elapsedMilliseconds: number | null;
  error: { name: string; message: string } | null;
  certificateHash: string | null;
  captureDigest: string;
}

export function sealExactConeRequestCapture(
  capture: Omit<ExactConeRequestCapture, "captureDigest">,
): ExactConeRequestCapture {
  const withoutDigest = { ...structuredClone(capture), captureDigest: "" };
  return { ...capture, captureDigest: canonicalSha256(withoutDigest) };
}

export function replayExactConeRequestCapture(value: unknown): {
  passed: boolean;
  errors: string[];
  capture?: ExactConeRequestCapture;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      passed: false,
      errors: ["The cone-request capture is not an object."],
    };
  }
  const capture = value as ExactConeRequestCapture;
  const errors: string[] = [];
  if (
    capture.schemaVersion !== 1 ||
    capture.kind !== "exact-height-cone-request-capture" ||
    (capture.status !== "pending" &&
      capture.status !== "completed" &&
      capture.status !== "failed")
  ) {
    errors.push("The cone-request capture has an invalid envelope.");
  }
  try {
    const rebuilt = buildExactConeOracleRequest({
      sourceHash: capture.request.sourceHash,
      rank: capture.request.rank,
      assignments: capture.request.assignments,
    });
    if (canonicalSha256(rebuilt) !== canonicalSha256(capture.request)) {
      errors.push("The captured exact cone request is not canonical.");
    }
  } catch {
    errors.push("The captured exact cone request is malformed.");
  }
  if (
    typeof capture.capturedAt !== "string" ||
    Number.isNaN(Date.parse(capture.capturedAt)) ||
    (capture.elapsedMilliseconds !== null &&
      (!Number.isFinite(capture.elapsedMilliseconds) ||
        capture.elapsedMilliseconds < 0)) ||
    (capture.certificateHash !== null &&
      !/^[0-9a-f]{64}$/.test(capture.certificateHash)) ||
    (capture.error !== null &&
      (typeof capture.error.name !== "string" ||
        typeof capture.error.message !== "string"))
  ) {
    errors.push("The cone-request capture metadata is invalid.");
  }
  if (
    (capture.status === "pending" &&
      (capture.elapsedMilliseconds !== null ||
        capture.error !== null ||
        capture.certificateHash !== null)) ||
    (capture.status === "completed" &&
      (capture.elapsedMilliseconds === null ||
        capture.error !== null ||
        capture.certificateHash === null)) ||
    (capture.status === "failed" &&
      (capture.elapsedMilliseconds === null ||
        capture.error === null ||
        capture.certificateHash !== null))
  ) {
    errors.push("The cone-request capture status fields disagree.");
  }
  if (
    typeof capture.captureDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(capture.captureDigest) ||
    capture.captureDigest !== canonicalSha256({ ...capture, captureDigest: "" })
  ) {
    errors.push("The cone-request capture digest is invalid.");
  }
  return errors.length === 0
    ? { passed: true, errors: [], capture }
    : { passed: false, errors: [...new Set(errors)].sort() };
}

export interface CapturedExactConeOracleOptions {
  path: string;
  delegate: AsyncExactConeFeasibilityOracle;
}

/**
 * Persist the complete current cache-miss request before calling an external
 * solver. A timeout therefore leaves a sealed, independently replayable input
 * for one-shot benchmarking; the file is operational provenance, not proof.
 */
export class CapturedExactConeOracle implements AsyncExactConeFeasibilityOracle {
  private readonly path: string;
  private readonly delegate: AsyncExactConeFeasibilityOracle;
  private serial = 0;

  constructor(options: CapturedExactConeOracleOptions) {
    if (options.path.length === 0) {
      throw new Error("The exact cone request-capture path is required.");
    }
    this.path = options.path;
    this.delegate = options.delegate;
  }

  async solve(
    request: ExactConeOracleRequest,
  ): Promise<ExactConeOracleCertificate> {
    const started = performance.now();
    const capturedAt = new Date().toISOString();
    await this.write(
      sealExactConeRequestCapture({
        schemaVersion: 1,
        kind: "exact-height-cone-request-capture",
        status: "pending",
        request: structuredClone(request),
        capturedAt,
        elapsedMilliseconds: null,
        error: null,
        certificateHash: null,
      }),
    );
    try {
      const certificate = await this.delegate.solve(request);
      const replay = replayExactConeOracleCertificate(request, certificate);
      if (!replay.passed) {
        throw new Error(
          `The captured cone delegate returned an invalid certificate: ${replay.errors.join(" ")}`,
        );
      }
      await this.write(
        sealExactConeRequestCapture({
          schemaVersion: 1,
          kind: "exact-height-cone-request-capture",
          status: "completed",
          request: structuredClone(request),
          capturedAt,
          elapsedMilliseconds: performance.now() - started,
          error: null,
          certificateHash: certificate.certificateHash,
        }),
      );
      return certificate;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      await this.write(
        sealExactConeRequestCapture({
          schemaVersion: 1,
          kind: "exact-height-cone-request-capture",
          status: "failed",
          request: structuredClone(request),
          capturedAt,
          elapsedMilliseconds: performance.now() - started,
          error: { name: failure.name, message: failure.message },
          certificateHash: null,
        }),
      );
      throw failure;
    }
  }

  private async write(capture: ExactConeRequestCapture): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${this.serial++}.tmp`;
    await writeFile(temporary, `${JSON.stringify(capture, null, 2)}\n`, "utf8");
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temporary, this.path);
        return;
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : "";
        // OneDrive and virus scanners can briefly hold the old destination on
        // Windows. Retrying the same atomic replacement preserves the sealed
        // pending/completed/failed semantics without deleting the old file.
        if (
          attempt >= 20 ||
          (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY")
        ) {
          throw error;
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(10 * 2 ** attempt, 250)),
        );
      }
    }
  }
}
