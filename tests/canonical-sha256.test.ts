import { describe, expect, it } from "vitest";

import {
  canonicalSha256,
  canonicalizeJson,
  sha256Hex,
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
