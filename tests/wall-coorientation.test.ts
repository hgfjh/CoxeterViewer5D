import { describe, expect, it } from "vitest";

import type {
  BarXCompressedComplex,
  BarXGeometricEdge,
  BarXRelationCell,
  BoundaryOccurrence,
} from "../src/compression/types";
import {
  createWallCoorientation,
  deriveMorseLinks,
  evaluateLawfulSubcomplex,
  findWallSystem,
  searchMaximumLawfulSubcomplex,
  type OrientationSign,
} from "../src/walls";
import { buildWallScene, wallColor } from "../src/app/wallScene";

describe("bar-X walls and lawful coorientations", () => {
  it("renders wall classes and their induced dual-edge directions without changing incidence", () => {
    const barX = polygonComplex(3);
    const walls = findWallSystem(barX);
    const coorientation = createWallCoorientation(walls);
    const selectedWall = walls.walls[0];
    const allWalls = buildWallScene(barX, walls, {
      selectedWallId: selectedWall.id,
      coorientation,
      focusSelectedWall: false,
      showInducedDirections: true,
      colorEdgesByWall: true,
    });

    const semanticEdges = allWalls.edges.filter((edge) => !edge.drawingOnly);
    const wallArcs = allWalls.edges.filter((edge) => edge.drawingOnly);
    expect(semanticEdges).toHaveLength(barX.geometricEdges.length);
    expect(wallArcs).toHaveLength(walls.crossingSegments.length);
    expect(wallArcs.every((edge) => edge.readabilityOverlay)).toBe(true);
    expect(semanticEdges.every((edge) => edge.directed)).toBe(true);
    expect(semanticEdges.every((edge) => edge.coorientationArrow)).toBe(true);
    expect(wallArcs.every((edge) => !edge.ghost)).toBe(true);
    for (const edge of semanticEdges) {
      expect(edge.colorHint).toBe(
        wallColor(walls, walls.edgeToWallId[edge.id]),
      );
    }

    const selectedOnly = buildWallScene(barX, walls, {
      selectedWallId: selectedWall.id,
      coorientation,
      focusSelectedWall: true,
      showInducedDirections: true,
      colorEdgesByWall: true,
    });
    expect(
      selectedOnly.edges
        .filter(
          (edge) =>
            !edge.drawingOnly && !selectedWall.edgeIds.includes(edge.id),
        )
        .every((edge) => edge.ghost),
    ).toBe(true);
    expect(
      selectedOnly.edges
        .filter(
          (edge) =>
            edge.drawingOnly &&
            !selectedWall.crossingSegmentIds.some(
              (id) => edge.id === `drawing:${id}`,
            ),
        )
        .every((edge) => edge.ghost),
    ).toBe(true);

    const arrowsHidden = buildWallScene(barX, walls, {
      coorientation,
      showInducedDirections: false,
    });
    expect(
      arrowsHidden.edges
        .filter((edge) => !edge.drawingOnly)
        .every((edge) => edge.directed === false),
    ).toBe(true);
    expect(coorientation.edgeDirections).toEqual(
      createWallCoorientation(walls).edgeDirections,
    );
  });

  it.each([
    { m: 2, expectedLawful: 4, total: 4 },
    { m: 3, expectedLawful: 6, total: 8 },
    { m: 5, expectedLawful: 10, total: 32 },
  ])(
    "counts the lawful coorientations of a single 2m-gon for m=$m",
    ({ m, expectedLawful, total }) => {
      const barX = polygonComplex(m);
      const walls = findWallSystem(barX);
      let lawful = 0;

      for (const signs of allWallSigns(walls.walls.map((wall) => wall.id))) {
        const coorientation = createWallCoorientation(walls, signs);
        const evaluation = evaluateLawfulSubcomplex(barX, coorientation);
        if (evaluation.retainedCellIds.includes("cell:0")) lawful += 1;
      }

      expect(2 ** walls.walls.length).toBe(total);
      expect(lawful).toBe(expectedLawful);
      expect(walls.diagnostics).toMatchObject({
        embedded: true,
        twoSided: true,
        selfOsculationFree: true,
      });
    },
  );

  it("records the source, sink, and two positive paths of a lawful polygon", () => {
    const barX = polygonComplex(3);
    const walls = findWallSystem(barX);
    const evaluation = evaluateLawfulSubcomplex(
      barX,
      createWallCoorientation(walls),
    );
    const cell = evaluation.cells[0];

    expect(cell.lawful).toBe(true);
    expect(cell.transitionCount).toBe(2);
    expect(cell.sourceVertexId).toBe("v0");
    expect(cell.sinkVertexId).toBe("v3");
    expect(cell.positivePaths.map((path) => path.steps.length)).toEqual([3, 3]);
    expect(cell.positivePaths.flatMap((path) => path.steps)).toHaveLength(6);
  });

  it("returns a concrete signed cycle when a wall is one-sided", () => {
    const barX = oneSidedParityFixture();
    const walls = findWallSystem(barX);
    const witness = walls.diagnostics.twoSidednessWitnesses.find((item) =>
      item.constraintCycle.some((constraint) =>
        ["a", "b", "c"].includes(constraint.firstEdgeId),
      ),
    );

    expect(walls.diagnostics.twoSided).toBe(false);
    expect(witness).toBeDefined();
    expect(witness?.constraintCycle.length).toBeGreaterThanOrEqual(3);
    expect(
      witness?.constraintCycle.reduce(
        (product, constraint) => product * constraint.parity,
        1,
      ),
    ).toBe(-1);
    expect(createWallCoorientation(walls).valid).toBe(false);
  });

  it("detects two crossings of one wall in the same polygon", () => {
    const walls = findWallSystem(selfCrossingFixture());
    const witness = walls.diagnostics.embeddednessWitnesses.find(
      (item) =>
        item.kind === "multiple-crossings-in-cell" && item.cellId === "cross",
    );

    expect(walls.diagnostics.embedded).toBe(false);
    expect(witness?.segmentIds).toHaveLength(2);
    expect(witness?.edgePairs).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
  });

  it("reports self-osculation by multiple link vertices at one vertex", () => {
    const walls = findWallSystem(selfOsculatingEdgeGermsFixture());
    const wallId = walls.edgeToWallId.e0;
    const witness = walls.diagnostics.selfOsculationWitnesses.find(
      (item) => item.wallId === wallId && item.vertexId === "x",
    );

    expect(witness).toBeDefined();
    expect(witness?.features.map((feature) => feature.kind)).toEqual([
      "link-vertex",
      "link-vertex",
    ]);
  });

  it("reports the link-edge form of self-osculation from Section 2.2", () => {
    const walls = findWallSystem(selfOsculatingLinkEdgesFixture());
    const wallId = walls.edgeToWallId.e0;
    const witness = walls.diagnostics.selfOsculationWitnesses.find(
      (item) => item.wallId === wallId && item.vertexId === "x",
    );

    expect(witness).toBeDefined();
    expect(witness?.features).toHaveLength(2);
    expect(
      witness?.features.every((feature) => feature.kind === "link-edge"),
    ).toBe(true);
  });

  it("proves an optimum and distinguishes a budgeted best-found result", () => {
    const barX = polygonComplex(5);
    const walls = findWallSystem(barX);
    const exact = searchMaximumLawfulSubcomplex(barX, walls);
    const budgeted = searchMaximumLawfulSubcomplex(barX, walls, {
      nodeBudget: 1,
    });
    const heuristic = searchMaximumLawfulSubcomplex(barX, walls, {
      exactWallLimit: 2,
      cellWeights: { "cell:0": 7 },
    });

    expect(exact.status).toBe("optimal");
    expect(exact.objectiveValue).toBe(1);
    expect(exact.certificate).toMatchObject({
      optimalityProven: true,
      lowerBound: 1,
      upperBound: 1,
      absoluteGap: 0,
      globalReversalSymmetryUsed: true,
    });
    expect(budgeted.status).toBe("best-found");
    expect(budgeted.certificate.optimalityProven).toBe(false);
    expect(budgeted.certificate.upperBound).toBeGreaterThanOrEqual(
      budgeted.certificate.lowerBound ?? 0,
    );
    expect(heuristic.status).toBe("best-found");
    expect(heuristic.objectiveValue).toBe(7);
    expect(heuristic.certificate).toMatchObject({
      method: "deterministic-local-search",
      optimalityProven: false,
      lowerBound: 7,
      upperBound: 7,
      absoluteGap: 0,
    });
  });

  it("enforces optional nonempty and connected Morse-link constraints", () => {
    const barX = oneVertexSquare();
    const walls = findWallSystem(barX);
    const nonempty = searchMaximumLawfulSubcomplex(barX, walls, {
      morseConstraint: {
        requireAscendingNonempty: true,
        requireDescendingNonempty: true,
      },
    });
    const connected = searchMaximumLawfulSubcomplex(barX, walls, {
      morseConstraint: {
        requireAscendingConnected: true,
        requireDescendingConnected: true,
      },
    });

    expect(nonempty.status).toBe("optimal");
    expect(nonempty.morseLinks?.allAscendingNonempty).toBe(true);
    expect(nonempty.morseLinks?.allDescendingNonempty).toBe(true);
    expect(connected.status).toBe("infeasible");
    expect(connected.objectiveValue).toBeNull();
    expect(connected.certificate.optimalityProven).toBe(true);
  });

  it("derives exact ascending and descending corner links", () => {
    const barX = oneVertexSquare();
    const wallSystem = findWallSystem(barX);
    const coorientation = createWallCoorientation(wallSystem);
    const lawful = evaluateLawfulSubcomplex(barX, coorientation);
    const links = deriveMorseLinks(barX, coorientation, lawful);

    expect(links.vertices).toHaveLength(1);
    expect(links.vertices[0].ascending.nonempty).toBe(true);
    expect(links.vertices[0].descending.nonempty).toBe(true);
    expect(links.vertices[0].ascending.corners).toHaveLength(1);
    expect(links.vertices[0].descending.corners).toHaveLength(1);
  });

  it("requires every wall through a polygon to point away for a link edge", () => {
    const barX = polygonComplex(3);
    const wallSystem = findWallSystem(barX);
    const coorientation = createWallCoorientation(wallSystem, {
      [wallSystem.edgeToWallId.e0]: 1,
      [wallSystem.edgeToWallId.e1]: -1,
      [wallSystem.edgeToWallId.e2]: 1,
    });
    const links = deriveMorseLinks(barX, coorientation);
    const atV0 = links.vertices.find((entry) => entry.vertexId === "v0");

    // The two incident arrows point away from v0, but the third wall crossing
    // the hexagon points toward v0, so the corner itself is not ascending.
    expect(atV0?.ascending.vertices).toHaveLength(2);
    expect(atV0?.ascending.corners).toHaveLength(0);
  });
});

