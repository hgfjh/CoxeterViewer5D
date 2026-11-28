/** Values accepted by the certificate canonicalizer. */
export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

const SHA256_INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
] as const;

const SHA256_ROUND_CONSTANTS = Int32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// ---------------------------------------------------------------- hashing

interface NodeHash {
  update(data: string | Uint8Array, encoding?: "utf8"): NodeHash;
  digest(encoding: "hex"): string;
}
interface NodeCryptoModule {
  createHash(algorithm: "sha256"): NodeHash;
}

/**
 * Node's native SHA-256 (hardware accelerated, ~10x the pure-JS rate) when
 * running under Node; browsers fall back to the portable implementation
 * below.  `process.getBuiltinModule` is synchronous and invisible to the web
 * bundle, so this module stays environment-agnostic.
 */
const nodeCrypto: NodeCryptoModule | undefined = (() => {
  const runtime = globalThis as {
    process?: { getBuiltinModule?: (id: string) => unknown };
  };
  try {
    return runtime.process?.getBuiltinModule?.("node:crypto") as
      | NodeCryptoModule
      | undefined;
  } catch {
    return undefined;
  }
})();

const textEncoder = new TextEncoder();
const scheduleWords = new Int32Array(64);

/** One SHA-256 compression over 64 bytes of `block` starting at `offset`. */
function compressBlock(state: Int32Array, block: Uint8Array, offset: number) {
  const words = scheduleWords;
  for (let index = 0; index < 16; index += 1) {
    const at = offset + index * 4;
    words[index] =
      (block[at] << 24) |
      (block[at + 1] << 16) |
      (block[at + 2] << 8) |
      block[at + 3];
  }
  for (let index = 16; index < 64; index += 1) {
    const previous15 = words[index - 15];
    const previous2 = words[index - 2];
    const sigma0 =
      ((previous15 >>> 7) | (previous15 << 25)) ^
      ((previous15 >>> 18) | (previous15 << 14)) ^
      (previous15 >>> 3);
    const sigma1 =
      ((previous2 >>> 17) | (previous2 << 15)) ^
      ((previous2 >>> 19) | (previous2 << 13)) ^
      (previous2 >>> 10);
    words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) | 0;
  }

  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];
  for (let index = 0; index < 64; index += 1) {
    const bigSigma1 =
      ((e >>> 6) | (e << 26)) ^
      ((e >>> 11) | (e << 21)) ^
      ((e >>> 25) | (e << 7));
    const choose = (e & f) ^ (~e & g);
    const temporary1 =
      (h + bigSigma1 + choose + SHA256_ROUND_CONSTANTS[index] + words[index]) |
      0;
    const bigSigma0 =
      ((a >>> 2) | (a << 30)) ^
      ((a >>> 13) | (a << 19)) ^
      ((a >>> 22) | (a << 10));
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const temporary2 = (bigSigma0 + majority) | 0;

    h = g;
    g = f;
    f = e;
    e = (d + temporary1) | 0;
    d = c;
    c = b;
    b = a;
    a = (temporary1 + temporary2) | 0;
  }

  state[0] = (state[0] + a) | 0;
  state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0;
  state[3] = (state[3] + d) | 0;
  state[4] = (state[4] + e) | 0;
  state[5] = (state[5] + f) | 0;
  state[6] = (state[6] + g) | 0;
  state[7] = (state[7] + h) | 0;
}

function portableSha256(source: Uint8Array): string {
  const state = Int32Array.from(SHA256_INITIAL_STATE);
  const fullBlocks = Math.floor(source.length / 64);
  for (let block = 0; block < fullBlocks; block += 1) {
    compressBlock(state, source, block * 64);
  }
  // Final one or two blocks: remaining bytes, 0x80, zero padding, bit length.
  const remainder = source.length - fullBlocks * 64;
  const tail = new Uint8Array(remainder + 9 > 64 ? 128 : 64);
  tail.set(source.subarray(fullBlocks * 64));
  tail[remainder] = 0x80;
  const bitLength = source.length * 8;
  const view = new DataView(tail.buffer);
  view.setUint32(tail.length - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(tail.length - 4, bitLength >>> 0, false);
  for (let offset = 0; offset < tail.length; offset += 64) {
    compressBlock(state, tail, offset);
  }
  let hex = "";
  for (const word of state) hex += (word >>> 0).toString(16).padStart(8, "0");
  return hex;
}

/** Portable SHA-256 used in browsers; exported so tests can pin it. */
export function sha256HexPortable(input: string): string {
  return portableSha256(textEncoder.encode(input));
}

/** Returns the SHA-256 digest of a UTF-8 string as lowercase hexadecimal. */
export function sha256Hex(input: string): string {
  if (nodeCrypto) {
    return nodeCrypto.createHash("sha256").update(input, "utf8").digest("hex");
  }
  return portableSha256(textEncoder.encode(input));
}

// ---------------------------------------------------------- canonical JSON

/**
 * Location of the value being serialized, kept as segments and formatted only
 * when an error is thrown: building `a.b[3]` strings for every element used to
 * cost as much as the serialization itself.
 */
type PathSegment = string | number;

function describePath(path: readonly PathSegment[]): string {
  if (path.length === 0) return "the root value";
  let text = "";
  for (const segment of path) {
    text +=
      typeof segment === "number"
        ? `[${segment}]`
        : text.length === 0
          ? segment
          : `.${segment}`;
  }
  return text;
}

function assertPlainRecord(
  value: object,
  path: readonly PathSegment[],
): asserts value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      `Canonical JSON requires a plain object at ${describePath(path)}.`,
    );
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(
      `Canonical JSON does not permit symbol keys at ${describePath(path)}.`,
    );
  }
}

