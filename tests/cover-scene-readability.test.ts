import { describe, expect, it } from "vitest";
import { buildCoverCompression } from "../src/compression";
import { parseQuotientComplex } from "../src/quotient";
import { createWallCoorientation, findWallSystem } from "../src/walls";
import {
  buildBarXScene,
  buildHatXScene,
  CROWDED_CELL_THRESHOLD,
} from "../src/app/compressedComplexScene";
import { buildWallScene } from "../src/app/wallScene";
import { crowdedCoverScene, depthCueRange } from "../src/render/SceneView";
import I2_5IdentityQuotient from "../src/examples/I2_5_identity_quotient.json";
import IDEAL_3_CUBE from "../src/examples/ideal_hyperbolic_3_cube_m3.json";
import { buildIdealHyperbolic3CubeS4Cover } from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

type Point = [number, number, number];

const ideal = buildCoverCompression(
  buildIdealHyperbolic3CubeS4Cover(IDEAL_3_CUBE as CoxeterSystemInput),
);
const decagon = buildCoverCompression(
  parseQuotientComplex(I2_5IdentityQuotient),
);

function distance(left: Point, right: Point): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

describe("cover-scene label policy", () => {
  it("labels no hat X edge until something is selected", () => {
    const scene = buildHatXScene(ideal.hatX);
    expect(scene.edges).toHaveLength(144);
    expect(scene.edges.some((edge) => edge.alwaysLabel)).toBe(false);
    expect(scene.edges.every((edge) => edge.suppressSemanticLabel)).toBe(true);
  });

  it("labels exactly the edges at the selected vertex and on the selected cell", () => {
    const vertexId = ideal.hatX.vertices[3].id;
    const cell = ideal.hatX.liftedRelationCells[7];
    const scene = buildHatXScene(ideal.hatX, {
      selectedVertexId: vertexId,
      selectedCellId: cell.id,
    });
    const expected = new Set([
      ...ideal.hatX.directedLiftEdges
        .filter(
          (edge) =>
            edge.sourceVertexId === vertexId ||
            edge.targetVertexId === vertexId,
        )
        .map((edge) => edge.id),
      ...cell.boundaryOccurrences.map((occurrence) => occurrence.edgeId),
    ]);
    expect(
      new Set(
        scene.edges.filter((edge) => edge.alwaysLabel).map((edge) => edge.id),
      ),
    ).toEqual(expected);
  });

  it("keeps every edge label in a small scene", () => {
    // The bar-X decagon has 10 edges, under SMALL_SCENE_EDGE_LIMIT.
    const scene = buildBarXScene(decagon.barX);
    expect(scene.edges.every((edge) => edge.alwaysLabel)).toBe(true);
    // hat X of the decagon: 20 lifted edges drawn as 10 merged rails.
    const hat = buildHatXScene(decagon.hatX);
    expect(hat.edges.every((edge) => edge.alwaysLabel)).toBe(true);
    // Its ten relation lifts share one vertex cycle and are drawn once.
    expect(hat.cells.filter((cell) => !cell.coincidentWithCellId)).toHaveLength(
      1,
    );
    expect(hat.cells.some((cell) => cell.outlineOnly)).toBe(false);
  });

  it("labels the selected wall's dual edges only in Selected wall mode", () => {
    const walls = findWallSystem(ideal.barX);
    const wall = walls.walls[0];
    const options = {
      selectedWallId: wall.id,
      coorientation: createWallCoorientation(walls),
      emphasisVertexId: null,
    };
    const allWalls = buildWallScene(ideal.barX, walls, {
      ...options,
      focusSelectedWall: false,
    });
    const selectedWall = buildWallScene(ideal.barX, walls, {
      ...options,
      focusSelectedWall: true,
    });
    const labelled = (scene: typeof allWalls) =>
      scene.edges
        .filter((edge) => !edge.drawingOnly && edge.alwaysLabel)
        .map((edge) => edge.id);
    expect(labelled(allWalls)).toEqual([]);
    expect(new Set(labelled(selectedWall))).toEqual(new Set(wall.edgeIds));
  });
});