function polygonComplex(m: number): BarXCompressedComplex {
  const vertexIds = Array.from(
    { length: 2 * m },
    (_unused, index) => `v${index}`,
  );
  const edges = vertexIds.map((sourceVertexId, index) =>
    edge(
      `e${index}`,
      sourceVertexId,
      vertexIds[(index + 1) % vertexIds.length],
      index % 2,
    ),
  );
  return makeBarX("single polygon", vertexIds, edges, [
    relationCell(
      "cell:0",
      m,
      edges.map((item) => item.id),
      edges,
    ),
  ]);
}

function oneVertexSquare(): BarXCompressedComplex {
  const edges = [
    edge("e0", "v", "v", 0),
    edge("e1", "v", "v", 1),
    edge("e2", "v", "v", 0),
    edge("e3", "v", "v", 1),
  ];
  return makeBarX("one-vertex square", ["v"], edges, [
    relationCell(
      "square",
      2,
      edges.map((item) => item.id),
      edges,
    ),
  ]);
}

function oneSidedParityFixture(): BarXCompressedComplex {
  const ids = ["a", "b", "c", "x", "y", "u", "v", "p", "q"];
  const edges = ids.map((id, index) => edge(id, "z", "z", index % 3));
  return makeBarX("one-sided parity", ["z"], edges, [
    relationCell("parity:ab", 2, ["a", "x", "b", "y"], edges),
    relationCell("parity:bc", 2, ["b", "u", "c", "v"], edges),
    relationCell("parity:ca", 2, ["c", "p", "a", "q"], edges),
  ]);
}

