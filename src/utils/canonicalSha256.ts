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

const SHA256_ROUND_CONSTANTS = [
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
] as const;

function rotateRight(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

function describePath(path: string): string {
  return path.length === 0 ? "the root value" : path;
}

function assertPlainRecord(
  value: object,
  path: string,
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
  path: string,
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
      return JSON.stringify(value);
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
      const enumerableKeys = Object.keys(value);
      const expectedKeys = Array.from({ length: value.length }, (_, index) =>
        String(index),
      );
      if (
        enumerableKeys.length !== expectedKeys.length ||
        enumerableKeys.some((key, index) => key !== expectedKeys[index])
      ) {
        throw new TypeError(
          `Canonical JSON requires a dense array without extra properties at ${describePath(path)}.`,
        );
      }

      const entries = value.map((entry, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (
          descriptor === undefined ||
          "get" in descriptor ||
          "set" in descriptor
        ) {
          throw new TypeError(
            `Canonical JSON does not permit accessor array entries at ${path}[${index}].`,
          );
        }
        return serializeCanonicalValue(
          entry,
          `${path}[${index}]`,
          activeObjects,
        );
      });
      return `[${entries.join(",")}]`;
    }

    assertPlainRecord(value, path);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.getOwnPropertyNames(value).sort();
    const entries = keys.map((key) => {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        "get" in descriptor ||
        "set" in descriptor
      ) {
        throw new TypeError(
          `Canonical JSON requires enumerable data properties at ${describePath(path)}.${key}.`,
        );
      }
      return `${JSON.stringify(key)}:${serializeCanonicalValue(
        descriptor.value,
        path.length === 0 ? key : `${path}.${key}`,
        activeObjects,
      )}`;
    });
    return `{${entries.join(",")}}`;
  } finally {
    activeObjects.delete(value);
  }
}

/**
 * Serializes JSON-like certificate data with recursively sorted object keys.
 * Values that ordinary JSON would discard or silently replace are rejected.
 */
export function canonicalizeJson(value: unknown): string {
  return serializeCanonicalValue(value, "", new WeakSet<object>());
}

/** Returns the SHA-256 digest of a UTF-8 string as lowercase hexadecimal. */
export function sha256Hex(input: string): string {
  const source = new TextEncoder().encode(input);
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const message = new Uint8Array(paddedLength);
  message.set(source);
  message[source.length] = 0x80;

  const bitLength = source.length * 8;
  const highLength = Math.floor(bitLength / 0x1_0000_0000);
  const lowLength = bitLength >>> 0;
  const view = new DataView(message.buffer);
  view.setUint32(paddedLength - 8, highLength, false);
  view.setUint32(paddedLength - 4, lowLength, false);

  const state: number[] = [...SHA256_INITIAL_STATE];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15];
      const previous2 = words[index - 2];
      const sigma0 =
        rotateRight(previous15, 7) ^
        rotateRight(previous15, 18) ^
        (previous15 >>> 3);
      const sigma1 =
        rotateRight(previous2, 17) ^
        rotateRight(previous2, 19) ^
        (previous2 >>> 10);
      words[index] =
        (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const bigSigma1 =
        rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 =
        (h +
          bigSigma1 +
          choose +
          SHA256_ROUND_CONSTANTS[index] +
          words[index]) >>>
        0;
      const bigSigma0 =
        rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (bigSigma0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

/**
 * Produces the archival SHA-256 identifier for canonical certificate data.
 * Unlike short in-app fingerprints, this digest is suitable for manifests.
 */
export function canonicalSha256(value: unknown): string {
  return sha256Hex(canonicalizeJson(value));
}
