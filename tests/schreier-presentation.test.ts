import { describe, expect, it } from "vitest";

import regularI2QuotientJson from "../src/examples/I2_5_identity_quotient.json";
import oneVertexI2QuotientJson from "./fixtures/quotients/I2_5_one_vertex_quotient.json";
import {
  buildSchreierPresentation,
  buildSchreierPresentationFromQuotient,
  expandSchreierWord,
  freelyReduceSchreierWord,
  type SchreierLetter,
} from "../src/fibering/schreierPresentation";
import type { QuotientComplex } from "../src/quotient";
import type { TorsionFreeActionCandidate } from "../src/torsionFree";

const ONE_VERTEX_I2 = oneVertexI2QuotientJson as unknown as QuotientComplex;
const REGULAR_I2 = regularI2QuotientJson as unknown as QuotientComplex;

function applyQuotientWord(
  quotient: QuotientComplex,
  startPointId: string,
  word: readonly number[],
): string {
  const actionByGenerator = new Map(
    quotient.permutationAction?.map((action) => [action.generator, action]),
  );
  return word.reduce((pointId, generator) => {
    const target = actionByGenerator.get(generator)?.images[pointId];
    if (target === undefined) {
      throw new Error(`Test action is missing s${generator} at ${pointId}.`);
    }
    return target;
  }, startPointId);
}

function finiteActionFromQuotient(
  quotient: QuotientComplex,
): TorsionFreeActionCandidate {
  const pointIds = quotient.vertices
    .map((vertex) => vertex.id)
    .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
  const pointIndex = new Map(
    pointIds.map((pointId, index) => [pointId, index]),
  );
  const rows = [...(quotient.permutationAction ?? [])].sort(
    (left, right) => left.generator - right.generator,
  );
  return {
    id: "regular-i2-from-existing-fixture",
    index: pointIds.length,
    generatorImages: rows.map((row) =>
      pointIds.map((pointId) => {
        const target = pointIndex.get(row.images[pointId]);
        if (target === undefined) throw new Error("Incomplete test action.");
        return target;
      }),
    ),
  };
}

