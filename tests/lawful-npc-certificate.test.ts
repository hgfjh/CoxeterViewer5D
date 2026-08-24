import { describe, expect, it } from "vitest";

import type {
  BarXCompressedComplex,
  BarXGeometricEdge,
  BarXRelationCell,
  BoundaryOccurrence,
} from "../src/compression/types";
import { certifyLawfulNpcAsphericity } from "../src/fibering/lawfulNpcCertificate";
import type { LawfulSubcomplexEvaluation } from "../src/walls/types";

describe("lawful-subcomplex metric certification", () => {
  it("certifies a regular lawful polygon by exact metric links", () => {
    const barX = polygonComplex(3, 1);
    const certificate = certifyLawfulNpcAsphericity(
      barX,
      retainEveryCell(barX),
    );

    expect(certificate.status, certificate.errors.join("\n")).toBe("passed");
    expect(certificate.checks).toMatchObject({
      completeRegularPolygonMetric: true,
      everyMetricLinkCatOne: true,
      locallyCatZero: true,
      universalCoverContractible: true,
      aspherical: true,
    });
    expect(
      certificate.vertexLinks.flatMap((link) => link.corners),
    ).toHaveLength(6);
    expect(
      certificate.vertexLinks.flatMap((link) => link.corners)[0].angleOverPi,
    ).toEqual({ numerator: "2", denominator: "3" });
    expect(certificate.hashes.certificateSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a two-edge metric-link circuit created by parallel corners", () => {
    const barX = polygonComplex(2, 2);
    const certificate = certifyLawfulNpcAsphericity(
      barX,
      retainEveryCell(barX),
    );

    expect(certificate.status).toBe("failed");
    expect(certificate.checks.everyMetricLinkCatOne).toBe(false);
    expect(
      certificate.vertexLinks.some((link) =>
        link.shortCircuitWitnesses.some(
          (witness) => witness.kind === "two-edge-cycle",
        ),
      ),
    ).toBe(true);
  });

  it("does not borrow a higher-dimensional claim from a valid 2D check", () => {
    const barX = polygonComplex(2, 1);
    const certificate = certifyLawfulNpcAsphericity(
      barX,
      retainEveryCell(barX),
    );

    expect(certificate.status).toBe("passed");
    expect(certificate.nonClaims.join(" ")).toContain(
      "not automatically to a higher-dimensional coface closure",
    );
  });
});

function polygonComplex(m: number, copies: number): BarXCompressedComplex {
  const vertexIds = Array.from({ length: 2 * m }, (_, index) => `v${index}`);
  const geometricEdges = vertexIds.map((sourceVertexId, index) =>
    edge(
      `e${index}`,
      sourceVertexId,
      vertexIds[(index + 1) % vertexIds.length],
      index % 2,
    ),
  );
  const relationCells = Array.from({ length: copies }, (_, index) =>
    relationCell(`cell:${index}`, m, geometricEdges),
  );
  return {
    schemaVersion: 1,
    kind: "bar-x-compression",
    name: `${copies} regular ${2 * m}-gon fixture`,
    sourceSystem: {
      schemaVersion: 1,
      name: "metric-link fixture",
      rank: 2,
      generators: [
        { id: "s0", label: "s0" },
        { id: "s1", label: "s1" },
      ],
      coxeterMatrix: [
        [1, m],
        [m, 1],
      ],
    },
    vertices: vertexIds.map((id) => ({
      id,
      sourceHatVertexId: `hat:${id}`,
      sourceQuotientVertexId: `quotient:${id}`,
    })),
    geometricEdges,
    relationCells,
    provenance: {
      sourceQuotientName: "metric-link fixture quotient",
      construction: "permutation-action-lift",
      compression: "generator-bigons-and-parallel-relation-lifts",
      actionEvidence: "in-repo-checked",
      torsionFreeEvidence: "in-repo-checked",
      checksPerformed: [],
      claims: [],
      limitations: [],
    },
    warnings: [],
  };
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
  edges: BarXGeometricEdge[],
): BarXRelationCell {
  return {
    id,
    generatorPair: [0, 1],
    m,
    boundaryOccurrences: edges.map(
      (item, boundaryIndex) =>
        ({
          edgeId: item.id,
          traversal: 1,
          boundaryIndex,
          sourceVertexId: item.sourceVertexId,
          targetVertexId: item.targetVertexId,
          generator: item.generator,
        }) satisfies BoundaryOccurrence,
    ),
    sourceHatRelationCellIds: Array.from(
      { length: 2 * m },
      (_, index) => `hat:${id}:${index}`,
    ),
  };
}

function retainEveryCell(
  barX: BarXCompressedComplex,
): LawfulSubcomplexEvaluation {
  return {
    valid: true,
    errors: [],
    cells: barX.relationCells.map((cell) => ({
      cellId: cell.id,
      lawful: true,
      transitionCount: 2,
      boundarySigns: Array.from({ length: 2 * cell.m }, (_, index) =>
        index < cell.m ? 1 : -1,
      ),
      sourceVertexId: cell.boundaryOccurrences[0].sourceVertexId,
      sinkVertexId: cell.boundaryOccurrences[cell.m].sourceVertexId,
      positivePaths: [],
    })),
    retainedCellIds: barX.relationCells.map((cell) => cell.id),
    discardedCellIds: [],
    retainedEdgeIds: barX.geometricEdges.map((edge) => edge.id),
    retainedVertexIds: barX.vertices.map((vertex) => vertex.id),
  };
}
