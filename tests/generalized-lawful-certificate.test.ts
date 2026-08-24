import { describe, expect, it } from "vitest";

import {
  buildGeneralizedLawfulCertificate,
  buildGeneralizedLawfulCertificateFromStreamed,
  buildGeneralizedLawfulClosureAndAsphericityFromStreamed,
  computeGeneralizedLawfulDirectedLinkAtPointFromStreamed,
  generalizedLawfulCellId,
  replayGeneralizedLawfulCertificate,
  replayGeneralizedLawfulCertificateFromStreamed,
  type GeneralizedLawfulCellKey,
  type GeneralizedLawfulCellOracle,
  type GeneralizedLawfulSphericalType,
} from "../src/fibering/generalizedLawfulCertificate";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";

interface CubeCell extends GeneralizedLawfulCellKey {
  generatorMask: number;
}

function generators(mask: number): number[] {
  const result: number[] = [];
  for (let generator = 0; generator < 3; generator += 1) {
    if ((mask & (1 << generator)) !== 0) result.push(generator);
  }
  return result;
}

function submasks(mask: number): number[] {
  const result: number[] = [];
  for (let value = mask; ; value = (value - 1) & mask) {
    result.push(value);
    if (value === 0) break;
  }
  return result.sort((left, right) => left - right);
}

function cubeOracle(
  unlawfulSquareIds: ReadonlySet<string>,
): GeneralizedLawfulCellOracle<CubeCell> {
  const sphericalTypes: GeneralizedLawfulSphericalType[] = Array.from(
    { length: 8 },
    (_, mask) => ({
      typeIndex: mask,
      generators: generators(mask),
      dimension: generators(mask).length,
    }),
  );
  const cellContaining = (typeIndex: number, point: number): CubeCell => ({
    typeIndex,
    generators: generators(typeIndex),
    generatorMask: typeIndex,
    representativePoint: point & ~typeIndex,
    dimension: generators(typeIndex).length,
  });
  const cellVertices = (cell: CubeCell): Uint32Array =>
    Uint32Array.from(
      submasks(cell.generatorMask).map(
        (submask) => cell.representativePoint | submask,
      ),
    );
  const forEachRankTwoFace = (
    cell: CubeCell,
    visitor: (face: CubeCell) => void,
  ): void => {
    if (cell.dimension < 2) return;
    if (cell.dimension === 2) {
      visitor(cell);
      return;
    }
    const seen = new Set<string>();
    for (let left = 0; left < cell.generators.length; left += 1) {
      for (let right = left + 1; right < cell.generators.length; right += 1) {
        const pairMask =
          (1 << cell.generators[left]) | (1 << cell.generators[right]);
        for (const point of cellVertices(cell)) {
          const face = cellContaining(pairMask, point);
          const id = generalizedLawfulCellId(face);
          if (!seen.has(id)) {
            seen.add(id);
            visitor(face);
          }
        }
      }
    }
  };
  const isRetained = (cell: CubeCell): boolean => {
    if (cell.dimension <= 1) return true;
    if (cell.dimension === 2) {
      return !unlawfulSquareIds.has(generalizedLawfulCellId(cell));
    }
    let retained = true;
    forEachRankTwoFace(cell, (face) => {
      retained &&= isRetained(face);
    });
    return retained;
  };
  const oracle: GeneralizedLawfulCellOracle<CubeCell> = {
    degree: 8,
    dimension: 3,
    sourceHash: "a1-cubed-regular-action",
    sphericalTypes,
    cellCountByDimension: { "0": 8, "1": 12, "2": 6, "3": 1 },
    cellContaining,
    cellVertices,
    forEachCell(typeIndex, visitor) {
      for (let point = 0; point < 8; point += 1) {
        if ((point & typeIndex) === 0)
          visitor(cellContaining(typeIndex, point));
      }
    },
    forEachFacet(cell, visitor) {
      for (const removed of cell.generators) {
        const facetMask = cell.generatorMask & ~(1 << removed);
        visitor(cellContaining(facetMask, cell.representativePoint));
        visitor(
          cellContaining(facetMask, cell.representativePoint | (1 << removed)),
        );
      }
    },
    forEachRankTwoFace,
    isRetained(cell) {
      return isRetained(cell);
    },
    neighbor(point, generator) {
      return point ^ (1 << generator);
    },
  };
  return oracle;
}

