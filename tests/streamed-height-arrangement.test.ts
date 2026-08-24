import { describe, expect, it } from "vitest";

import {
  buildExactTernaryHeightConeCover,
  canonicalizeAntipodalSigns,
  canonicalizeHeightNormal,
  certifyHeightCone,
  replayExactTernaryHeightConeCover,
  replayHeightConeCertificate,
  type HeightConeAssignment,
} from "../src/fibering/streamedHeightArrangement";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

function assignment(normal: number[], sign: -1 | 0 | 1): HeightConeAssignment {
  const canonical = canonicalizeHeightNormal(normal);
  if (canonical.zero) throw new Error("test assignment normal is zero");
  return {
    normal: canonical.primitive,
    normalKey: canonical.key,
    sign,
  };
}

describe("exact streamed height arrangement", () => {
  it("canonicalizes primitive normals and antipodal sign vectors", () => {
    expect(canonicalizeHeightNormal([2, -4, 0])).toEqual({
      zero: false,
      primitive: ["1", "-2", "0"],
      multiplier: "2",
      key: "1,-2,0",
    });
    expect(canonicalizeHeightNormal([-2, 4, 0])).toEqual({
      zero: false,
      primitive: ["1", "-2", "0"],
      multiplier: "-2",
      key: "1,-2,0",
    });
    expect(canonicalizeHeightNormal([0, 0])).toMatchObject({
      zero: true,
      multiplier: "0",
    });
    expect(canonicalizeAntipodalSigns([0, -1, 1])).toEqual({
      signs: [0, 1, -1],
      reversed: true,
      selfAntipodal: false,
      key: "0,1,-1",
    });
    expect(canonicalizeAntipodalSigns([0, 0])).toMatchObject({
      signs: [0, 0],
      selfAntipodal: true,
    });
  });

  it("certifies strict, lower-dimensional, zero, and infeasible cones exactly", () => {
    const ray = [assignment([1, 0], 0), assignment([0, 1], 1)];
    const rayCertificate = certifyHeightCone(2, ray);
    expect(rayCertificate).toMatchObject({
      kind: "feasible",
      dimension: 1,
      primitiveWitness: ["0", "1"],
    });
    expect(replayHeightConeCertificate(2, ray, rayCertificate)).toEqual({
      passed: true,
      errors: [],
    });

    const zeroCone = [assignment([1, 0], 0), assignment([0, 1], 0)];
    expect(certifyHeightCone(2, zeroCone)).toMatchObject({
      kind: "feasible",
      dimension: 0,
      primitiveWitness: null,
    });

    const impossible = [
      assignment([1, 0], 1),
      assignment([1, 1], -1),
      assignment([0, 1], 1),
    ];
    const impossibleCertificate = certifyHeightCone(2, impossible);
    expect(impossibleCertificate.kind).toBe("infeasible");
    expect(
      replayHeightConeCertificate(2, impossible, impossibleCertificate),
    ).toEqual({ passed: true, errors: [] });

    if (impossibleCertificate.kind !== "infeasible") return;
    const staleTamper = {
      ...impossibleCertificate,
      inequalityMultipliers: impossibleCertificate.inequalityMultipliers.map(
        (entry, index) => (index === 0 ? { ...entry, value: "0" } : entry),
      ),
    };
    expect(replayHeightConeCertificate(2, impossible, staleTamper).passed).toBe(
      false,
    );

    const rehashedTamper = {
      ...staleTamper,
      certificateHash: canonicalSha256({
        ...staleTamper,
        certificateHash: "",
      }),
    };
    expect(
      replayHeightConeCertificate(2, impossible, rehashedTamper).passed,
    ).toBe(false);

    const equalityObstruction = [
      assignment([1, 0], 0),
      assignment([1, 1], 1),
      assignment([0, 1], -1),
    ];
    const equalityFarkas = certifyHeightCone(2, equalityObstruction);
    expect(equalityFarkas).toMatchObject({ kind: "infeasible" });
    if (equalityFarkas.kind === "infeasible") {
      expect(equalityFarkas.equalityMultipliers.length).toBeGreaterThan(0);
    }
    expect(
      replayHeightConeCertificate(2, equalityObstruction, equalityFarkas),
    ).toEqual({ passed: true, errors: [] });
  });

  it("matches the rank-four general-position face count", () => {
    // Moment-curve normals have every four-row minor nonzero. Five central
    // hyperplanes in R^4 therefore have the general-position maximum of 181
    // faces, including the origin.
    const normals = [1, 2, 3, 4, 5].map((value) => [
      1,
      value,
      value ** 2,
      value ** 3,
    ]);
    const cover = buildExactTernaryHeightConeCover({
      rank: 4,
      decide(context) {
        const next = normals.find(
          (normal) =>
            !context.assignments.some(
              (entry) =>
                entry.normalKey === canonicalizeHeightNormal(normal).key,
            ),
        );
        return next
          ? { kind: "split" as const, normal: next }
          : { kind: "leaf" as const, value: true };
      },
    });
    expect(cover.ordinaryLeafCount).toBe(180);
    expect(cover.zeroCharacterLeafCount).toBe(1);
    expect(
      replayExactTernaryHeightConeCover(cover, {
        verifyLeaf: () => true,
      }).status,
    ).toBe("passed");
  });

  it("enumerates all faces of three central lines, including zero branches", () => {
    const normals = [
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const cover = buildExactTernaryHeightConeCover({
      rank: 2,
      decide(context) {
        const next = normals.find(
          (normal) =>
            !context.assignments.some(
              (entry) =>
                entry.normalKey === canonicalizeHeightNormal(normal).key,
            ),
        );
        return next
          ? { kind: "split" as const, normal: next }
          : {
              kind: "leaf" as const,
              value: {
                signs: context.assignments.map((entry) => entry.sign),
                witness: context.feasibility.primitiveWitness,
              },
            };
      },
    });

    // Three distinct lines through the origin cut the plane into six chambers,
    // six rays, and the origin.
    expect(cover.ordinaryLeafCount).toBe(12);
    expect(cover.zeroCharacterLeafCount).toBe(1);
    // The all-zero cone is recognized as soon as x=y=0, so the final normal
    // is not redundantly split at the origin.
    expect(cover.infeasibleBranchCount).toBe(12);
    expect(
      replayExactTernaryHeightConeCover(cover, {
        verifyLeaf: (context, value) =>
          value.witness?.join(",") ===
          context.feasibility.primitiveWitness?.join(","),
      }),
    ).toMatchObject({ status: "passed" });
  });

  it("supports externally verified pruning leaves without dropping zero faces", () => {
    const xKey = canonicalizeHeightNormal([1, 0]).key;
    const yKey = canonicalizeHeightNormal([0, 1]).key;
    const cover = buildExactTernaryHeightConeCover({
      rank: 2,
      decide(context) {
        const x = context.assignments.find((entry) => entry.normalKey === xKey);
        if (!x) return { kind: "split" as const, normal: [1, 0] };
        if (x.sign !== 0) {
          return {
            kind: "prune" as const,
            proof: { normalKey: xKey, forcedSign: x.sign },
          };
        }
        const y = context.assignments.find((entry) => entry.normalKey === yKey);
        if (!y) return { kind: "split" as const, normal: [0, 1] };
        return {
          kind: "prune" as const,
          proof: { normalKey: yKey, forcedSign: y.sign },
        };
      },
    });
    expect(cover.pruneLeafCount).toBe(4);
    expect(cover.zeroCharacterLeafCount).toBe(1);

    const replay = replayExactTernaryHeightConeCover(cover, {
      verifyPrune: (context, proof) =>
        context.assignments.some(
          (entry) =>
            entry.normalKey === proof.normalKey &&
            entry.sign === proof.forcedSign &&
            proof.forcedSign !== 0,
        ),
    });
    expect(replay.status).toBe("passed");

    expect(replayExactTernaryHeightConeCover(cover).status).toBe("failed");
  });

  it("does not let an adaptive leaf or prune absorb the zero character", () => {
    expect(() =>
      buildExactTernaryHeightConeCover({
        rank: 2,
        decide: () => ({ kind: "leaf" as const, value: true }),
      }),
    ).toThrow(/containing the zero character must be split/u);

    expect(() =>
      buildExactTernaryHeightConeCover({
        rank: 2,
        decide: () => ({ kind: "prune" as const, proof: true }),
      }),
    ).toThrow(/containing the zero character must be split/u);
  });
});
