import { describe, expect, it } from "vitest";

import {
  canonicalSha256,
  canonicalizeJson,
  sha256Hex,
  sha256HexPortable,
  canonicalJsonSha256,
  canonicalSha256WithRows,
  createPortableSha256Stream,
} from "../src/utils/canonicalSha256";

describe("SHA-256", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
  ])("matches the standard vector for %j", (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
    expect(sha256HexPortable(input)).toBe(expected);
  });

  it("portable fallback agrees with the native digest across block boundaries", () => {
    for (const length of [
      0, 1, 55, 56, 63, 64, 65, 119, 120, 128, 1000, 4097,
    ]) {
      const text = Array.from({ length }, (_unused, index) =>
        String.fromCharCode(32 + ((index * 7919) % 95)),
      ).join("");
      expect(sha256HexPortable(text)).toBe(sha256Hex(text));
    }
    expect(sha256HexPortable("π ∑ multi-byte ✓")).toBe(
      sha256Hex("π ∑ multi-byte ✓"),
    );
  });
});

describe("canonical certificate hashing", () => {
  it("sorts record keys recursively while preserving array order", () => {
    const first = {
      z: [{ beta: 2, alpha: 1 }, true],
      a: "certificate",
    };
    const reordered = {
      a: "certificate",
      z: [{ alpha: 1, beta: 2 }, true],
    };

    expect(canonicalizeJson(first)).toBe(
      '{"a":"certificate","z":[{"alpha":1,"beta":2},true]}',
    );
    expect(canonicalSha256(first)).toBe(canonicalSha256(reordered));
  });

  it("matches a published digest for a canonical JSON object", () => {
    expect(canonicalSha256({ b: 2, a: 1 })).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
  });

  it.each([
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["NaN", Number.NaN],
    ["undefined", undefined],
    ["a function", () => 1],
    ["nested undefined", { omittedByJson: undefined }],
  ])("rejects %s", (_name, value) => {
    expect(() => canonicalSha256(value)).toThrow(TypeError);
  });

  it("rejects cycles without rejecting repeated acyclic values", () => {
    const shared = { exact: true };
    expect(() => canonicalSha256([shared, shared])).not.toThrow();

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalSha256(cyclic)).toThrow(/cycle/);
  });

  it("rejects sparse arrays and non-JSON object instances", () => {
    const sparse = new Array<unknown>(2);
    sparse[1] = "present";

    expect(() => canonicalSha256(sparse)).toThrow(/dense array/);
    expect(() => canonicalSha256(new Date(0))).toThrow(/plain object/);
  });
});

describe("canonical hashing of JSON-normalized data", () => {
  class Box {
    hidden = undefined;
    constructor(
      public readonly size: number,
      public readonly tags: string[],
    ) {}
    method() {
      return 1;
    }
  }
  const samples: unknown[] = [
    { b: 2, a: [1, undefined, () => 1, Number.NaN, -0, 1e21], c: undefined },
    new Box(3, ["x", "y"]),
    {
      when: new Date(0),
      typed: Uint32Array.from([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    },
    {
      map: new Map([["k", 1]]),
      set: new Set([1]),
      nested: [{ z: null, y: [[]] }],
    },
    [Number.POSITIVE_INFINITY, "π ✓ \u2028", true, false, null],
    { __proto__key: 1, "": "empty", "10": 1, "9": 2, a10: 3, a9: 4 },
    // eslint-disable-next-line no-sparse-arrays
    [1, , 3],
    { boxed: [Object(1), Object("s"), Object(false)] },
  ];

  it.each(samples.map((sample, index) => [index, sample]))(
    "matches canonicalSha256 of a JSON round trip (sample %i)",
    (_index, sample) => {
      expect(canonicalJsonSha256(sample)).toBe(
        canonicalSha256(JSON.parse(JSON.stringify(sample))),
      );
    },
  );

  it("rejects cycles like JSON.stringify", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJsonSha256(cyclic)).toThrow(TypeError);
  });
});

describe("streaming canonical digests", () => {
  it("canonicalSha256WithRows equals canonicalSha256 for plain and packed rows", () => {
    const rows = [0, 1, 2].map((generator) =>
      Array.from(
        { length: 20_000 },
        (_unused, point) => (point * (generator + 3) + 1) % 20_000,
      ),
    );
    const record = {
      schemaVersion: 1,
      index: 20_000,
      zeta: { nested: [1, 2] },
    };
    const expected = canonicalSha256({ ...record, generatorImages: rows });
    expect(canonicalSha256WithRows(record, "generatorImages", rows)).toBe(
      expected,
    );
    expect(
      canonicalSha256WithRows(
        record,
        "generatorImages",
        rows.map((row) => Uint32Array.from(row)),
      ),
    ).toBe(expected);
    expect(canonicalSha256WithRows({}, "rows", [])).toBe(
      canonicalSha256({ rows: [] }),
    );
  });

  it("portable incremental hashing matches one-shot hashing across splits", () => {
    const text =
      Array.from({ length: 3000 }, (_unused, index) =>
        String.fromCharCode(33 + (index % 90)),
      ).join("") + "✓π";
    for (const split of [1, 7, 63, 64, 65, 1000]) {
      const stream = createPortableSha256Stream();
      for (let start = 0; start < text.length; start += split)
        stream.update(text.slice(start, start + split));
      expect(stream.digestHex()).toBe(sha256Hex(text));
    }
  });
});
