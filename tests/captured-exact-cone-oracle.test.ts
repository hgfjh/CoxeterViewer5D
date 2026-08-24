import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CapturedExactConeOracle,
  replayExactConeRequestCapture,
} from "../src/fibering/node/capturedExactConeOracle";
import {
  buildExactConeOracleRequest,
  sealExactConeOracleCertificate,
  type ExactConeOracleCertificate,
  type ExactConeOracleRequest,
} from "../src/fibering/scalableHeightCone";

function certificate(
  request: ExactConeOracleRequest,
): ExactConeOracleCertificate {
  return sealExactConeOracleCertificate({
    schemaVersion: 1,
    kind: "external-exact-height-cone-certificate",
    requestHash: request.requestHash,
    backend: {
      id: "capture-fixture",
      version: "1",
      algorithm: "fixture",
      transcriptSha256: "b".repeat(64),
    },
    result: {
      kind: "feasible",
      equalityRank: 0,
      dimension: 1,
      primitiveWitness: ["1"],
    },
    certificateHash: "",
  });
}

describe("captured exact cone oracle", () => {
  it("seals pending, completed, and failed cache-miss requests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cone-request-capture-"));
    const path = join(directory, "last-request.json");
    const request = buildExactConeOracleRequest({
      sourceHash: "a".repeat(64),
      rank: 1,
      assignments: [{ normal: [1], sign: 1 }],
    });
    try {
      const success = new CapturedExactConeOracle({
        path,
        delegate: {
          async solve(supplied) {
            const pending = replayExactConeRequestCapture(
              JSON.parse(await readFile(path, "utf8")) as unknown,
            );
            expect(pending).toMatchObject({
              passed: true,
              capture: {
                status: "pending",
                request: { requestHash: request.requestHash },
              },
            });
            return certificate(supplied);
          },
        },
      });
      await expect(success.solve(request)).resolves.toEqual(
        certificate(request),
      );
      const completed = replayExactConeRequestCapture(
        JSON.parse(await readFile(path, "utf8")) as unknown,
      );
      expect(completed).toMatchObject({
        passed: true,
        capture: {
          status: "completed",
          error: null,
          certificateHash: certificate(request).certificateHash,
        },
      });

      const failure = new CapturedExactConeOracle({
        path,
        delegate: {
          async solve() {
            throw new Error("fixture timeout");
          },
        },
      });
      await expect(failure.solve(request)).rejects.toThrow("fixture timeout");
      const failed = replayExactConeRequestCapture(
        JSON.parse(await readFile(path, "utf8")) as unknown,
      );
      expect(failed).toMatchObject({
        passed: true,
        capture: {
          status: "failed",
          error: { name: "Error", message: "fixture timeout" },
          certificateHash: null,
        },
      });

      const tampered = JSON.parse(await readFile(path, "utf8")) as Record<
        string,
        unknown
      >;
      tampered.status = "completed";
      await writeFile(path, JSON.stringify(tampered), "utf8");
      expect(replayExactConeRequestCapture(tampered)).toMatchObject({
        passed: false,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