function serializeCanonicalValue(
  value: unknown,
  path: PathSegment[],
  activeObjects: WeakSet<object>,
): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(
          `Canonical JSON requires a finite number at ${describePath(path)}.`,
        );
      }
      // Same text as JSON.stringify for finite numbers (including -0 -> "0").
      return `${value}`;
    case "string":
      return JSON.stringify(value);
    case "undefined":
    case "function":
    case "symbol":
    case "bigint":
      throw new TypeError(
        `Canonical JSON does not permit ${typeof value} at ${describePath(path)}.`,
      );
    case "object":
      break;
  }

  if (activeObjects.has(value)) {
    throw new TypeError(
      `Canonical JSON does not permit a cycle at ${describePath(path)}.`,
    );
  }
  activeObjects.add(value);

  try {
    if (Array.isArray(value)) {
      // Dense with no extra enumerable properties: every index is an own
      // property and the enumerable key count equals the length.
      const length = value.length;
      if (Object.keys(value).length !== length) {
        throw new TypeError(
          `Canonical JSON requires a dense array without extra properties at ${describePath(path)}.`,
        );
      }
      let text = "[";
      for (let index = 0; index < length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError(
            `Canonical JSON requires a dense array without extra properties at ${describePath(path)}.`,
          );
        }
        path.push(index);
        // Entries are read as data, as JSON.stringify does; a per-element
        // property-descriptor check cost more than serializing the entry.
        if (index > 0) text += ",";
        text += serializeCanonicalValue(value[index], path, activeObjects);
        path.pop();
      }
      return `${text}]`;
    }

    assertPlainRecord(value, path);
    // Every own string key must be enumerable; comparing counts avoids
    // building a property descriptor per key.
    const keys = Object.keys(value);
    if (Object.getOwnPropertyNames(value).length !== keys.length) {
      const hidden = Object.getOwnPropertyNames(value).find(
        (name) => !Object.prototype.propertyIsEnumerable.call(value, name),
      );
      path.push(hidden ?? "");
      throw new TypeError(
        `Canonical JSON requires enumerable data properties at ${describePath(path)}.`,
      );
    }
    keys.sort();
    let text = "{";
    for (let position = 0; position < keys.length; position += 1) {
      const key = keys[position];
      path.push(key);
      if (position > 0) text += ",";
      text += `${JSON.stringify(key)}:${serializeCanonicalValue(
        value[key],
        path,
        activeObjects,
      )}`;
      path.pop();
    }
    return `${text}}`;
  } finally {
    activeObjects.delete(value);
  }
}

/**
 * Serializes JSON-like certificate data with recursively sorted object keys.
 * Values that ordinary JSON would discard or silently replace are rejected.
 */
export function canonicalizeJson(value: unknown): string {
  return serializeCanonicalValue(value, [], new WeakSet<object>());
}

/**
 * Produces the archival SHA-256 identifier for canonical certificate data.
 * Unlike short in-app fingerprints, this digest is suitable for manifests.
 */
export function canonicalSha256(value: unknown): string {
  return sha256Hex(canonicalizeJson(value));
}

/**
 * canonicalizeJson(JSON.parse(JSON.stringify(value))) in a single pass.
 *
 * Certificate builders hash JSON-normalized copies of rich objects; the
 * stringify / parse / canonicalize round trip walked every value three times.
 * This follows JSON.stringify exactly (toJSON, undefined / functions /
 * symbols dropped from objects and written as null in arrays, non-finite
 * numbers as null, own enumerable string keys of any object) and then emits
 * keys in canonical sorted order.
 */
export function canonicalizeJsonData(value: unknown): string {
  const text = canonicalJsonData(value, "", new WeakSet<object>());
  if (text === undefined) {
    // JSON.parse(JSON.stringify(undefined)) throws as well.
    throw new SyntaxError("Value is not representable as JSON.");
  }
  return text;
}

/** Equals canonicalSha256(JSON.parse(JSON.stringify(value))). */
export function canonicalJsonSha256(value: unknown): string {
  return sha256Hex(canonicalizeJsonData(value));
}