describe("deterministic Reidemeister-Schreier presentation", () => {
  it("retains loop generators and all Coxeter relators in the one-point quotient", () => {
    const presentation = buildSchreierPresentationFromQuotient(ONE_VERTEX_I2);

    expect(presentation).toMatchObject({
      convention: "left-cosets-right-action",
      rootPointId: "q",
      pointCount: 1,
      edgeOrbitCount: 2,
      graphRank: 2,
    });
    expect(presentation.spanningTreeEdges).toEqual([]);
    expect(
      presentation.generators.map((generator) => ({
        id: generator.id,
        edge: generator.provenance.orientedEdgeId,
        word: generator.provenance.subgroupWord,
      })),
    ).toEqual([
      { id: "h0", edge: "s0", word: [0] },
      { id: "h1", edge: "s1", word: [1] },
    ]);

    expect(presentation.relatorRewrites).toHaveLength(3);
    expect(presentation.relators).toHaveLength(3);
    expect(
      presentation.relatorRewrites.find(
        (rewrite) =>
          rewrite.source.kind === "involution" &&
          rewrite.source.generator === 0,
      )?.word,
    ).toEqual([
      { generatorId: "h0", exponent: 1 },
      { generatorId: "h0", exponent: 1 },
    ]);
    expect(
      presentation.relatorRewrites.find(
        (rewrite) => rewrite.source.kind === "finite-pair",
      )?.word,
    ).toEqual(
      Array.from({ length: 10 }, (_unused, index) => ({
        generatorId: index % 2 === 0 ? "h0" : "h1",
        exponent: 1,
      })),
    );
  });

  it("uses a spanning-tree transversal and obtains graph rank one for the regular I2(5) action", () => {
    const presentation = buildSchreierPresentationFromQuotient(REGULAR_I2);

    expect(presentation.rootPointId).toBe("q0");
    expect(presentation.pointCount).toBe(10);
    expect(presentation.edgeOrbitCount).toBe(10);
    expect(presentation.spanningTreeEdges).toHaveLength(9);
    expect(presentation.graphRank).toBe(1);
    expect(presentation.generators).toHaveLength(1);
    expect(presentation.edgeAssignments).toHaveLength(20);
    expect(presentation.relatorRewrites).toHaveLength(30);

    const involutionRewrites = presentation.relatorRewrites.filter(
      (rewrite) => rewrite.source.kind === "involution",
    );
    const pairRewrites = presentation.relatorRewrites.filter(
      (rewrite) => rewrite.source.kind === "finite-pair",
    );
    expect(involutionRewrites).toHaveLength(20);
    expect(involutionRewrites.every((rewrite) => rewrite.isTrivial)).toBe(true);
    expect(pairRewrites).toHaveLength(10);
    expect(pairRewrites.every((rewrite) => rewrite.word.length === 1)).toBe(
      true,
    );
    expect(presentation.relators).toHaveLength(10);

    for (const generator of presentation.generators) {
      expect(
        applyQuotientWord(
          REGULAR_I2,
          presentation.rootPointId,
          generator.provenance.subgroupWord,
        ),
      ).toBe(presentation.rootPointId);
    }
    for (const rewrite of presentation.relatorRewrites) {
      expect(
        applyQuotientWord(REGULAR_I2, rewrite.basePointId, rewrite.coxeterWord),
      ).toBe(rewrite.basePointId);
      expect(
        applyQuotientWord(
          REGULAR_I2,
          presentation.rootPointId,
          expandSchreierWord(rewrite.word, presentation.generators),
        ),
      ).toBe(presentation.rootPointId);
    }
  });

  it("produces the same transversal and subgroup words from raw finite-action data", () => {
    const fromQuotient = buildSchreierPresentationFromQuotient(REGULAR_I2);
    const fromAction = buildSchreierPresentation(
      REGULAR_I2.sourceSystem,
      finiteActionFromQuotient(REGULAR_I2),
    );

    expect(fromAction.transversal).toEqual(
      fromQuotient.transversal.map((entry) => ({
        ...entry,
        ...(entry.treeEdgeId === undefined
          ? {}
          : {
              treeEdgeId: `action:g${entry.parentGenerator}:${entry.parentPointId}`,
            }),
      })),
    );
    expect(
      fromAction.generators.map(
        (generator) => generator.provenance.subgroupWord,
      ),
    ).toEqual(
      fromQuotient.generators.map(
        (generator) => generator.provenance.subgroupWord,
      ),
    );
    expect(fromAction.relators.map((relator) => relator.word)).toEqual(
      fromQuotient.relators.map((relator) => relator.word),
    );
  });

  it("is deterministic under harmless quotient-array reordering", () => {
    const reordered: QuotientComplex = {
      ...REGULAR_I2,
      vertices: [...REGULAR_I2.vertices].reverse(),
      edges: [...REGULAR_I2.edges].reverse(),
      permutationAction: [...(REGULAR_I2.permutationAction ?? [])].reverse(),
    };
    const original = buildSchreierPresentationFromQuotient(REGULAR_I2);
    const repeated = buildSchreierPresentationFromQuotient(reordered);

    expect(repeated.rootPointId).toBe(original.rootPointId);
    expect(repeated.transversal).toEqual(original.transversal);
    expect(repeated.generators).toEqual(original.generators);
    expect(repeated.relatorRewrites).toEqual(original.relatorRewrites);
  });

  it("freely reduces only adjacent inverse Schreier letters", () => {
    const word: SchreierLetter[] = [
      { generatorId: "a", exponent: 1 },
      { generatorId: "b", exponent: 1 },
      { generatorId: "b", exponent: -1 },
      { generatorId: "a", exponent: 1 },
    ];
    expect(freelyReduceSchreierWord(word)).toEqual([
      { generatorId: "a", exponent: 1 },
      { generatorId: "a", exponent: 1 },
    ]);
  });
});