function selfCrossingFixture(): BarXCompressedComplex {
  const ids = ["a", "b", "c", "d", "x", "y"];
  const edges = ids.map((id, index) => edge(id, "z", "z", index % 2));
  return makeBarX("self-crossing wall", ["z"], edges, [
    relationCell("cross", 2, ["a", "b", "c", "d"], edges),
    relationCell("merge", 2, ["a", "x", "b", "y"], edges),
  ]);
}

function selfOsculatingEdgeGermsFixture(): BarXCompressedComplex {
  const vertices = ["x", "u", "v", "w", "z"];
  const endpoints: Array<[string, string]> = [
    ["x", "u"],
    ["u", "v"],
    ["v", "x"],
    ["x", "w"],
    ["w", "z"],
    ["z", "x"],
  ];
  const edges = endpoints.map(([source, target], index) =>
    edge(`e${index}`, source, target, index % 2),
  );
  return makeBarX("self-osculating edge germs", vertices, edges, [
    relationCell(
      "hexagon",
      3,
      edges.map((item) => item.id),
      edges,
    ),
  ]);
}

function selfOsculatingLinkEdgesFixture(): BarXCompressedComplex {
  const boundaryVertices = ["v0", "v1", "x", "v3", "v4", "v5", "x", "v7"];
  const vertices = [...new Set(boundaryVertices)];
  const edges = boundaryVertices.map((source, index) =>
    edge(
      `e${index}`,
      source,
      boundaryVertices[(index + 1) % boundaryVertices.length],
      index % 2,
    ),
  );
  return makeBarX("self-osculating link edges", vertices, edges, [
    relationCell(
      "octagon",
      4,
      edges.map((item) => item.id),
      edges,
    ),
  ]);
}