describe("hat X generator bigons", () => {
  it("draws each bigon as one rail but keeps both lifted edges", () => {
    const scene = buildHatXScene(ideal.hatX);
    expect(new Set(scene.edges.map((edge) => edge.id))).toEqual(
      new Set(ideal.hatX.directedLiftEdges.map((edge) => edge.id)),
    );
    const byId = new Map(scene.edges.map((edge) => [edge.id, edge]));
    for (const edge of scene.edges) {
      expect(edge.visualOffset).toBe(0);
      // A merged rail carries both directions, so it has no arrowhead.
      expect(edge.hideArrow).toBe(true);
      const partner = byId.get(edge.bigonPartnerEdgeId!)!;
      expect(partner.bigonPartnerEdgeId).toBe(edge.id);
      expect([partner.source, partner.target]).toEqual([
        edge.target,
        edge.source,
      ]);
      expect(partner.generator).toBe(edge.generator);
    }
    // The degenerate bigon disks are never filled.
    expect(scene.cells.every((cell) => cell.boundaryNodeIds.length > 2)).toBe(
      true,
    );
  });

  it("splits the pair into two directed rails at the selected vertex", () => {
    const vertexId = ideal.hatX.vertices[0].id;
    const scene = buildHatXScene(ideal.hatX, { selectedVertexId: vertexId });
    const atVertex = scene.edges.filter(
      (edge) => edge.source === vertexId || edge.target === vertexId,
    );
    expect(atVertex).toHaveLength(12);
    for (const edge of atVertex) {
      expect(Math.abs(edge.visualOffset ?? 0)).toBeGreaterThan(0.05);
      expect(edge.hideArrow).toBeUndefined();
    }
    const unmerged = buildHatXScene(ideal.hatX, { mergeBigons: false });
    expect(
      unmerged.edges.every((edge) => Math.abs(edge.visualOffset ?? 0) > 0.05),
    ).toBe(true);
  });
});

describe("cell emphasis in crowded cover scenes", () => {
  it("draws coincident hat X lifts once and fills nothing without a selection", () => {
    const scene = buildHatXScene(ideal.hatX);
    expect(scene.cells).toHaveLength(288);
    const drawn = scene.cells.filter((cell) => !cell.coincidentWithCellId);
    // Six lifts of each of the 48 bar-X hexagons share one vertex cycle.
    expect(drawn).toHaveLength(48);
    expect(drawn.length).toBeGreaterThan(CROWDED_CELL_THRESHOLD);
    expect(drawn.every((cell) => cell.outlineOnly)).toBe(true);
    const ids = new Set(drawn.map((cell) => cell.id));
    expect(
      scene.cells.every(
        (cell) =>
          !cell.coincidentWithCellId || ids.has(cell.coincidentWithCellId),
      ),
    ).toBe(true);
  });

  it("fills the selected cell and the cells through the selected vertex", () => {
    const vertexId = ideal.barX.vertices[5].id;
    const selected = ideal.barX.relationCells.find(
      (cell) =>
        !cell.boundaryOccurrences.some(
          (occurrence) => occurrence.sourceVertexId === vertexId,
        ),
    )!;
    const scene = buildBarXScene(ideal.barX, {
      selectedVertexId: vertexId,
      selectedCellId: selected.id,
    });
    const filled = scene.cells.filter((cell) => !cell.outlineOnly);
    // Each vertex lies on one hexagon of each of the 12 order-3 pairs.
    expect(filled).toHaveLength(13);
    expect(filled.map((cell) => cell.id)).toContain(selected.id);
    expect(
      filled
        .filter((cell) => cell.id !== selected.id)
        .every((cell) => cell.boundaryNodeIds.includes(vertexId)),
    ).toBe(true);
  });

  it("fills every cell with cellEmphasis 'all' and in a family view", () => {
    expect(
      buildBarXScene(ideal.barX, { cellEmphasis: "all" }).cells.some(
        (cell) => cell.outlineOnly,
      ),
    ).toBe(false);
    expect(
      buildHatXScene(ideal.hatX, { cellEmphasis: "all" }).cells.some(
        (cell) => cell.outlineOnly,
      ),
    ).toBe(false);
    expect(
      buildBarXScene(ideal.barX, {
        relationFamily: [0, 1],
        spreadRelationCells: true,
      }).cells.some((cell) => cell.outlineOnly),
    ).toBe(false);
  });

  it("emphasises no vertex when emphasisVertexId is null", () => {
    const scene = buildBarXScene(ideal.barX, {
      selectedVertexId: ideal.barX.vertices[0].id,
      emphasisVertexId: null,
    });
    expect(scene.cells.every((cell) => cell.outlineOnly)).toBe(true);
    expect(scene.edges.some((edge) => edge.alwaysLabel)).toBe(false);
  });
});

