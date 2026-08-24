import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { JsonlCachedExactConeOracle } from "../src/fibering/node/jsonlCachedExactConeOracle";
import {
  buildExactConeOracleRequest,
  sealExactConeOracleCertificate,
  type AsyncExactConeFeasibilityOracle,
  type ExactConeOracleCertificate,
  type ExactConeOracleRequest,
} from "../src/fibering/scalableHeightCone";

const SOURCE_HASH = "7".repeat(64);
const TRANSCRIPT_HASH = "8".repeat(64);

function fixtureRequest(): ExactConeOracleRequest {
  return buildExactConeOracleRequest({
    sourceHash: SOURCE_HASH,
    rank: 1,
    assignments: [],
  });
}

function fixtureCertificate(
  request: ExactConeOracleRequest,
): ExactConeOracleCertificate {
  return sealExactConeOracleCertificate({
    schemaVersion: 1,
    kind: "external-exact-height-cone-certificate",
    requestHash: request.requestHash,
    backend: {
      id: "jsonl-cache-test-oracle",
      version: "1",
      algorithm: "fixture",
      transcriptSha256: TRANSCRIPT_HASH,
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

function recordingDelegate(
  calls: ExactConeOracleRequest[],
): AsyncExactConeFeasibilityOracle {
  return {
    async solve(request) {
      calls.push(request);
      return fixtureCertificate(request);
    },
  };
}

function failingDelegate(calls: ExactConeOracleRequest[]) {
  return {
    async solve(request: ExactConeOracleRequest): Promise<never> {
      calls.push(request);
      throw new Error("The cache unexpectedly called its delegate.");
    },
  } satisfies AsyncExactConeFeasibilityOracle;
}

async function withCachePath(
  run: (cachePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "coxeter-cone-cache-test-"));
  try {
    await run(join(directory, "oracle-certificates.jsonl"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function seedCache(
  cachePath: string,
  request: ExactConeOracleRequest,
): Promise<ExactConeOracleCertificate> {
  const calls: ExactConeOracleRequest[] = [];
  const cache = new JsonlCachedExactConeOracle({
    path: cachePath,
    delegate: recordingDelegate(calls),
  });
  try {
    const certificate = await cache.solve(request);
    expect(calls).toHaveLength(1);
    return certificate;
  } finally {
    await cache.close();
  }
}

interface JsonlCacheRecord {
  requestHash: string;
  certificate: ExactConeOracleCertificate;
}

function parseOnlyRecord(contents: string): JsonlCacheRecord {
  const records = contents.trimEnd().split("\n");
  expect(records).toHaveLength(1);
  return JSON.parse(records[0]) as JsonlCacheRecord;
}

describe("JSONL-cached exact cone oracle", () => {
  it("exactly revalidates a cached primitive witness before calling the delegate", async () => {
    await withCachePath(async (cachePath) => {
      const first = buildExactConeOracleRequest({
        sourceHash: SOURCE_HASH,
        rank: 2,
        assignments: [{ normal: [1, 0], sign: 1 }],
      });
      const second = buildExactConeOracleRequest({
        sourceHash: SOURCE_HASH,
        rank: 2,
        assignments: [
          { normal: [1, 0], sign: 1 },
          { normal: [1, 1], sign: 1 },
        ],
      });
      const calls: ExactConeOracleRequest[] = [];
      const cache = new JsonlCachedExactConeOracle({
        path: cachePath,
        delegate: {
          async solve(request) {
            calls.push(request);
            return sealExactConeOracleCertificate({
              schemaVersion: 1,
              kind: "external-exact-height-cone-certificate",
              requestHash: request.requestHash,
              backend: {
                id: "warm-witness-fixture",
                version: "1",
                algorithm: "fixture",
                transcriptSha256: TRANSCRIPT_HASH,
              },
              result: {
                kind: "feasible",
                equalityRank: 0,
                dimension: 2,
                primitiveWitness: ["1", "0"],
              },
              certificateHash: "",
            });
          },
        },
      });
      try {
        await cache.solve(first);
        const reused = await cache.solve(second);
        expect(reused).toMatchObject({
          backend: { id: "local-exact-witness-revalidation" },
          result: { kind: "feasible", primitiveWitness: ["1", "0"] },
        });
        expect(calls.map((request) => request.requestHash)).toEqual([
          first.requestHash,
        ]);
        expect(cache.stats()).toMatchObject({ exactWitnessReuses: 1 });
      } finally {
        await cache.close();
      }
    });
  });

  it("serves a repeated request without calling the delegate twice", async () => {
    await withCachePath(async (cachePath) => {
      const request = fixtureRequest();
      const calls: ExactConeOracleRequest[] = [];
      const cache = new JsonlCachedExactConeOracle({
        path: cachePath,
        delegate: recordingDelegate(calls),
      });
      try {
        const first = await cache.solve(request);
        const second = await cache.solve(request);
        expect(second).toEqual(first);
        expect(calls.map((call) => call.requestHash)).toEqual([
          request.requestHash,
        ]);
      } finally {
        await cache.close();
      }
    });
  });

  it("appends a certificate and reuses it after reopening the cache", async () => {
    await withCachePath(async (cachePath) => {
      const request = fixtureRequest();
      const expected = await seedCache(cachePath, request);
      const calls: ExactConeOracleRequest[] = [];
      const reopened = new JsonlCachedExactConeOracle({
        path: cachePath,
        delegate: failingDelegate(calls),
      });
      try {
        await expect(reopened.solve(request)).resolves.toEqual(expected);
        expect(calls).toHaveLength(0);
      } finally {
        await reopened.close();
      }
    });
  });

  it("discards a JSON-truncated final record while retaining earlier entries", async () => {
    await withCachePath(async (cachePath) => {
      const request = fixtureRequest();
      const expected = await seedCache(cachePath, request);
      const completeContents = await readFile(cachePath, "utf8");
      await appendFile(cachePath, '{"requestHash":"interrupted', "utf8");

      const calls: ExactConeOracleRequest[] = [];
      const reopened = new JsonlCachedExactConeOracle({
        path: cachePath,
        delegate: failingDelegate(calls),
      });
      try {
        await expect(reopened.solve(request)).resolves.toEqual(expected);
        expect(calls).toHaveLength(0);
      } finally {
        await reopened.close();
      }
      expect(await readFile(cachePath, "utf8")).toBe(completeContents);
    });
  });

  it("rejects a malformed record before the final line", async () => {
    await withCachePath(async (cachePath) => {
      const request = fixtureRequest();
      await seedCache(cachePath, request);
      const completeContents = await readFile(cachePath, "utf8");
      await writeFile(
        cachePath,
        `${completeContents}{"requestHash":\n${completeContents}`,
        "utf8",
      );

      const cache = new JsonlCachedExactConeOracle({
        path: cachePath,
        delegate: recordingDelegate([]),
      });
      try {
        await expect(cache.solve(request)).rejects.toThrow();
      } finally {
        await cache.close().catch(() => undefined);
      }
    });
  });

  it.each([
    {
      label: "record/request binding",
      corrupt(record: JsonlCacheRecord) {
        record.requestHash = "9".repeat(64);
      },
    },
    {
      label: "certificate hash",
      corrupt(record: JsonlCacheRecord) {
        record.certificate.certificateHash = "a".repeat(64);
      },
    },
  ])("rejects an invalid $label on load", async ({ corrupt }) => {
    await withCachePath(async (cachePath) => {
      const request = fixtureRequest();
      await seedCache(cachePath, request);
      const record = parseOnlyRecord(await readFile(cachePath, "utf8"));
      corrupt(record);
      await writeFile(cachePath, `${JSON.stringify(record)}\n`, "utf8");

      const cache = new JsonlCachedExactConeOracle({
        path: cachePath,
        delegate: recordingDelegate([]),
      });
      try {
        await expect(cache.solve(request)).rejects.toThrow();
      } finally {
        await cache.close().catch(() => undefined);
      }
    });
  });
});