function edge(
  id: string,
  sourceVertexId: string,
  targetVertexId: string,
  generator: number,
): BarXGeometricEdge {
  return {
    id,
    sourceVertexId,
    targetVertexId,
    generator,
    sourceHatDirectedEdgeIds: [`hat:${id}:0`, `hat:${id}:1`],
    sourceHatBigonCellIds: [`bigon:${id}:0`, `bigon:${id}:1`],
  };
}

function relationCell(
  id: string,
  m: number,
  boundaryEdgeIds: string[],
  edges: BarXGeometricEdge[],
): BarXRelationCell {
  const byId = new Map(edges.map((item) => [item.id, item] as const));
  return {
    id,
    generatorPair: [0, 1],
    m,
    boundaryOccurrences: boundaryEdgeIds.map((edgeId, boundaryIndex) => {
      const item = byId.get(edgeId);
      if (!item) throw new Error(`Missing fixture edge ${edgeId}.`);
      return {
        edgeId,
        traversal: 1,
        boundaryIndex,
        sourceVertexId: item.sourceVertexId,
        targetVertexId: item.targetVertexId,
        generator: item.generator,
      } satisfies BoundaryOccurrence;
    }),
    sourceHatRelationCellIds: Array.from(
      { length: 2 * m },
      (_unused, index) => `hat:${id}:${index}`,
    ),
  };
}

function makeBarX(
  name: string,
  vertexIds: string[],
  geometricEdges: BarXGeometricEdge[],
  relationCells: BarXRelationCell[],
): BarXCompressedComplex {
  const rank = Math.max(2, ...geometricEdges.map((item) => item.generator + 1));
  return {
    schemaVersion: 1,
    kind: "bar-x-compression",
    name,
    sourceSystem: {
      schemaVersion: 1,
      name: `${name} source`,
      rank,
      generators: Array.from({ length: rank }, (_unused, index) => ({
        id: `s${index}`,
        label: `s${index}`,
      })),
      coxeterMatrix: Array.from({ length: rank }, (_unused, row) =>
        Array.from({ length: rank }, (_other, column) =>
          row === column ? 1 : 2,
        ),
      ),
    },
    vertices: vertexIds.map((id) => ({
      id,
      sourceHatVertexId: `hat:${id}`,
      sourceQuotientVertexId: `quotient:${id}`,
    })),
    geometricEdges,
    relationCells,
    provenance: {
      sourceQuotientName: `${name} quotient`,
      construction: "permutation-action-lift",
      compression: "generator-bigons-and-parallel-relation-lifts",
      actionEvidence: "in-repo-checked",
      torsionFreeEvidence: "not-supplied",
      checksPerformed: [],
      claims: [],
      limitations: [],
    },
    warnings: [],
  };
}

function allWallSigns(
  wallIds: string[],
): Array<Record<string, OrientationSign>> {
  return Array.from(
    { length: 2 ** wallIds.length },
    (_unused, mask) =>
      Object.fromEntries(
        wallIds.map((wallId, index) => [
          wallId,
          ((mask >> index) & 1) === 0 ? 1 : -1,
        ]),
      ) as Record<string, OrientationSign>,
  );
}
