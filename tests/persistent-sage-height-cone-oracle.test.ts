import { describe, expect, it } from "vitest";

import { PersistentSageHeightConeOracle } from "../src/fibering/node/persistentSageHeightConeOracle";
import {
  buildExactConeOracleRequest,
  sealExactConeOracleCertificate,
} from "../src/fibering/scalableHeightCone";

const FAKE_JSONL_SERVER = String.raw`
const readline = require("node:readline");
const certificate = JSON.parse(process.env.FIXTURE_CERTIFICATE);
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const request = JSON.parse(line);
  process.stdout.write(JSON.stringify({
    ok: true,
    requestHash: request.requestHash,
    certificate,
    cacheSize: 1,
  }) + "\n");
});
`;

describe("persistent Sage height-cone process adapter", () => {
  it("replays a JSONL response before resolving the query", async () => {
    const request = buildExactConeOracleRequest({
      sourceHash: "3".repeat(64),
      rank: 1,
      assignments: [],
    });
    const certificate = sealExactConeOracleCertificate({
      schemaVersion: 1,
      kind: "external-exact-height-cone-certificate",
      requestHash: request.requestHash,
      backend: {
        id: "fixture-jsonl-server",
        version: "1",
        algorithm: "fixture",
        transcriptSha256: "4".repeat(64),
      },
      result: {
        kind: "feasible",
        equalityRank: 0,
        dimension: 1,
        primitiveWitness: ["1"],
      },
      certificateHash: "",
    });
    const oracle = new PersistentSageHeightConeOracle({
      command: process.execPath,
      args: ["-e", FAKE_JSONL_SERVER],
      env: {
        ...process.env,
        FIXTURE_CERTIFICATE: JSON.stringify(certificate),
      },
      queryTimeoutMs: 5_000,
    });

    await expect(oracle.solve(request)).resolves.toEqual(certificate);
    expect(oracle.stats()).toMatchObject({
      submitted: 1,
      completed: 1,
      pending: 0,
      backendCacheSize: 1,
    });
    await oracle.close();
  });

  it.runIf(process.env.RUN_SAGE_HEIGHT_CONE === "1")(
    "accepts feasible and Farkas certificates from a resident Sage/PPL worker",
    async () => {
      const executable = process.platform === "win32" ? "wsl" : "sage";
      const args =
        process.platform === "win32"
          ? [
              "/opt/miniforge3/envs/sage/bin/python",
              "scripts/sage_exact_height_cone.py",
              "--server",
              "--solver",
              "reduced-auto",
            ]
          : [
              "-python",
              "scripts/sage_exact_height_cone.py",
              "--server",
              "--solver",
              "reduced-auto",
            ];
      const oracle = new PersistentSageHeightConeOracle({
        command: executable,
        args,
        cwd: process.cwd(),
        queryTimeoutMs: 30_000,
      });
      try {
        const feasibleRequest = buildExactConeOracleRequest({
          sourceHash: "5".repeat(64),
          rank: 19,
          assignments: [{ normal: [1, ...Array(18).fill(0)], sign: 1 }],
        });
        await expect(oracle.solve(feasibleRequest)).resolves.toMatchObject({
          result: { kind: "feasible", dimension: 19 },
        });

        const first = [1, ...Array(18).fill(0)];
        const second = [0, 1, ...Array(17).fill(0)];
        const sum = [1, 1, ...Array(17).fill(0)];
        const infeasibleRequest = buildExactConeOracleRequest({
          sourceHash: "5".repeat(64),
          rank: 19,
          assignments: [
            { normal: first, sign: 1 },
            { normal: second, sign: 1 },
            { normal: sum, sign: -1 },
          ],
        });
        await expect(oracle.solve(infeasibleRequest)).resolves.toMatchObject({
          result: { kind: "infeasible" },
        });

        // Modulo x0-x1=0, the first two strict rows are the same oriented
        // ray; reversing the second one instead gives an exact Farkas pair.
        const collapsedRay = buildExactConeOracleRequest({
          sourceHash: "5".repeat(64),
          rank: 2,
          assignments: [
            { normal: [1, -1], sign: 0 },
            { normal: [1, 0], sign: 1 },
            { normal: [0, 1], sign: 1 },
          ],
        });
        await expect(oracle.solve(collapsedRay)).resolves.toMatchObject({
          result: { kind: "feasible", equalityRank: 1, dimension: 1 },
        });
        const opposingRay = buildExactConeOracleRequest({
          sourceHash: "5".repeat(64),
          rank: 2,
          assignments: [
            { normal: [1, -1], sign: 0 },
            { normal: [1, 0], sign: 1 },
            { normal: [0, 1], sign: -1 },
          ],
        });
        await expect(oracle.solve(opposingRay)).resolves.toMatchObject({
          result: { kind: "infeasible" },
        });

        // Witness hints are shared by the resident worker. A rank-two hint
        // must not be accepted for this rank-one request merely because a
        // truncated dot product is positive.
        const shorterRank = buildExactConeOracleRequest({
          sourceHash: "5".repeat(64),
          rank: 1,
          assignments: [{ normal: [1], sign: 1 }],
        });
        await expect(oracle.solve(shorterRank)).resolves.toMatchObject({
          result: {
            kind: "feasible",
            dimension: 1,
            primitiveWitness: ["1"],
          },
        });
        expect(oracle.stats()).toMatchObject({
          submitted: 5,
          completed: 5,
          pending: 0,
          backendCacheSize: 5,
        });
      } finally {
        await oracle.close();
      }
    },
    40_000,
  );
});
