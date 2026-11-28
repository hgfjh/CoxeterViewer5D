import { describe, expect, it } from "vitest";
import { buildCoverCompression } from "../src/compression";
import {
  createWallCoorientation,
  evaluateLawfulSubcomplex,
  findWallSystem,
} from "../src/walls";
import { buildHatXScene } from "../src/app/compressedComplexScene";
import { buildWallScene } from "../src/app/wallScene";
import {
  atlasPolygonGeometry,
  buildCellAtlas,
  cellBoundaryText,
  cellsContaining,
  filterCellAtlas,
  type CellAtlasModel,
} from "../src/app/cellAtlasModel";
import IDEAL_3_CUBE from "../src/examples/ideal_hyperbolic_3_cube_m3.json";
import C44_SYSTEM from "../src/examples/compact_3_tetrahedron_c44_2233.json";
import {
  buildC44Psl27Cover,
  buildIdealHyperbolic3CubeS4Cover,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

const cube = buildCoverCompression(
  buildIdealHyperbolic3CubeS4Cover(IDEAL_3_CUBE as CoxeterSystemInput),
);

function allCells(model: CellAtlasModel) {
  return model.families.flatMap((family) => family.cells);
}

describe("cell atlas builder", () => {
  it("lists the 48 ideal-cube hexagons of bar X in 12 families of 4", () => {
    const atlas = buildCellAtlas({ cover: cube, complex: "bar-x" });
    expect(atlas.cellCount).toBe(48);
    expect(atlas.families).toHaveLength(12);
    for (const family of atlas.families) {
      expect(family.m).toBe(3);
      expect(family.cells).toHaveLength(4);
      expect(family.title).toBe(
        `${family.generatorLabels[0]}–${family.generatorLabels[1]}, m = 3 · 4 cells`,
      );
    }
    expect(atlas.families[0].title).toBe("t12–t13, m = 3 · 4 cells");
    expect(atlas.omittedBigonCount).toBe(0);
  });

  it("draws every cell as a closed 2m-cycle alternating its two generators", () => {
    const atlas = buildCellAtlas({ cover: cube, complex: "bar-x" });
    const edges = new Map(
      cube.barX.geometricEdges.map((edge) => [edge.id, edge]),
    );
    for (const cell of allCells(atlas)) {
      const n = cell.corners.length;
      expect(n).toBe(2 * cell.m);
      expect(cell.sides).toHaveLength(n);
      expect(new Set(cell.corners.map((c) => c.vertexId)).size).toBe(n);
      cell.sides.forEach((side, index) => {
        // Consecutive sides alternate s_i, s_j.
        expect(side.generator).not.toBe(cell.sides[(index + 1) % n].generator);
        expect(cell.generatorPair).toContain(side.generator);
        // Side k joins corner k to corner k+1 in bar X.
        const edge = edges.get(side.edgeId)!;
        const ends = [edge.sourceVertexId, edge.targetVertexId].sort();
        const corners = [
          cell.corners[index].vertexId,
          cell.corners[(index + 1) % n].vertexId,
        ].sort();
        expect(ends).toEqual(corners);
      });
    }
  });

  it("starts each boundary at its smallest vertex label, keeping the stored direction", () => {
    const atlas = buildCellAtlas({ cover: cube, complex: "bar-x" });
    const stored = new Map(cube.barX.relationCells.map((c) => [c.id, c]));
    for (const cell of allCells(atlas)) {
      const labels = cell.corners.map((corner) => corner.label);
      expect(labels[0]).toBe([...labels].sort()[0]);
      const original = [...stored.get(cell.id)!.boundaryOccurrences].sort(
        (a, b) => a.boundaryIndex - b.boundaryIndex,
      );
      const shift = original.findIndex(
        (o) => o.sourceVertexId === cell.corners[0].vertexId,
      );
      cell.sides.forEach((side, index) => {
        expect(side.edgeId).toBe(
          original[(shift + index) % original.length].edgeId,
        );
      });
    }
    const first = atlas.families[0].cells[0];
    expect(cellBoundaryText(first)).toMatch(
      /^((t12 t13 ){3}|(t13 t12 ){3})from \S+$/,
    );
  });

  it("uses the 3D scene cell ids so selection is shared", () => {
    const walls = findWallSystem(cube.barX);
    const barScene = buildWallScene(cube.barX, walls);
    const hatScene = buildHatXScene(cube.hatX);
    const barIds = new Set(
      allCells(buildCellAtlas({ cover: cube, complex: "bar-x" })).map(
        (c) => c.id,
      ),
    );
    const hatIds = new Set(
      allCells(buildCellAtlas({ cover: cube, complex: "hat-x" })).map(
        (c) => c.id,
      ),
    );
    expect(barIds).toEqual(new Set(barScene.cells.map((cell) => cell.id)));
    expect(hatIds).toEqual(new Set(hatScene.cells.map((cell) => cell.id)));
  });

  it("shows hat X lifted relation cells and counts the omitted bigons", () => {
    const atlas = buildCellAtlas({ cover: cube, complex: "hat-x" });
    expect(atlas.cellCount).toBe(288);
    expect(atlas.omittedBigonCount).toBe(144);
    expect(atlas.families.map((family) => family.cells.length)).toEqual(
      Array(12).fill(24),
    );
  });

  it("records the vertex and edge gluing used for hover highlighting", () => {
    const atlas = buildCellAtlas({ cover: cube, complex: "bar-x" });
    // 48 hexagons x 6 corners over 24 vertices: each vertex is in 12 cells.
    for (const vertex of cube.barX.vertices) {
      expect(atlas.vertexCellIds.get(vertex.id)).toHaveLength(12);
    }
    // 48 x 6 sides over 72 edges: each bar-X edge lies in 4 hexagons.
    for (const edge of cube.barX.geometricEdges) {
      expect(atlas.edgeCellIds.get(edge.id)).toHaveLength(4);
    }
    const vertex = cube.barX.vertices[0].id;
    const lit = cellsContaining(atlas, { kind: "vertex", id: vertex });
    expect(lit.size).toBe(12);
    for (const cell of allCells(atlas)) {
      expect(lit.has(cell.id)).toBe(
        cell.corners.some((corner) => corner.vertexId === vertex),
      );
    }
    const edge = cube.barX.geometricEdges[0].id;
    expect(cellsContaining(atlas, { kind: "edge", id: edge }).size).toBe(4);
    expect(cellsContaining(atlas, undefined).size).toBe(0);
  });

  it("filters by family and by vertex label", () => {
    const atlas = buildCellAtlas({ cover: cube, complex: "bar-x" });
    const family = atlas.families[3];
    const byFamily = filterCellAtlas(atlas, { familyId: family.id, text: "" });
    expect(byFamily).toHaveLength(1);
    expect(byFamily[0].cells).toHaveLength(4);

    const label = "(12)(34)";
    const byLabel = filterCellAtlas(atlas, { familyId: "all", text: label });
    const matched = byLabel.flatMap((f) => f.cells);
    expect(matched).toHaveLength(12);
    for (const cell of matched) {
      expect(cell.corners.some((corner) => corner.label === label)).toBe(true);
    }
    expect(
      filterCellAtlas(atlas, { familyId: "all", text: "no-such-vertex" }),
    ).toEqual([]);
  });

  it("marks lawful status, source and sink corners, discarded cells and the selected wall", () => {
    const walls = findWallSystem(cube.barX);
    const coorientation = createWallCoorientation(walls);
    const lawful = evaluateLawfulSubcomplex(cube.barX, coorientation);
    const wall = walls.walls[0];
    const atlas = buildCellAtlas({
      cover: cube,
      complex: "bar-x",
      wallSystem: walls,
      coorientation,
      lawfulSubcomplex: lawful,
      selectedWallId: wall.id,
    });
    expect(atlas.hasLawfulStatus).toBe(true);
    expect(atlas.discardedCellCount).toBe(lawful.discardedCellIds.length);
    const byId = new Map(lawful.cells.map((cell) => [cell.cellId, cell]));
    for (const cell of allCells(atlas)) {
      const evaluation = byId.get(cell.id)!;
      expect(cell.status?.lawful).toBe(evaluation.lawful);
      if (evaluation.lawful) {
        expect(cell.corners[cell.status!.sourceCorner!].vertexId).toBe(
          evaluation.sourceVertexId,
        );
        expect(cell.corners[cell.status!.sinkCorner!].vertexId).toBe(
          evaluation.sinkVertexId,
        );
        // Positive along the boundary from source to sink on both sides:
        // exactly two sign changes around the cycle.
        const signs = cell.sides.map((side) => side.directionAlongBoundary);
        const changes = signs.filter(
          (sign, index) => sign !== signs[(index + 1) % signs.length],
        ).length;
        expect(changes).toBe(2);
      }
      expect(cell.status?.discarded).toBe(
        lawful.discardedCellIds.includes(cell.id),
      );
      for (const side of cell.sides) {
        expect(side.inSelectedWall).toBe(wall.edgeIds.includes(side.edgeId));
      }
    }
    // Each crossing of the selected wall joins two dual sides of its cell.
    const crossings = allCells(atlas).flatMap((cell) =>
      cell.wallCrossings.map((crossing) => ({ cell, crossing })),
    );
    expect(crossings).toHaveLength(wall.crossingSegmentIds.length);
    for (const { cell, crossing } of crossings) {
      expect(cell.sides[crossing.fromSide].inSelectedWall).toBe(true);
      expect(cell.sides[crossing.toSide].inSelectedWall).toBe(true);
    }
  });

  it("covers C44 bar X: 364 cells in six families", () => {
    const c44 = buildCoverCompression(
      buildC44Psl27Cover(C44_SYSTEM as CoxeterSystemInput),
    );
    const atlas = buildCellAtlas({ cover: c44, complex: "bar-x" });
    expect(atlas.cellCount).toBe(364);
    expect(
      atlas.families.map((family) => [
        family.id,
        family.m,
        family.cells.length,
      ]),
    ).toEqual([
      ["0:1", 3, 56],
      ["0:2", 4, 42],
      ["0:3", 2, 84],
      ["1:2", 2, 84],
      ["1:3", 4, 42],
      ["2:3", 3, 56],
    ]);
    for (const cell of allCells(atlas)) {
      expect(cell.corners).toHaveLength(2 * cell.m);
    }
  });
});

describe("atlas polygon geometry", () => {
  it("places corner labels outside and generator labels inside the polygon", () => {
    for (const n of [4, 6, 8]) {
      const radius = 27 / Math.sin(Math.PI / n);
      const geometry = atlasPolygonGeometry(n, radius);
      expect(geometry.corners).toHaveLength(n);
      for (const corner of geometry.corners) {
        expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(radius);
        expect(Math.hypot(corner.labelX, corner.labelY)).toBeGreaterThan(
          radius,
        );
      }
      const apothem = radius * Math.cos(Math.PI / n);
      for (const side of geometry.sides) {
        expect(Math.hypot(side.labelX, side.labelY)).toBeLessThan(apothem);
      }
      // Corner 0 starts a horizontal top side, so every cell reads alike.
      expect(geometry.corners[0].y).toBeCloseTo(geometry.corners[1].y);
      expect(geometry.corners[0].x).toBeLessThan(geometry.corners[1].x);
      expect(geometry.corners[0].y).toBeLessThan(0);
      // Two corner labels at the same height must grow apart, not into each other.
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const a = geometry.corners[i];
          const b = geometry.corners[j];
          if (Math.abs(a.labelY - b.labelY) > 8) continue;
          const [leftOne, rightOne] = a.labelX < b.labelX ? [a, b] : [b, a];
          expect(leftOne.anchor).toBe("end");
          expect(rightOne.anchor).toBe("start");
        }
      }
    }
  });
});
