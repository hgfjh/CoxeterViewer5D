import { createReadStream } from "node:fs";
import { mkdir, open, stat, truncate, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";
import { TextDecoder } from "node:util";

import {
  certifyExactConeRequestWithPrimitiveWitness,
  computeExactConeOracleCertificateHash,
  replayExactConeOracleCertificate,
  type AsyncExactConeFeasibilityOracle,
  type ExactConeOracleCertificate,
  type ExactConeOracleRequest,
} from "../scalableHeightCone";

const CACHE_RECORD_KIND = "exact-height-cone-oracle-cache-entry";
const DEFAULT_MAX_RECORD_BYTES = 128 * 1024 * 1024;
const DEFAULT_FSYNC_EVERY_RECORDS = 128;
// Adjacent DFS cones often reuse the same witness. A short LRU captures that
// locality without turning an unsuccessful precheck into its own bottleneck.
const MAX_EXACT_WITNESS_HINTS = 64;

export interface ExactConeOracleJsonlCacheRecord {
  schemaVersion: 1;
  kind: typeof CACHE_RECORD_KIND;
  requestHash: string;
  certificate: ExactConeOracleCertificate;
}

export interface JsonlCachedExactConeOracleOptions {
  path: string;
  delegate: AsyncExactConeFeasibilityOracle;
  /** Bounds one JSONL record, rather than the append-only cache as a whole. */
  maxRecordBytes?: number;
  /** Set to zero to rely on close/process-exit flushing. */
  fsyncEveryRecords?: number;
}

export interface JsonlCachedExactConeOracleStats {
  cacheEntries: number;
  loadedRecords: number;
  cacheHits: number;
  cacheMisses: number;
  coalescedQueries: number;
  delegateQueries: number;
  exactWitnessReuses: number;
  appendedRecords: number;
  pendingQueries: number;
  ignoredTruncatedTailBytes: number;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function nonnegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRecord(
  line: Uint8Array,
  lineNumber: number,
): ExactConeOracleJsonlCacheRecord {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(line);
  } catch (error) {
    throw new Error(
      `Exact-cone cache line ${lineNumber} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (decoded.endsWith("\r")) decoded = decoded.slice(0, -1);
  if (decoded.length === 0) {
    throw new Error(`Exact-cone cache line ${lineNumber} is empty.`);
  }

  let value: unknown;
  try {
    value = JSON.parse(decoded) as unknown;
  } catch (error) {
    throw new Error(
      `Exact-cone cache line ${lineNumber} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    value.kind !== CACHE_RECORD_KIND ||
    typeof value.requestHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.requestHash) ||
    !isObject(value.certificate)
  ) {
    throw new Error(
      `Exact-cone cache line ${lineNumber} has an invalid record envelope.`,
    );
  }

  const certificate =
    value.certificate as unknown as ExactConeOracleCertificate;
  if (
    certificate.schemaVersion !== 1 ||
    certificate.kind !== "external-exact-height-cone-certificate" ||
    certificate.requestHash !== value.requestHash ||
    typeof certificate.certificateHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(certificate.certificateHash)
  ) {
    throw new Error(
      `Exact-cone cache line ${lineNumber} has an invalid certificate envelope.`,
    );
  }
  let computedHash: string;
  try {
    computedHash = computeExactConeOracleCertificateHash(certificate);
  } catch (error) {
    throw new Error(
      `Exact-cone cache line ${lineNumber} has a malformed certificate: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (certificate.certificateHash !== computedHash) {
    throw new Error(
      `Exact-cone cache line ${lineNumber} has an invalid certificate hash.`,
    );
  }
  return {
    schemaVersion: 1,
    kind: CACHE_RECORD_KIND,
    requestHash: value.requestHash,
    certificate,
  };
}

function replayOrThrow(
  request: ExactConeOracleRequest,
  certificate: ExactConeOracleCertificate,
  source: "delegate" | "cache",
): void {
  const replay = replayExactConeOracleCertificate(request, certificate);
  if (!replay.passed) {
    throw new Error(
      `The exact-cone ${source} certificate failed replay: ${replay.errors.join(" ")}`,
    );
  }
}

/**
 * An append-only checkpoint around an asynchronous exact cone oracle.
 *
 * The JSONL file is a performance cache, not an additional proof assumption:
 * each delegate answer is replayed before it is written, and every cache hit is
 * replayed against the caller's complete canonical request. A process killed
 * during one append may leave one truncated final line; reopening discards only
 * that unterminated suffix. The cache is intentionally single-writer.
 */
export class JsonlCachedExactConeOracle implements AsyncExactConeFeasibilityOracle {
  private readonly path: string;
  private readonly delegate: AsyncExactConeFeasibilityOracle;
  private readonly maxRecordBytes: number;
  private readonly fsyncEveryRecords: number;
  private readonly certificates = new Map<string, ExactConeOracleCertificate>();
  private readonly inFlight = new Map<
    string,
    Promise<ExactConeOracleCertificate>
  >();
  private readonly witnessHints = new Map<string, string[]>();
  private loadPromise: Promise<void> | undefined;
  private appendTail: Promise<void> = Promise.resolve();
  private fileHandle: FileHandle | undefined;
  private appendPrefix = "";
  private unsyncedRecords = 0;
  private closing = false;
  private closed = false;
  private loadedRecords = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private coalescedQueries = 0;
  private delegateQueries = 0;
  private exactWitnessReuses = 0;
  private appendedRecords = 0;
  private ignoredTruncatedTailBytes = 0;

  constructor(options: JsonlCachedExactConeOracleOptions) {
    if (options.path.length === 0) {
      throw new Error("The exact-cone JSONL cache path is required.");
    }
    this.path = options.path;
    this.delegate = options.delegate;
    this.maxRecordBytes = positiveInteger(
      options.maxRecordBytes ?? DEFAULT_MAX_RECORD_BYTES,
      "maxRecordBytes",
    );
    this.fsyncEveryRecords = nonnegativeInteger(
      options.fsyncEveryRecords ?? DEFAULT_FSYNC_EVERY_RECORDS,
      "fsyncEveryRecords",
    );
  }

  solve(request: ExactConeOracleRequest): Promise<ExactConeOracleCertificate> {
    if (this.closing || this.closed) {
      return Promise.reject(
        new Error("The exact-cone JSONL cache is closing or closed."),
      );
    }
    return this.solveAfterLoad(request);
  }

  stats(): JsonlCachedExactConeOracleStats {
    return {
      cacheEntries: this.certificates.size,
      loadedRecords: this.loadedRecords,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      coalescedQueries: this.coalescedQueries,
      delegateQueries: this.delegateQueries,
      exactWitnessReuses: this.exactWitnessReuses,
      appendedRecords: this.appendedRecords,
      pendingQueries: this.inFlight.size,
      ignoredTruncatedTailBytes: this.ignoredTruncatedTailBytes,
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closing = true;
    await this.ensureLoaded();
    await Promise.allSettled([...this.inFlight.values()]);
    await this.appendTail;
    if (this.fileHandle !== undefined) {
      if (this.unsyncedRecords > 0) await this.fileHandle.sync();
      await this.fileHandle.close();
      this.fileHandle = undefined;
    }
    this.closed = true;
  }

  private async solveAfterLoad(
    request: ExactConeOracleRequest,
  ): Promise<ExactConeOracleCertificate> {
    await this.ensureLoaded();
    const cached = this.certificates.get(request.requestHash);
    if (cached !== undefined) {
      replayOrThrow(request, cached, "cache");
      this.cacheHits += 1;
      return structuredClone(cached);
    }

    const shared = this.inFlight.get(request.requestHash);
    if (shared !== undefined) {
      this.coalescedQueries += 1;
      const certificate = await shared;
      replayOrThrow(request, certificate, "cache");
      return structuredClone(certificate);
    }

    this.cacheMisses += 1;
    const query = this.queryUncached(request);
    this.inFlight.set(request.requestHash, query);
    void query.then(
      () => this.inFlight.delete(request.requestHash),
      () => this.inFlight.delete(request.requestHash),
    );
    return query;
  }

  private async queryUncached(
    request: ExactConeOracleRequest,
  ): Promise<ExactConeOracleCertificate> {
    const witnessHints = [...this.witnessHints.values()].reverse();
    for (const witness of witnessHints) {
      const reused = certifyExactConeRequestWithPrimitiveWitness(
        request,
        witness,
      );
      if (reused === null) continue;
      replayOrThrow(request, reused, "delegate");
      await this.append(request.requestHash, reused);
      this.certificates.set(request.requestHash, structuredClone(reused));
      this.rememberWitness(reused);
      this.exactWitnessReuses += 1;
      return reused;
    }
    this.delegateQueries += 1;
    const certificate = await this.delegate.solve(request);
    replayOrThrow(request, certificate, "delegate");
    await this.append(request.requestHash, certificate);
    this.certificates.set(request.requestHash, structuredClone(certificate));
    this.rememberWitness(certificate);
    return certificate;
  }

  private ensureLoaded(): Promise<void> {
    this.loadPromise ??= this.load();
    return this.loadPromise;
  }

  private async load(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    let size = 0;
    try {
      const metadata = await stat(this.path);
      if (!metadata.isFile()) {
        throw new Error(`${this.path} is not a regular file.`);
      }
      size = metadata.size;
    } catch (error) {
      if (!isObject(error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }

    if (size > 0) await this.loadExisting(size);
    this.fileHandle = await open(this.path, "a");
  }

  private async loadExisting(size: number): Promise<void> {
    const stream = createReadStream(this.path, { start: 0, end: size - 1 });
    let carry = Buffer.alloc(0);
    let completeBytes = 0;
    let lineNumber = 0;

    for await (const rawChunk of stream) {
      const chunk = Buffer.isBuffer(rawChunk)
        ? rawChunk
        : Buffer.from(rawChunk as Uint8Array);
      const data = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);
      let start = 0;
      for (;;) {
        const newline = data.indexOf(0x0a, start);
        if (newline < 0) break;
        const line = data.subarray(start, newline);
        lineNumber += 1;
        if (line.length > this.maxRecordBytes) {
          throw new Error(
            `Exact-cone cache line ${lineNumber} exceeds ${this.maxRecordBytes} bytes.`,
          );
        }
        this.addLoadedRecord(parseRecord(line, lineNumber), lineNumber);
        completeBytes += line.length + 1;
        start = newline + 1;
      }
      carry = Buffer.from(data.subarray(start));
      if (carry.length > this.maxRecordBytes) {
        throw new Error(
          `The final exact-cone cache record exceeds ${this.maxRecordBytes} bytes.`,
        );
      }
    }

    if (carry.length === 0) return;
    try {
      lineNumber += 1;
      this.addLoadedRecord(parseRecord(carry, lineNumber), lineNumber);
      // A complete JSON record need not have its final newline. Preserve it
      // and delimit the next append explicitly.
      this.appendPrefix = "\n";
    } catch (error) {
      // Only an unterminated final JSON parse/UTF-8 failure is recoverable.
      // A complete but structurally invalid record is evidence of corruption.
      const message = error instanceof Error ? error.message : String(error);
      if (
        !message.includes("is not valid JSON") &&
        !message.includes("is not valid UTF-8")
      ) {
        throw error;
      }
      await truncate(this.path, completeBytes);
      this.ignoredTruncatedTailBytes = carry.length;
    }
  }

  private addLoadedRecord(
    record: ExactConeOracleJsonlCacheRecord,
    lineNumber: number,
  ): void {
    const previous = this.certificates.get(record.requestHash);
    if (
      previous !== undefined &&
      previous.certificateHash !== record.certificate.certificateHash
    ) {
      throw new Error(
        `Exact-cone cache line ${lineNumber} conflicts with an earlier certificate for ${record.requestHash}.`,
      );
    }
    this.certificates.set(record.requestHash, record.certificate);
    this.rememberWitness(record.certificate);
    this.loadedRecords += 1;
  }

  private rememberWitness(certificate: ExactConeOracleCertificate): void {
    if (
      certificate.result.kind !== "feasible" ||
      certificate.result.primitiveWitness === null
    ) {
      return;
    }
    const witness = [...certificate.result.primitiveWitness];
    const key = witness.join(",");
    this.witnessHints.delete(key);
    this.witnessHints.set(key, witness);
    while (this.witnessHints.size > MAX_EXACT_WITNESS_HINTS) {
      const oldest = this.witnessHints.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.witnessHints.delete(oldest);
    }
  }

  private append(
    requestHash: string,
    certificate: ExactConeOracleCertificate,
  ): Promise<void> {
    const record: ExactConeOracleJsonlCacheRecord = {
      schemaVersion: 1,
      kind: CACHE_RECORD_KIND,
      requestHash,
      certificate,
    };
    const line = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(line, "utf8") - 1 > this.maxRecordBytes) {
      return Promise.reject(
        new Error(
          `The exact-cone cache record exceeds ${this.maxRecordBytes} bytes.`,
        ),
      );
    }
    this.appendTail = this.appendTail.then(async () => {
      if (this.fileHandle === undefined) {
        throw new Error("The exact-cone JSONL cache file is not open.");
      }
      await this.fileHandle.writeFile(`${this.appendPrefix}${line}`, "utf8");
      this.appendPrefix = "";
      this.appendedRecords += 1;
      this.unsyncedRecords += 1;
      if (
        this.fsyncEveryRecords > 0 &&
        this.unsyncedRecords >= this.fsyncEveryRecords
      ) {
        await this.fileHandle.sync();
        this.unsyncedRecords = 0;
      }
    });
    return this.appendTail;
  }
}
