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
import C44_SYSTEM from "../src/examples/compact_3_tetrahedron_c44_2233.json";
import {
  buildC44Psl27Cover,
  buildIdealHyperbolic3CubeS4Cover,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

type Point = [number, number, number];

function scenePositions(
  nodes: ReadonlyArray<{ id: string; position?: Point }>,
): Map<string, Point> {
  return new Map(
    nodes
      .filter((node) => node.position)
      .map((node) => [node.id, node.position!] as const),
  );
}

function distance(left: Point, right: Point): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function centroid(points: readonly Point[]): Point {
  return [0, 1, 2].map(
    (axis) =>
      points.reduce((sum, point) => sum + point[axis], 0) / points.length,
  ) as Point;
}

/** Newell normal; defined for non-planar cycles as well. */
function cycleNormal(points: readonly Point[]): Point {
  const normal: Point = [0, 0, 0];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    normal[0] += (point[1] - next[1]) * (point[2] + next[2]);
    normal[1] += (point[2] - next[2]) * (point[0] + next[0]);
    normal[2] += (point[0] - next[0]) * (point[1] + next[1]);
  });
  const length = Math.hypot(...normal);
  return normal.map((value) => value / length) as Point;
}

function distanceToPlane(point: Point, cycle: readonly Point[]): number {
  const centre = centroid(cycle);
  const normal = cycleNormal(cycle);
  return Math.abs(
    (point[0] - centre[0]) * normal[0] +
      (point[1] - centre[1]) * normal[1] +
      (point[2] - centre[2]) * normal[2],
  );
}

function planarityResidual(cycle: readonly Point[]): number {
  return Math.max(...cycle.map((point) => distanceToPlane(point, cycle)));
}

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

  it("fills all 48 ideal-cube disks inside their own cycles on one skeleton", () => {
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
    // No detached copy: a fill is spanned only by its true boundary vertices.
    expect(
      scene.cells.every(
        (cell) =>
          cell.drawingInteriorPoint === undefined &&
          cell.drawingInteriorRing === undefined,
      ),
    ).toBe(true);
    const positions = scenePositions(scene.nodes);
    for (const cell of scene.cells) {
      const source = idealCover.barX.relationCells.find(
        (candidate) => candidate.id === cell.id,
      )!;
      expect(cell.boundaryNodeIds).toEqual(
        source.boundaryOccurrences.map(
          (occurrence) => occurrence.sourceVertexId,
        ),
      );
      // S4 acts on R^3 by reflections, so every attaching cycle is flat.
      expect(
        planarityResidual(cell.boundaryNodeIds.map((id) => positions.get(id)!)),
      ).toBeLessThan(1e-6);
    }
    expect(scene.wallSegmentCount).toBe(0);
    expect(scene.warnings.join(" ")).toContain("shared quotient 1-skeleton");
    expect(scene.warnings.join(" ")).toContain("chamber orbit");
    expect(scene.warnings.join(" ")).not.toContain("repeated");
  });

  it("lays out every C44 relation family as disjoint regular polygons", () => {
    const system = C44_SYSTEM as CoxeterSystemInput;
    const c44 = buildCoverCompression(buildC44Psl27Cover(system));
    for (const [pair, sides, count] of [
      [[0, 1], 6, 56],
      [[0, 2], 8, 42],
      [[0, 3], 4, 84],
    ] as const) {
      const scene = buildBarXScene(c44.barX, {
        relationFamily: [pair[0], pair[1]],
        spreadRelationCells: true,
      });
      expect(scene.cells).toHaveLength(count);
      expect(scene.nodes).toHaveLength(336);
      const positions = scenePositions(scene.nodes);
      const discs = scene.cells.map((cell) => {
        const points = cell.boundaryNodeIds.map((id) => positions.get(id)!);
        expect(points).toHaveLength(sides);
        const sideLengths = points.map((point, index) =>
          distance(point, points[(index + 1) % points.length]),
        );
        expect(
          Math.max(...sideLengths) - Math.min(...sideLengths),
        ).toBeLessThan(1e-9);
        expect(planarityResidual(points)).toBeLessThan(1e-9);
        const centre = centroid(points);
        return {
          centre,
          radius: Math.max(...points.map((point) => distance(point, centre))),
        };
      });
      // Before the fix, counts other than 4 were stacked on one sphere.
      for (let left = 0; left < discs.length; left += 1) {
        for (let right = left + 1; right < discs.length; right += 1) {
          expect(
            distance(discs[left].centre, discs[right].centre),
          ).toBeGreaterThan(discs[left].radius + discs[right].radius);
        }
      }
      expect(scene.warnings.join(" ")).not.toContain("share boundary vertices");
    }
  });

  it("bends non-boundary chords off the cell plane in a family view", () => {
    const idealCover = buildCoverCompression(
      buildIdealHyperbolic3CubeS4Cover(IDEAL_3_CUBE as CoxeterSystemInput),
    );
    const scene = buildBarXScene(idealCover.barX, {
      relationFamily: [0, 1],
      spreadRelationCells: true,
    });
    const positions = scenePositions(scene.nodes);
    const chords = scene.edges.filter((edge) => edge.drawingControlPoint);
    // Each <t12, t13> hexagon carries three t23 diagonals.
    expect(chords).toHaveLength(12);
    expect(chords.every((edge) => edge.generator === 3)).toBe(true);
    for (const chord of chords) {
      const cell = scene.cells.find(
        (candidate) =>
          candidate.boundaryNodeIds.includes(chord.source) &&
          candidate.boundaryNodeIds.includes(chord.target),
      )!;
      const points = cell.boundaryNodeIds.map((id) => positions.get(id)!);
      expect(
        distanceToPlane(chord.drawingControlPoint!, points),
      ).toBeGreaterThan(0.5);
    }
    expect(scene.warnings.join(" ")).toContain("bent off the cell plane");
  });

  it("styles selected-wall dual edges apart from relation boundaries", () => {
    const walls = findWallSystem(cover.barX);
    const selected = walls.walls[0];
    const scene = buildWallScene(cover.barX, walls, {
      selectedWallId: selected.id,
    });
    const dual = scene.edges.filter(
      (edge) => edge.emphasisRole === "wall-dual",
    );
    expect(new Set(dual.map((edge) => edge.id))).toEqual(
      new Set(selected.edgeIds),
    );
    expect(dual.every((edge) => edge.emphasis !== "readable-boundary")).toBe(
      true,
    );

    const idealCover = buildCoverCompression(
      buildIdealHyperbolic3CubeS4Cover(IDEAL_3_CUBE as CoxeterSystemInput),
    );
    const family = buildBarXScene(idealCover.barX, {
      relationFamily: [0, 1],
      spreadRelationCells: true,
    });
    const boundary = family.edges.filter(
      (edge) => edge.emphasis === "readable-boundary",
    );
    expect(boundary).toHaveLength(24);
    expect(
      boundary.every((edge) => edge.emphasisRole === "relation-boundary"),
    ).toBe(true);
  });
});