function inputs(
  unlawfulSquareIds: ReadonlySet<string>,
  calculationMode:
    | "compact-connectivity"
    | "full-simplices" = "compact-connectivity",
) {
  const oracle = cubeOracle(unlawfulSquareIds);
  return {
    oracle,
    candidateIndex: 0,
    candidateId: "cube-orientation",
    calculationMode,
    edgeIncrement(point: number, generator: number) {
      return (point & (1 << generator)) === 0 ? 1 : -1;
    },
    sourceChecks: {
      finiteConnectedQuotient: true,
      torsionFreeDavisQuotient: true,
      completeSphericalEnumeration: true,
      regularCoxeterCellQuotient: true,
      inheritedMoussongMetric: true,
    },
  } as const;
}

function certify(unlawfulSquareIds: ReadonlySet<string>) {
  return buildGeneralizedLawfulCertificate(inputs(unlawfulSquareIds));
}

describe("generalized coface-closed lawful certificate", () => {
  it("retains and pulls all higher cells when every rank-two face is lawful", () => {
    const certificate = certify(new Set());

    expect(certificate.status).toBe("completed");
    expect(certificate.retention.status).toBe("passed");
    expect(certificate.retention.retainedCellCountByDimension).toEqual({
      "0": 8,
      "1": 12,
      "2": 6,
      "3": 1,
    });
    expect(certificate.subdivision.status).toBe("passed");
    expect(certificate.subdivision.introducedVertexIds).toEqual([]);
    expect(certificate.subdivision.checks.sharedFacesCompatible).toBe(true);
    expect(certificate.height.status).toBe("passed");
    expect(certificate.height.cocycleScale).toBe("raw-integral-no-division");
    expect(certificate.height.checks.overlapConstantsIntegral).toBe(true);
    expect(certificate.directedLinks.checkedOriginalVertexCount).toBe(8);
    expect(certificate.directedLinks.declaredIntroducedVertexIds).toEqual([]);
    expect(certificate.asphericity.status).toBe("passed");
    expect(certificate.asphericity.metricFlagObstructionCount).toBe(0);
  });

  it("deletes all cofaces of an unlawful square and records the remote metric-flag obstruction", () => {
    const missingSquare = generalizedLawfulCellId({
      typeIndex: 3,
      generators: [0, 1],
      representativePoint: 0,
      dimension: 2,
    });
    const certificate = certify(new Set([missingSquare]));

    expect(certificate.retention.status).toBe("passed");
    expect(certificate.retention.retainedCellCountByDimension).toEqual({
      "0": 8,
      "1": 12,
      "2": 5,
    });
    expect(certificate.retention.discardedCellCountByDimension).toEqual({
      "2": 1,
      "3": 1,
    });
    expect(certificate.subdivision.status).toBe("passed");
    expect(certificate.height.status).toBe("passed");
    expect(certificate.asphericity.status).toBe("not-established");
    expect(certificate.asphericity.metricFlagObstructionCount).toBeGreaterThan(
      0,
    );
    expect(
      certificate.asphericity.obstructions.some(
        (obstruction) => obstruction.point >= 4,
      ),
    ).toBe(true);
    expect(
      certificate.asphericity.obstructions.some(
        (obstruction) =>
          obstruction.unlawfulRankTwoFaceCellId === missingSquare &&
          obstruction.unlawfulRankTwoFaceRepresentativePoint === 0,
      ),
    ).toBe(true);
  });

  it("rebuilds the calculation and rejects a tampered compact summary", () => {
    const options = inputs(new Set());
    const certificate = buildGeneralizedLawfulCertificate(options);
    expect(
      replayGeneralizedLawfulCertificate(options, certificate).status,
    ).toBe("passed");

    const altered = structuredClone(certificate);
    altered.directedLinks.vertexSummaries[0].ascendingComponentCount += 1;
    // Rehashing the outside cannot make altered mathematical data replay.
    altered.artifactHash = certificate.artifactHash;
    const replay = replayGeneralizedLawfulCertificate(options, altered);
    expect(replay.status).toBe("failed");
    expect(replay.checks.actionRootedReconstructionMatches).toBe(false);
  });

  it("gets the same directed-link connectivity invariants from compact and full modes", () => {
    const compact = buildGeneralizedLawfulCertificate(
      inputs(new Set(), "compact-connectivity"),
    );
    const full = buildGeneralizedLawfulCertificate(
      inputs(new Set(), "full-simplices"),
    );

    expect(compact.directedLinks.representation).toBe(
      "exact-connectivity-component-partitions",
    );
    expect(full.directedLinks.representation).toBe(
      "complete-maximal-simplices",
    );
    expect(
      compact.directedLinks.vertexSummaries.map((entry) => ({
        point: entry.point,
        ascendingVertexCount: entry.ascendingVertexCount,
        ascendingEdgeCount: entry.ascendingEdgeCount,
        ascendingComponentCount: entry.ascendingComponentCount,
        descendingVertexCount: entry.descendingVertexCount,
        descendingEdgeCount: entry.descendingEdgeCount,
        descendingComponentCount: entry.descendingComponentCount,
      })),
    ).toEqual(
      full.directedLinks.vertexSummaries.map((entry) => ({
        point: entry.point,
        ascendingVertexCount: entry.ascendingVertexCount,
        ascendingEdgeCount: entry.ascendingEdgeCount,
        ascendingComponentCount: entry.ascendingComponentCount,
        descendingVertexCount: entry.descendingVertexCount,
        descendingEdgeCount: entry.descendingEdgeCount,
        descendingComponentCount: entry.descendingComponentCount,
      })),
    );
  });

  it("can stop on an exact directed-link counterexample without claiming an exhaustive scan", () => {
    const certificate = buildGeneralizedLawfulCertificate({
      ...inputs(new Set(), "compact-connectivity"),
      linkScan: "stop-on-first-failure" as const,
    });

    expect(certificate.status).toBe("completed");
    expect(certificate.directedLinks.status).toBe("passed");
    expect(certificate.directedLinks.scanOutcome).toBe("counterexample-found");
    expect(certificate.directedLinks.checkedOriginalVertexCount).toBe(1);
    expect(
      certificate.directedLinks.checks.everyDeclaredSubdivisionVertexChecked,
    ).toBe(false);
    expect(certificate.directedLinks.morseCondition).toBe("not-established");
    expect(certificate.directedLinks.vertexSummaries[0]).toMatchObject({
      ascendingNonempty: true,
      ascendingConnected: true,
      descendingNonempty: false,
    });
    expect(certificate.directedLinks.errors).toContain(
      "A checked actual descending link is empty.",
    );
    expect(certificate.directedLinks.errors).not.toContain(
      "A checked actual ascending link is empty.",
    );
    expect(certificate.directedLinks.errors).not.toContain(
      "A checked nonempty actual ascending link is disconnected.",
    );
    expect(certificate.directedLinks.errors).not.toContain(
      "A checked nonempty actual descending link is disconnected.",
    );
    expect(certificate.directedLinks.errors).toContain(
      "The directed-link scan is not exhaustive; unwitnessed universal link conditions remain not established.",
    );
  });

  it("marks a point-construction exception as an incomplete failed scan", () => {
    const base = inputs(new Set(), "compact-connectivity");
    let calculationModeReads = 0;
    let directedLinkStage = false;
    let injected = false;
    const oracle: GeneralizedLawfulCellOracle<CubeCell> = {
      ...base.oracle,
      cellContaining(typeIndex, point) {
        if (directedLinkStage && !injected && point === 0) {
          injected = true;
          throw new Error("injected point-link failure");
        }
        return base.oracle.cellContaining(typeIndex, point);
      },
    };
    const options = {
      ...base,
      oracle,
      linkScan: "stop-on-first-failure" as const,
    };
    // The three stages read this option in order: subdivision, height, links.
    // The accessor confines the injected oracle fault to the link stage.
    Object.defineProperty(options, "calculationMode", {
      enumerable: true,
      get() {
        calculationModeReads += 1;
        if (calculationModeReads === 3) directedLinkStage = true;
        return "compact-connectivity" as const;
      },
    });

    const certificate = buildGeneralizedLawfulCertificate(options);

    expect(certificate.status).toBe("failed");
    expect(certificate.directedLinks.status).toBe("failed");
    expect(certificate.directedLinks.scanOutcome).toBe("incomplete");
    expect(certificate.directedLinks.checkedOriginalVertexCount).toBe(7);
    expect(certificate.directedLinks.errors).toContain(
      "Directed-link construction at q0 failed: injected point-link failure",
    );
  });

  it("binds the concrete streamed action, closure, and coorientation hashes", () => {
    const streamed = buildStreamedLawfulDavisOracle({
      system: {
        schemaVersion: 1,
        name: "A1 cubed streamed adapter test",
        rank: 3,
        generators: [0, 1, 2].map((generator) => ({
          id: `s${generator}`,
          label: `s${generator}`,
        })),
        coxeterMatrix: [
          [1, 2, 2],
          [2, 1, 2],
          [2, 2, 1],
        ],
      },
      generatorImages: [0, 1, 2].map((generator) =>
        Array.from({ length: 8 }, (_, point) => point ^ (1 << generator)),
      ),
    });
    const positiveSigns: Record<string, 1 | -1> = Object.fromEntries(
      streamed.walls.walls.map((wall) => [wall.id, 1] as const),
    );
    const positiveCandidate = {
      id: "all-positive-walls",
      wallSigns: positiveSigns,
    } as const;
    const otherSigns = { ...positiveSigns };
    otherSigns[streamed.walls.walls[0].id] = -1;
    const evaluation = streamed.bindCoorientations([positiveCandidate]);
    const reorderedEvaluation = streamed.bindCoorientations([
      { id: "other-wall-signs", wallSigns: otherSigns },
      positiveCandidate,
    ]);
    const input = { oracle: streamed, evaluation, candidateIndex: 0 } as const;
    const reorderedInput = {
      oracle: streamed,
      evaluation: reorderedEvaluation,
      candidateIndex: 1,
    } as const;
    const certificate = buildGeneralizedLawfulCertificateFromStreamed(input);
    const reorderedCertificate =
      buildGeneralizedLawfulCertificateFromStreamed(reorderedInput);
    const lightweight =
      buildGeneralizedLawfulClosureAndAsphericityFromStreamed(input);
    const reorderedLightweight =
      buildGeneralizedLawfulClosureAndAsphericityFromStreamed(reorderedInput);
    const pointReplay = computeGeneralizedLawfulDirectedLinkAtPointFromStreamed(
      {
        ...input,
        point: 3,
      },
    );
    const reorderedPointReplay =
      computeGeneralizedLawfulDirectedLinkAtPointFromStreamed({
        ...reorderedInput,
        point: 3,
      });

    expect(certificate.status).toBe("completed");
    expect(certificate.candidateIndex).toBe(0);
    expect(certificate.sourceHash).not.toBe(streamed.structureHash);
    expect(reorderedCertificate).toEqual(certificate);
    expect(reorderedLightweight).toEqual(lightweight);
    expect(reorderedPointReplay).toEqual(pointReplay);
    expect(pointReplay.sourceHash).toBe(lightweight.sourceHash);
    expect(certificate.retention.status).toBe("passed");
    expect(lightweight.retention.status).toBe("passed");
    expect(lightweight.retention.digestAlgorithm).toBe(
      "sha256-source-binding-v1",
    );
    expect(lightweight.retention.retainedCellCountByDimension).toEqual(
      certificate.retention.retainedCellCountByDimension,
    );
    expect(lightweight.asphericity.sourceCellSetDigest).toBe(
      lightweight.retention.cellSetDigest,
    );
    expect(lightweight.asphericity.status).toBe(certificate.asphericity.status);
    const pointSummary = certificate.directedLinks.vertexSummaries[3];
    expect(pointReplay.linkDigest).toBe(pointSummary.linkDigest);
    expect(pointReplay.ascending.componentCount).toBe(
      pointSummary.ascendingComponentCount,
    );
    expect(pointReplay.descending.componentCount).toBe(
      pointSummary.descendingComponentCount,
    );
    expect(
      replayGeneralizedLawfulCertificateFromStreamed(input, certificate).status,
    ).toBe("passed");
    expect(
      replayGeneralizedLawfulCertificateFromStreamed(
        reorderedInput,
        certificate,
      ).status,
    ).toBe("passed");
  });
});
