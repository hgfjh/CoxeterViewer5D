import { describe, expect, it } from "vitest";
import {
  CoverCompressionError,
  buildCoverCompression,
  buildHatXFromQuotient,
  validateBarX,
  validateHatX,
  type BarXCompressedComplex,
  type HatXCoverComplex,
} from "../src/compression";
import type { QuotientComplex } from "../src/quotient";
import { buildIdealHyperbolic3CubeS4Cover } from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import I2_5_IDENTITY_QUOTIENT from "../src/examples/I2_5_identity_quotient.json";
import IDEAL_3_CUBE from "../src/examples/ideal_hyperbolic_3_cube_m3.json";

function dihedralIdentityAction(
  sourceM: number,
  actionM = sourceM,
): QuotientComplex {
  const vertexCount = 2 * actionM;
  const sourceSystem: CoxeterSystemInput = {
    schemaVersion: 1,
    name: `I2(${sourceM})`,
    dataStatus: "toy",
    rank: 2,
    generators: [
      { id: "s0", label: "s0" },
      { id: "s1", label: "s1" },
    ],
    coxeterMatrix: [
      [1, sourceM],
      [sourceM, 1],
    ],
  };
  const vertices = Array.from({ length: vertexCount }, (_unused, index) => ({
    id: `q${index}`,
    label: `q${index}`,
  }));
  const image = (index: number, generator: number): number => {
    if (generator === 0) {
      return index % 2 === 0 ? index + 1 : index - 1;
    }
    return index % 2 === 1
      ? (index + 1) % vertexCount
      : (index - 1 + vertexCount) % vertexCount;
  };
  const permutationAction = [0, 1].map((generator) => ({
    generator,
    images: Object.fromEntries(
      vertices.map((vertex, index) => [
        vertex.id,
        `q${image(index, generator)}`,
      ]),
    ),
  }));
  const edgeId = (source: number, generator: number) =>
    `qe:q${source}:g${generator}`;
  const edges = vertices.flatMap((_vertex, source) =>
    [0, 1].map((generator) => {
      const target = image(source, generator);
      return {
        id: edgeId(source, generator),
        source: `q${source}`,
        target: `q${target}`,
        generator,
        inverseEdgeId: edgeId(target, generator),
        label: `s${generator}`,
      };
    }),
  );
  const boundaryVertexIds = vertices.map((vertex) => vertex.id);
  const boundaryEdgeIds = vertices.map((_vertex, index) =>
    edgeId(index, index % 2),
  );
  return {
    schemaVersion: 1,
    name: `I2(${sourceM}) action on an I2(${actionM}) orbit`,
    sourceSystem,
    generatorRank: 2,
    permutationAction,
    vertices,
    edges,
    twoCells:
      sourceM === actionM
        ? [
            {
              id: "source-orbit-cell",
              generatorPair: [0, 1],
              m: sourceM,
              boundaryVertexIds,
              boundaryEdgeIds,
            },
          ]
        : [],
    subgroup: {
      name: "identity subgroup",
      index: vertexCount,
      generators: [],
    },
  };
}

function expectSignedBoundaryToFollowEdges(barX: BarXCompressedComplex): void {
  const edgeById = new Map(barX.geometricEdges.map((edge) => [edge.id, edge]));
  for (const cell of barX.relationCells) {
    cell.boundaryOccurrences.forEach((occurrence, index) => {
      const edge = edgeById.get(occurrence.edgeId);
      expect(edge).toBeDefined();
      const expectedSource =
        occurrence.traversal === 1
          ? edge!.sourceVertexId
          : edge!.targetVertexId;
      const expectedTarget =
        occurrence.traversal === 1
          ? edge!.targetVertexId
          : edge!.sourceVertexId;
      expect(occurrence).toMatchObject({
        boundaryIndex: index,
        sourceVertexId: expectedSource,
        targetVertexId: expectedTarget,
        generator: cell.generatorPair[index % 2],
      });
      expect(occurrence.targetVertexId).toBe(
        cell.boundaryOccurrences[(index + 1) % cell.boundaryOccurrences.length]
          .sourceVertexId,
      );
    });
  }
}

