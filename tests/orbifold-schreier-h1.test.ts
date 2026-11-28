import { describe, expect, it } from "vitest";

import {
  buildGenericSparseModularRankWorkerRequest,
  certifyGenericSparseModularRank,
  computeGenericSparseIntegerMatrixDigest,
  replayGenericSparseModularRankCertificateFromReader,
} from "../src/fibering/genericSparseModularRank";
import {
  buildOrbifoldSchreierCocycleFamily,
  materializeOrbifoldSchreierH1Matrix,
  orbifoldSchreierH1SourceBindings,
  prepareOrbifoldSchreierH1,
} from "../src/fibering/orbifoldSchreierH1";
import { buildSchreierPresentation } from "../src/fibering/schreierPresentation";
import type { TorsionFreeActionCandidate } from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

const SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "Universal rank-three torsionful H1 fixture",
  rank: 3,
  generators: [
    { id: "s0", label: "s0" },
    { id: "s1", label: "s1" },
    { id: "s2", label: "s2" },
  ],
  coxeterMatrix: [
    [1, "inf", "inf"],
    ["inf", 1, "inf"],
    ["inf", "inf", 1],
  ],
  dataStatus: "toy",
};

const ACTION: TorsionFreeActionCandidate = {
  id: "torsionful-index-two",
  index: 2,
  generatorImages: [
    [1, 0],
    [1, 0],
    [0, 1],
  ],
};

function exponentRowsFromMaterializedPresentation(): Array<
  Array<[number, string]>
> {
  const presentation = buildSchreierPresentation(SYSTEM, ACTION);
  const indexById = new Map(
    presentation.generators.map((generator) => [generator.id, generator.index]),
  );
  return presentation.relatorRewrites.map((rewrite) => {
    const sums = new Map<number, number>();
    for (const letter of rewrite.word) {
      const column = indexById.get(letter.generatorId)!;
      sums.set(column, (sums.get(column) ?? 0) + letter.exponent);
    }
    return [...sums.entries()]
      .filter(([, coefficient]) => coefficient !== 0)
      .sort(([left], [right]) => left - right)
      .map(
        ([column, coefficient]) =>
          [column, coefficient.toString()] as [number, string],
      );
  });
}

describe("torsionful Reidemeister--Schreier H1 preparation", () => {
  it("matches the independent materialized Schreier rewriting exactly", () => {
    const preparation = prepareOrbifoldSchreierH1(SYSTEM, ACTION);
    const matrix = materializeOrbifoldSchreierH1Matrix(preparation);
    expect(matrix.rows.map((row) => row.entries)).toEqual(
      exponentRowsFromMaterializedPresentation(),
    );
    expect(preparation.certificate.action.torsionFreeRequired).toBe(false);
    expect(preparation.certificate.action.fixedGeneratorLoopCount).toBe(2);
    expect(preparation.certificate.graph.cotreeColumnCount).toBe(3);
    expect(preparation.certificate.matrix.rowCount).toBe(6);
    expect(preparation.certificate.matrix.genericSparseMatrixDigest).toBe(
      computeGenericSparseIntegerMatrixDigest(matrix),
    );
    expect(
      matrix.rows.filter((row) => row.entries[0]?.[1] === "2"),
    ).toHaveLength(2);
  });

  it("plugs into the proof-carrying modular-rank backend without a torsion-free gate", () => {
    const preparation = prepareOrbifoldSchreierH1(SYSTEM, ACTION);
    const matrix = materializeOrbifoldSchreierH1Matrix(preparation);
    const sourceBindings = orbifoldSchreierH1SourceBindings(preparation);
    const request = buildGenericSparseModularRankWorkerRequest({
      matrix,
      sourceBindings,
      modulusPrime: 1_000_003,
    });
    const certificate = certifyGenericSparseModularRank(request);
    expect(certificate.rank).toBe(2);
    expect(certificate.nullity).toBe(1);
    const replay = replayGenericSparseModularRankCertificateFromReader({
      matrixReader: preparation.genericMatrixReader,
      sourceBindings,
      certificate,
    });
    expect(replay.status).toBe("passed");
    expect(replay.certifiedNullity).toBe(1);
  });

  it("converts exact integer-kernel vectors to primitive action cocycles", () => {
    const preparation = prepareOrbifoldSchreierH1(SYSTEM, ACTION);
    const family = buildOrbifoldSchreierCocycleFamily(preparation, [
      { id: "cycle-s0-s1", entries: [[0, "1"]] },
    ]);
    expect(family.cocycles).toHaveLength(1);
    expect(family.cocycles[0].primitive).toBe(true);
    expect(family.cocycles[0].coordinateGcd).toBe("1");
    expect(family.cocycles[0].character.edgeIncrements[2]).toEqual(["0", "0"]);
    expect(family.cocycles[0].character.edgeIncrements[1]).toEqual(["1", "-1"]);
  });

  it("rejects a vector that is not in the exact integer kernel", () => {
    const preparation = prepareOrbifoldSchreierH1(SYSTEM, ACTION);
    expect(() =>
      buildOrbifoldSchreierCocycleFamily(preparation, [
        { id: "reflector-loop", entries: [[1, "1"]] },
      ]),
    ).toThrow(/not closed/u);
  });
});
