import { describe, expect, it } from "vitest";
import { buildCoverCompression } from "../src/compression";
import { parseQuotientComplex } from "../src/quotient";
import {
  createWallCoorientation,
  evaluateLawfulSubcomplex,
  findWallSystem,
} from "../src/walls";
import {
  buildHatXScene,
  buildBarXScene,
} from "../src/app/compressedComplexScene";
import { buildWallScene } from "../src/app/wallScene";
import I2_5IdentityQuotient from "../src/examples/I2_5_identity_quotient.json";
import IDEAL_3_CUBE from "../src/examples/ideal_hyperbolic_3_cube_m3.json";
import { buildIdealHyperbolic3CubeS4Cover } from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

describe("hat X and bar X scene adapters", () => {
  const cover = buildCoverCompression(
    parseQuotientComplex(I2_5IdentityQuotient),
  );

  it("keeps every exact cover edge and relation lift in the hat-X scene", () => {
    const scene = buildHatXScene(cover.hatX);
    expect(scene.nodes).toHaveLength(10);
    expect(scene.edges).toHaveLength(20);
    expect(scene.cells).toHaveLength(10);
    expect(new Set(scene.edges.map((edge) => edge.id))).toEqual(
      new Set(cover.hatX.directedLiftEdges.map((edge) => edge.id)),
    );
    expect(scene.inventory.generatorBigons).toBe(20);
  });

  it("draws the compressed decagon without changing signed incidence", () => {
    const before = JSON.stringify(cover.barX);
    const scene = buildBarXScene(cover.barX);
    expect(scene.nodes).toHaveLength(10);
    expect(scene.edges).toHaveLength(10);
    expect(scene.cells).toHaveLength(1);
    expect(scene.cells[0].boundaryNodeIds).toEqual(
      cover.barX.relationCells[0].boundaryOccurrences.map(
        (occurrence) => occurrence.sourceVertexId,
      ),
    );
    expect(
      new Set(scene.nodes.map((node) => node.position?.join(","))).size,
    ).toBe(10);
    expect(JSON.stringify(cover.barX)).toBe(before);
  });

  it("adds wall midpoint graphics without relabeling them as exact vertices", () => {
    const walls = findWallSystem(cover.barX);
    const coorientation = createWallCoorientation(walls);
    const lawful = evaluateLawfulSubcomplex(cover.barX, coorientation);
    const scene = buildWallScene(cover.barX, walls, {
      selectedWallId: walls.walls[0].id,
      coorientation,
      lawfulSubcomplex: lawful,
    });
    const exactNodes = scene.nodes.filter((node) => !node.drawingOnly);
    const drawingNodes = scene.nodes.filter((node) => node.drawingOnly);
    const exactEdges = scene.edges.filter((edge) => !edge.drawingOnly);
    const wallSegments = scene.edges.filter((edge) => edge.drawingOnly);
    expect(exactNodes).toHaveLength(10);
    expect(exactEdges).toHaveLength(10);
    expect(drawingNodes).toHaveLength(10);
    expect(wallSegments).toHaveLength(5);
    expect(
      drawingNodes.every((node) => !node.label && !node.compactLabel),
    ).toBe(true);
    expect(scene.cells[0].boundaryNodeIds).toEqual(
      cover.barX.relationCells[0].boundaryOccurrences.map(
        (occurrence) => occurrence.sourceVertexId,
      ),
    );
  });

  it("treats an induced-link lens as appearance without losing exact edges", () => {
    const walls = findWallSystem(cover.barX);
    const coorientation = createWallCoorientation(walls);
    const selectedVertexId = cover.barX.vertices[0].id;
    const scene = buildWallScene(cover.barX, walls, {
      coorientation,
      selectedVertexId,
      linkLens: "ascending",
    });
    const exactEdges = scene.edges.filter((edge) => !edge.drawingOnly);
    expect(exactEdges).toHaveLength(cover.barX.geometricEdges.length);
    for (const edge of exactEdges) {
      const belongsToAscendingLink =
        edge.directed === true && edge.source === selectedVertexId;
      expect(edge.ghost).toBe(!belongsToAscendingLink);
    }
    expect(
      scene.nodes
        .filter((node) => node.drawingOnly)
        .every((node) => node.ghost),
    ).toBe(true);
    expect(
      scene.edges
        .filter((edge) => edge.drawingOnly)
        .every((edge) => edge.ghost),
    ).toBe(true);
  });

  it("can hide relation surfaces without removing the exact one-skeleton", () => {
    const walls = findWallSystem(cover.barX);
    const scene = buildWallScene(cover.barX, walls, {
      showRelationCells: false,
    });
    expect(scene.cells).toHaveLength(0);
    expect(scene.edges.filter((edge) => !edge.drawingOnly)).toHaveLength(
      cover.barX.geometricEdges.length,
    );
  });

  it("spreads one ideal-cube family as four exact hexagons on the shared skeleton", () => {
    const idealCover = buildCoverCompression(
      buildIdealHyperbolic3CubeS4Cover(IDEAL_3_CUBE as CoxeterSystemInput),
    );
    const before = JSON.stringify(idealCover.barX);
    const scene = buildBarXScene(idealCover.barX, {
      relationFamily: [0, 1],
      spreadRelationCells: true,
    });

    expect(scene.nodes).toHaveLength(24);
    expect(scene.cells).toHaveLength(4);
    expect(scene.edges).toHaveLength(72);
    expect(scene.cells.every((cell) => cell.boundaryNodeIds.length === 6)).toBe(
      true,
    );
    expect(scene.nodes.every((node) => !node.drawingOnly)).toBe(true);
    expect(scene.cells.every((cell) => !cell.drawingOnly)).toBe(true);
    expect(
      scene.cells.every(
        (cell) =>
          cell.drawingInteriorPoint === undefined &&
          cell.drawingInteriorRing === undefined,
      ),
    ).toBe(true);
    expect(scene.edges.every((edge) => !edge.drawingOnly)).toBe(true);
    expect(scene.edges.every((edge) => edge.readabilityOverlay)).toBe(true);
    expect(new Set(scene.cells.map((cell) => cell.sourceCellId))).toEqual(
      new Set(
        idealCover.barX.relationCells
          .filter((cell) => cell.generatorPair.join(":") === "0:1")
          .map((cell) => cell.id),
      ),
    );
    const boundaryEdgeIds = new Set(
      idealCover.barX.relationCells
        .filter((cell) => cell.generatorPair.join(":") === "0:1")
        .flatMap((cell) =>
          cell.boundaryOccurrences.map((occurrence) => occurrence.edgeId),
        ),
    );
    expect(boundaryEdgeIds.size).toBe(24);
    expect(
      scene.edges
        .filter((edge) => boundaryEdgeIds.has(edge.id))
        .every(
          (edge) =>
            edge.ghost !== true &&
            edge.emphasis === "readable-boundary" &&
            edge.alwaysLabel === true &&
            edge.suppressSemanticLabel !== true,
        ),
    ).toBe(true);
    const gluingContext = scene.edges.filter(
      (edge) => !boundaryEdgeIds.has(edge.id) && edge.ghost,
    );
    expect(gluingContext).toHaveLength(48);
    expect(
      gluingContext.every(
        (edge) =>
          edge.alwaysLabel === false &&
          edge.suppressSemanticLabel === true &&
          edge.colorHint === "#94a3b8",
      ),
    ).toBe(true);

    const positions = new Map(
      scene.nodes
        .filter((node) => node.position)
        .map((node) => [node.id, node.position!] as const),
    );
    for (const cell of scene.cells) {
      const lengths = cell.boundaryNodeIds.map((nodeId, index, boundary) => {
        const source = positions.get(nodeId)!;
        const target = positions.get(boundary[(index + 1) % boundary.length])!;
        return Math.hypot(
          source[0] - target[0],
          source[1] - target[1],
          source[2] - target[2],
        );
      });
      expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(1e-9);
    }
    expect(JSON.stringify(idealCover.barX)).toBe(before);
  });

  it("fans all 48 ideal-cube disks from one exact quotient skeleton", () => {
    const idealCover = buildCoverCompression(
      buildIdealHyperbolic3CubeS4Cover(IDEAL_3_CUBE as CoxeterSystemInput),
    );
    const scene = buildWallScene(
      idealCover.barX,
      findWallSystem(idealCover.barX),
      { spreadRelationCells: true, showWalls: true },
    );

    expect(scene.nodes).toHaveLength(24);
    expect(scene.cells).toHaveLength(48);
    expect(scene.edges).toHaveLength(72);
    expect(scene.nodes.every((node) => !node.drawingOnly)).toBe(true);
    expect(scene.edges.every((edge) => !edge.drawingOnly)).toBe(true);
    expect(scene.cells.every((cell) => !cell.drawingOnly)).toBe(true);
    expect(scene.edges.every((edge) => edge.alwaysLabel)).toBe(true);
    expect(
      new Set(scene.cells.map((cell) => cell.drawingInteriorPoint?.join(",")))
        .size,
    ).toBe(48);
    for (const cell of scene.cells) {
      expect(cell.boundaryNodeIds).toHaveLength(6);
      expect(cell.drawingInteriorPoint).toBeDefined();
      expect(cell.drawingInteriorRing).toHaveLength(6);
      const source = idealCover.barX.relationCells.find(
        (candidate) => candidate.id === cell.id,
      )!;
      expect(cell.boundaryNodeIds).toEqual(
        source.boundaryOccurrences.map(
          (occurrence) => occurrence.sourceVertexId,
        ),
      );
    }
    expect(scene.wallSegmentCount).toBe(0);
    expect(scene.warnings.join(" ")).toContain("shared quotient 1-skeleton");
    expect(scene.warnings.join(" ")).not.toContain("repeated");
  });
});