describe("hat X cover and bar X compression", () => {
  it("constructs the exact I2(5) identity cover and its compression", () => {
    const quotient = I2_5_IDENTITY_QUOTIENT as unknown as QuotientComplex;
    const first = buildCoverCompression(quotient);
    const second = buildCoverCompression(quotient);

    expect(second).toEqual(first);
    expect(first.hatX.vertices).toHaveLength(10);
    expect(first.hatX.directedLiftEdges).toHaveLength(20);
    expect(first.hatX.generatorBigonCells).toHaveLength(20);
    expect(first.hatX.liftedRelationCells).toHaveLength(10);
    expect(first.barX.vertices).toHaveLength(10);
    expect(first.barX.geometricEdges).toHaveLength(10);
    expect(first.barX.relationCells).toHaveLength(1);
    expect(first.barX.relationCells[0].boundaryOccurrences).toHaveLength(10);

    expect(validateHatX(first.hatX)).toMatchObject({ ok: true, errors: [] });
    expect(validateBarX(first.barX)).toMatchObject({ ok: true, errors: [] });
    expect(first.certificate).toMatchObject({
      status: "passed",
      method: "in-repo-exact-cellular-compression",
      checks: {
        hatBoundaryClosure: true,
        barBoundaryClosure: true,
        edgeFibersHaveCardinalityTwo: true,
        bigonFibersHaveCardinalityTwo: true,
        relationFibersHaveCardinalityTwoM: true,
        everyHatCellHasOneImage: true,
        signedRelationBoundariesAgree: true,
      },
    });
    expect(first.certificate.pairCounts).toEqual([
      expect.objectContaining({
        generatorPair: [0, 1],
        m: 5,
        expectedHatRelationCells: 10,
        actualHatRelationCells: 10,
        expectedBarRelationCells: 1,
        actualBarRelationCells: 1,
        passed: true,
      }),
    ]);
    expect(first.hatX.provenance).toMatchObject({
      actionEvidence: "supplied-passed",
      torsionFreeEvidence: "in-repo-checked",
    });
    expect(first.hatX.warnings.join(" ")).toContain(
      "Torsion-freeness is supported by an in-repo combinatorial check",
    );
    expect("position" in first.hatX.vertices[0]).toBe(false);
    expect("position" in first.barX.vertices[0]).toBe(false);
  });

  it("records all edge, bigon, and relation fibers explicitly", () => {
    const { hatX, barX, compressionMap } = buildCoverCompression(
      I2_5_IDENTITY_QUOTIENT as unknown as QuotientComplex,
    );

    expect(compressionMap.edgeFibers).toHaveLength(barX.geometricEdges.length);
    expect(compressionMap.bigonFibers).toHaveLength(barX.geometricEdges.length);
    expect(compressionMap.relationFibers).toHaveLength(
      barX.relationCells.length,
    );
    expect(
      new Set(
        compressionMap.edgeFibers.flatMap((fiber) => fiber.hatDirectedEdgeIds),
      ).size,
    ).toBe(hatX.directedLiftEdges.length);
    expect(
      compressionMap.edgeFibers.every(
        (fiber) => fiber.hatDirectedEdgeIds.length === 2,
      ),
    ).toBe(true);
    expect(
      compressionMap.bigonFibers.every(
        (fiber) => fiber.hatBigonCellIds.length === 2,
      ),
    ).toBe(true);
    expect(
      new Set(
        compressionMap.bigonFibers.flatMap((fiber) => fiber.hatBigonCellIds),
      ).size,
    ).toBe(hatX.generatorBigonCells.length);
    expect(compressionMap.relationFibers[0]).toMatchObject({
      expectedCardinality: 10,
    });
    expect(compressionMap.relationFibers[0].hatRelationCellIds).toHaveLength(
      10,
    );
    expect(Object.keys(compressionMap.liftedRelationCellImages)).toHaveLength(
      10,
    );
  });

  it("keeps both lifted bigons over each compressed generator edge", () => {
    const { hatX, barX, compressionMap } = buildCoverCompression(
      I2_5_IDENTITY_QUOTIENT as unknown as QuotientComplex,
    );
    const bigonById = new Map(
      hatX.generatorBigonCells.map((cell) => [cell.id, cell]),
    );

    for (const barEdge of barX.geometricEdges) {
      const fiber = compressionMap.bigonFibers.find(
        (entry) => entry.barEdgeId === barEdge.id,
      );
      expect(fiber).toBeDefined();
      const cells = fiber!.hatBigonCellIds.map((id) => bigonById.get(id)!);
      expect(cells.map((cell) => cell.baseVertexId).sort()).toEqual(
        [
          cells[0].boundaryOccurrences[0].sourceVertexId,
          cells[0].boundaryOccurrences[0].targetVertexId,
        ].sort(),
      );
      expect(
        cells.map((cell) =>
          cell.boundaryOccurrences.map((occurrence) => occurrence.edgeId),
        ),
      ).toEqual([
        barEdge.sourceHatDirectedEdgeIds,
        [...barEdge.sourceHatDirectedEdgeIds].reverse(),
      ]);
      expect(barEdge.sourceHatBigonCellIds).toEqual(fiber!.hatBigonCellIds);
    }
  });

  it("stores a closed signed decagon after identifying each generator bigon", () => {
    const { barX } = buildCoverCompression(
      I2_5_IDENTITY_QUOTIENT as unknown as QuotientComplex,
    );
    const traversals = new Set(
      barX.relationCells[0].boundaryOccurrences.map(
        (occurrence) => occurrence.traversal,
      ),
    );

    expect(traversals).toEqual(new Set([-1, 1]));
    expectSignedBoundaryToFollowEdges(barX);
  });

  it("constructs the hand-built I2(3) cover with one compressed hexagon", () => {
    const result = buildCoverCompression(dihedralIdentityAction(3));

    expect(result.hatX.vertices).toHaveLength(6);
    expect(result.hatX.directedLiftEdges).toHaveLength(12);
    expect(result.hatX.generatorBigonCells).toHaveLength(12);
    expect(result.hatX.liftedRelationCells).toHaveLength(6);
    expect(result.barX.vertices).toHaveLength(6);
    expect(result.barX.geometricEdges).toHaveLength(6);
    expect(result.barX.relationCells).toHaveLength(1);
    expect(result.barX.relationCells[0]).toMatchObject({
      generatorPair: [0, 1],
      m: 3,
    });
    expect(result.barX.relationCells[0].boundaryOccurrences).toHaveLength(6);
    expect(result.compressionMap.relationFibers[0]).toMatchObject({
      expectedCardinality: 6,
    });
    expect(result.certificate.status).toBe("passed");
    expectSignedBoundaryToFollowEdges(result.barX);
  });

  it("partitions each degree-24 cube relation family into four six-cell orbits", () => {
    const quotient = buildIdealHyperbolic3CubeS4Cover(
      IDEAL_3_CUBE as CoxeterSystemInput,
    );
    const result = buildCoverCompression(quotient);

    expect(result.hatX.vertices).toHaveLength(24);
    expect(result.hatX.directedLiftEdges).toHaveLength(24 * 6);
    expect(result.hatX.generatorBigonCells).toHaveLength(24 * 6);
    expect(result.hatX.liftedRelationCells).toHaveLength(24 * 12);
    expect(result.barX.geometricEdges).toHaveLength((24 * 6) / 2);
    expect(result.barX.relationCells).toHaveLength(12 * (24 / 6));
    expect(result.certificate.pairCounts).toHaveLength(12);
    expect(
      result.certificate.pairCounts.every(
        (check) =>
          check.m === 3 &&
          check.actualHatRelationCells === 24 &&
          check.actualBarRelationCells === 4 &&
          check.passed,
      ),
    ).toBe(true);
    expect(
      result.compressionMap.relationFibers.every(
        (fiber) =>
          fiber.expectedCardinality === 6 &&
          fiber.hatRelationCellIds.length === 6,
      ),
    ).toBe(true);
  });

  it("rejects a quotient without a supplied permutation action", () => {
    const quotient = dihedralIdentityAction(3);
    delete quotient.permutationAction;

    expect(() => buildHatXFromQuotient(quotient)).toThrowError(
      /permutationAction is required/,
    );
  });

  it("rejects generator fixed points before constructing bigons", () => {
    const quotient = dihedralIdentityAction(3);
    const action = quotient.permutationAction!.find(
      (entry) => entry.generator === 0,
    )!;
    action.images.q0 = "q0";
    action.images.q1 = "q1";
    const q0Edge = quotient.edges.find(
      (edge) => edge.source === "q0" && edge.generator === 0,
    )!;
    const q1Edge = quotient.edges.find(
      (edge) => edge.source === "q1" && edge.generator === 0,
    )!;
    Object.assign(q0Edge, {
      target: "q0",
      inverseEdgeId: q0Edge.id,
    });
    Object.assign(q1Edge, {
      target: "q1",
      inverseEdgeId: q1Edge.id,
    });

    expect(() => buildHatXFromQuotient(quotient)).toThrowError(
      /fixes vertex "q0"/,
    );
  });

  it("rejects a missing directed generator edge", () => {
    const quotient = dihedralIdentityAction(3);
    quotient.edges = quotient.edges.filter(
      (edge) => !(edge.source === "q2" && edge.generator === 1),
    );

    expect(() => buildHatXFromQuotient(quotient)).toThrowError(
      /Missing directed quotient edge from vertex "q2" for generator 1/,
    );
  });

  it("rejects an action whose declared finite relation does not close", () => {
    const quotient = dihedralIdentityAction(5, 3);

    expect(() => buildHatXFromQuotient(quotient)).toThrowError(
      /Finite relation \(s0 s1\)\^5 does not close/,
    );
  });

  it("rejects a closing relation with a nonfree finite-pair orbit", () => {
    const quotient = dihedralIdentityAction(6, 3);

    expect(() => buildHatXFromQuotient(quotient)).toThrowError(
      /has size 6; expected 2m=12.*not free/,
    );
  });

  it("detects malformed attaching maps after construction", () => {
    const result = buildCoverCompression(dihedralIdentityAction(3));
    const brokenHat = structuredClone(result.hatX) as HatXCoverComplex;
    brokenHat.liftedRelationCells[0].boundaryOccurrences[1].sourceVertexId =
      brokenHat.liftedRelationCells[0].boundaryOccurrences[0].sourceVertexId;
    expect(validateHatX(brokenHat).ok).toBe(false);
    expect(validateHatX(brokenHat).errors.join(" ")).toContain("not closed");

    const brokenBar = structuredClone(result.barX) as BarXCompressedComplex;
    brokenBar.relationCells[0].boundaryOccurrences[0].traversal *= -1;
    expect(validateBarX(brokenBar).ok).toBe(false);
    expect(validateBarX(brokenBar).errors.join(" ")).toContain(
      "incorrect signed traversal",
    );
  });

  it("uses a typed construction error with every failed precondition", () => {
    const quotient = dihedralIdentityAction(3);
    delete quotient.permutationAction;

    try {
      buildHatXFromQuotient(quotient);
      throw new Error("expected construction to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CoverCompressionError);
      expect((error as CoverCompressionError).errors.length).toBeGreaterThan(0);
    }
  });
});