function canonicalJsonData(
  input: unknown,
  key: string,
  active: WeakSet<object>,
): string | undefined {
  let value = input;
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "bigint") &&
    typeof (value as { toJSON?: unknown }).toJSON === "function"
  ) {
    value = (value as { toJSON: (key: string) => unknown }).toJSON(key);
  }
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return Number.isFinite(value) ? `${value}` : "null";
    case "string":
      return JSON.stringify(value);
    case "bigint":
      throw new TypeError("Do not know how to serialize a BigInt");
    case "undefined":
    case "function":
    case "symbol":
      return undefined;
  }
  // Boxed primitives serialize as their primitive value.
  if (
    value instanceof Number ||
    value instanceof String ||
    value instanceof Boolean
  ) {
    return canonicalJsonData(value.valueOf(), key, active);
  }
  const object = value as object;
  if (active.has(object)) {
    throw new TypeError("Converting circular structure to JSON");
  }
  active.add(object);
  try {
    if (Array.isArray(object)) {
      let text = "[";
      for (let index = 0; index < object.length; index += 1) {
        if (index > 0) text += ",";
        text +=
          canonicalJsonData(object[index], String(index), active) ?? "null";
      }
      return `${text}]`;
    }
    const record = object as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    let text = "{";
    let first = true;
    for (const name of keys) {
      const entry = canonicalJsonData(record[name], name, active);
      if (entry === undefined) continue;
      text += `${first ? "" : ","}${JSON.stringify(name)}:${entry}`;
      first = false;
    }
    return `${text}}`;
  } finally {
    active.delete(object);
  }
}

// ------------------------------------------------------- streaming digests

/** Incremental SHA-256 over UTF-8 text pieces. */
export interface Sha256Stream {
  update(text: string): void;
  digestHex(): string;
}

class PortableSha256Stream implements Sha256Stream {
  private readonly state = Int32Array.from(SHA256_INITIAL_STATE);
  private readonly block = new Uint8Array(64);
  private filled = 0;
  private length = 0;

  update(text: string): void {
    const bytes = textEncoder.encode(text);
    this.length += bytes.length;
    let offset = 0;
    if (this.filled > 0) {
      const take = Math.min(64 - this.filled, bytes.length);
      this.block.set(bytes.subarray(0, take), this.filled);
      this.filled += take;
      offset = take;
      if (this.filled < 64) return;
      compressBlock(this.state, this.block, 0);
      this.filled = 0;
    }
    for (; offset + 64 <= bytes.length; offset += 64) {
      compressBlock(this.state, bytes, offset);
    }
    this.block.set(bytes.subarray(offset), 0);
    this.filled = bytes.length - offset;
  }

  digestHex(): string {
    const tail = new Uint8Array(this.filled + 9 > 64 ? 128 : 64);
    tail.set(this.block.subarray(0, this.filled));
    tail[this.filled] = 0x80;
    const bitLength = this.length * 8;
    const view = new DataView(tail.buffer);
    view.setUint32(
      tail.length - 8,
      Math.floor(bitLength / 0x1_0000_0000),
      false,
    );
    view.setUint32(tail.length - 4, bitLength >>> 0, false);
    const state = Int32Array.from(this.state);
    for (let offset = 0; offset < tail.length; offset += 64) {
      compressBlock(state, tail, offset);
    }
    let hex = "";
    for (const word of state) hex += (word >>> 0).toString(16).padStart(8, "0");
    return hex;
  }
}

/** Portable incremental hasher (browsers); exported so tests can pin it. */
export function createPortableSha256Stream(): Sha256Stream {
  return new PortableSha256Stream();
}

export function createSha256Stream(): Sha256Stream {
  if (nodeCrypto) {
    const hash = nodeCrypto.createHash("sha256");
    return {
      update: (text) => {
        hash.update(text, "utf8");
      },
      digestHex: () => hash.digest("hex"),
    };
  }
  return new PortableSha256Stream();
}

/**
 * canonicalSha256(record) where record[rowsKey] holds integer rows, without
 * materializing the canonical string.  For actions with ~10^8 entries the
 * single string would exceed the engine's maximum string length; streaming
 * the same text keeps every existing digest while lifting that ceiling, and
 * accepts packed Uint32Array rows as well as plain arrays.
 */
export function canonicalSha256WithRows(
  record: Record<string, unknown>,
  rowsKey: string,
  rows: readonly ArrayLike<number>[],
): string {
  const stream = createSha256Stream();
  const keys = [...new Set([...Object.keys(record), rowsKey])].sort();
  stream.update("{");
  keys.forEach((key, position) => {
    stream.update(`${position > 0 ? "," : ""}${JSON.stringify(key)}:`);
    if (key !== rowsKey) {
      stream.update(canonicalizeJson(record[key]));
      return;
    }
    stream.update("[");
    rows.forEach((row, rowIndex) => {
      stream.update(rowIndex > 0 ? ",[" : "[");
      const chunk = 16_384;
      for (let start = 0; start < row.length; start += chunk) {
        const end = Math.min(row.length, start + chunk);
        let text = "";
        for (let index = start; index < end; index += 1) {
          const value = row[index];
          if (!Number.isFinite(value)) {
            throw new TypeError(
              `Canonical JSON requires a finite number at ${rowsKey}[${rowIndex}][${index}].`,
            );
          }
          text += index === 0 ? `${value}` : `,${value}`;
        }
        stream.update(text);
      }
      stream.update("]");
    });
    stream.update("]");
  });
  stream.update("}");
  return stream.digestHex();
}