describe("induced arrows and wall arcs", () => {
  const walls = findWallSystem(ideal.barX);
  const wall = walls.walls[0];
  const coorientation = createWallCoorientation(walls);

  it("draws arrowheads only on the selected wall's duals and at the emphasised vertex", () => {
    const vertexId = ideal.barX.vertices[2].id;
    const scene = buildWallScene(ideal.barX, walls, {
      selectedWallId: wall.id,
      coorientation,
      selectedVertexId: vertexId,
    });
    const exact = scene.edges.filter((edge) => !edge.drawingOnly);
    expect(exact.every((edge) => edge.directed)).toBe(true);
    const arrowIds = new Set(
      exact.filter((edge) => !edge.hideArrow).map((edge) => edge.id),
    );
    const expected = new Set([
      ...wall.edgeIds,
      ...exact
        .filter((edge) => edge.source === vertexId || edge.target === vertexId)
        .map((edge) => edge.id),
    ]);
    expect(arrowIds).toEqual(expected);

    const all = buildWallScene(ideal.barX, walls, {
      selectedWallId: wall.id,
      coorientation,
      inducedArrows: "all",
    });
    expect(
      all.edges.filter((edge) => !edge.drawingOnly).some((e) => e.hideArrow),
    ).toBe(false);
  });

  it("keeps every wall's arcs but draws only the selected wall bold", () => {
    const scene = buildWallScene(ideal.barX, walls, {
      selectedWallId: wall.id,
      coorientation,
      focusSelectedWall: false,
    });
    const arcs = scene.edges.filter((edge) => edge.drawingOnly);
    expect(arcs).toHaveLength(walls.crossingSegments.length);
    const selectedArcIds = new Set(
      wall.crossingSegmentIds.map((id) => `drawing:${id}`),
    );
    for (const arc of arcs) {
      const selected = selectedArcIds.has(arc.id);
      expect(arc.readabilityOverlay).toBe(selected);
      expect(arc.faint === true).toBe(!selected);
    }
  });
});

describe("reflection-orbit placement of the ideal-cube cover", () => {
  it("places compact gluing as the chamber orbit with well separated vertices", () => {
    const scene = buildBarXScene(ideal.barX);
    const positions = new Map(
      scene.nodes.map((node) => [node.id, node.position as Point]),
    );
    const edgeLengths = scene.edges.map((edge) =>
      distance(positions.get(edge.source)!, positions.get(edge.target)!),
    );
    const mean =
      edgeLengths.reduce((sum, value) => sum + value, 0) / edgeLengths.length;
    const points = [...positions.values()];
    let minimum = Number.POSITIVE_INFINITY;
    points.forEach((left, index) =>
      points.slice(index + 1).forEach((right) => {
        minimum = Math.min(minimum, distance(left, right));
      }),
    );
    expect(minimum / mean).toBeGreaterThan(0.5);
    expect(scene.warnings.join(" ")).toContain("16 of 48 are convex");
  });

  it("keeps every vertex in place from hat X to bar X", () => {
    const hat = buildHatXScene(ideal.hatX);
    const bar = buildBarXScene(ideal.barX);
    const hatPositions = new Map(
      hat.nodes.map((node) => [node.id, node.position as Point]),
    );
    for (const vertex of ideal.barX.vertices) {
      const barPoint = bar.nodes.find((node) => node.id === vertex.id)!
        .position as Point;
      expect(
        distance(barPoint, hatPositions.get(vertex.sourceHatVertexId)!),
      ).toBeLessThan(1e-9);
    }
  });
});

describe("depth cue", () => {
  it("fades only crowded topology scenes", () => {
    const hat = buildHatXScene(ideal.hatX);
    expect(
      crowdedCoverScene({ topologyMode: true, showCells: true, ...hat }),
    ).toBe(true);
    expect(
      crowdedCoverScene({ topologyMode: false, showCells: true, ...hat }),
    ).toBe(false);
    const small = buildBarXScene(decagon.barX);
    expect(
      crowdedCoverScene({ topologyMode: true, showCells: true, ...small }),
    ).toBe(false);
  });

  it("leaves the front untouched and blends the back partly into the background", () => {
    const { near, far } = depthCueRange(20, 5);
    expect(near).toBeGreaterThan(20);
    const backFactor = (20 + 5 - near) / (far - near);
    expect(backFactor).toBeGreaterThan(0.25);
    expect(backFactor).toBeLessThan(0.6);
  });
});
