import { describe, expect, it } from "vitest";
import { buildCoverCompression } from "../src/compression";
import {
  buildC44Psl27Cover,
  buildIdealHyperbolic3CubeS4Cover,
} from "../src/torsionFree";
import {
  buildUnitCell,
  gluingTag,
  unitCellMetrics,
  unitCellPointOfWord,
  type UnitCell,
} from "../src/davis/unitCell";
import {
  GLUING_TAG_PALETTE,
  buildUnitCellBase,
  buildUnitCellScene,
  obliqueCamera,
  unitCellBadge,
  unitCellInspectorSummary,
  unitCellRepresentativeWords,
  unitCellTagNodeId,
} from "../src/app/unitCellScene";
import { parseQuotientComplex } from "../src/quotient";
import IDEAL_3_CUBE from "../src/examples/ideal_hyperbolic_3_cube_m3.json";
import C44_SYSTEM from "../src/examples/compact_3_tetrahedron_c44_2233.json";
import I2_5_IDENTITY from "../src/examples/I2_5_identity_quotient.json";
import type { CoverCompressionResult } from "../src/compression";
import type { CoxeterSystemInput } from "../src/types";

const cube = buildCoverCompression(
  buildIdealHyperbolic3CubeS4Cover(IDEAL_3_CUBE as CoxeterSystemInput),
);
const cubeCell = buildUnitCell(cube.barX, unitCellRepresentativeWords(cube));

function edgeKey(a: string, b: string, generator: number) {
  return `${[a, b].sort().join("|")}|${generator}`;
}

/** Combinatorial invariants that hold for every cover. */
function expectUnitCellInvariants(
  cover: CoverCompressionResult,
  unit: UnitCell,
) {
  const { barX } = cover;
  const chamberById = new Map(unit.chambers.map((c) => [c.id, c]));
  const representatives = unit.chambers.filter(
    (c) => c.role === "representative",
  );

  // One representative per point, reached from the basepoint by its word.
  expect(representatives).toHaveLength(barX.vertices.length);
  expect(new Set(representatives.map((c) => c.pointId)).size).toBe(
    barX.vertices.length,
  );
  expect(chamberById.get(unit.basepointId)!.word).toEqual([]);
  for (const chamber of unit.chambers) {
    // A ghost lies over the same bar X vertex as its representative, i.e.
    // it is H-equivalent to it.
    expect(unitCellPointOfWord(barX, unit.basepointId, chamber.word)).toBe(
      chamber.pointId,
    );
  }

  // The search tree spans the Schreier graph, so D is connected.
  const tree = unit.edges.filter((edge) => edge.role === "tree");
  expect(tree).toHaveLength(barX.vertices.length - 1);
  const internal = unit.edges.filter((edge) => edge.role === "internal");
  expect(unit.gluingPairs).toHaveLength(
    barX.geometricEdges.length - tree.length - internal.length,
  );

  // Every bar X edge is either inside D or exactly two stubs with one tag.
  const insideByBarEdge = new Map(
    unit.edges
      .filter((edge) => edge.role === "tree" || edge.role === "internal")
      .map((edge) => [edge.barEdgeId!, edge]),
  );
  for (const barEdge of barX.geometricEdges) {
    const stubs = unit.stubs.filter((stub) => stub.barEdgeId === barEdge.id);
    if (insideByBarEdge.has(barEdge.id)) {
      expect(stubs).toHaveLength(0);
      continue;
    }
    expect(stubs).toHaveLength(2);
    expect(stubs[0].tag).toBe(stubs[1].tag);
    expect(stubs.map((stub) => stub.primed).sort()).toEqual([false, true]);
    expect(stubs[0].partnerStubId).toBe(stubs[1].id);
    expect(stubs[1].partnerStubId).toBe(stubs[0].id);
    for (const stub of stubs) {
      expect(chamberById.get(stub.fromChamberId)!.role).toBe("representative");
      const ghost = chamberById.get(stub.ghostChamberId)!;
      expect(ghost.role).toBe("ghost");
      // The ghost is H-equivalent to the representative of its point.
      expect(chamberById.get(ghost.pointId)!.role).toBe("representative");
    }
  }
  expect(unit.stubs).toHaveLength(2 * unit.gluingPairs.length);
  expect(new Set(unit.gluingPairs.map((pair) => pair.tag)).size).toBe(
    unit.gluingPairs.length,
  );

  // Every bar X relation cell is drawn exactly once, along its own boundary
  // word, through edges that the unit cell records.
  expect(unit.cells.map((cell) => cell.id).sort()).toEqual(
    barX.relationCells.map((cell) => cell.id).sort(),
  );
  const drawnEdges = new Set(
    unit.edges.map((edge) => edgeKey(edge.source, edge.target, edge.generator)),
  );
  const barCellById = new Map(barX.relationCells.map((c) => [c.id, c]));
  for (const cell of unit.cells) {
    const barCell = barCellById.get(cell.id)!;
    expect(cell.boundaryWord).toEqual(
      barCell.boundaryOccurrences.map((occurrence) => occurrence.generator),
    );
    expect(cell.boundaryChamberIds).toHaveLength(2 * cell.m);
    expect(chamberById.get(cell.boundaryChamberIds[0])!.role).toBe(
      "representative",
    );
    cell.boundaryChamberIds.forEach((id, k) => {
      expect(chamberById.get(id)!.pointId).toBe(
        barCell.boundaryOccurrences[k].sourceVertexId,
      );
      const next =
        cell.boundaryChamberIds[(k + 1) % cell.boundaryChamberIds.length];
      expect(drawnEdges.has(edgeKey(id, next, cell.boundaryWord[k]))).toBe(
        true,
      );
    });
  }
}

describe("unit cell of the ideal cube S4 cover", () => {
  it("has one chamber per coset and a gluing pair for every edge leaving D", () => {
    expect(cubeCell.index).toBe(24);
    expect(cubeCell.representatives).toBe("dirichlet");
    expect(cubeCell.distanceKind).toBe("hyperbolic");
    expectUnitCellInvariants(cube, cubeCell);
    expect(cubeCell.gluingPairs.slice(0, 3).map((pair) => pair.tag)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("chooses Dirichlet-type representatives", () => {
    const bfs = buildUnitCell(cube.barX, unitCellRepresentativeWords(cube), {
      representatives: "bfs",
    });
    expectUnitCellInvariants(cube, bfs);
    const dirichlet = unitCellMetrics(cubeCell);
    const breadthFirst = unitCellMetrics(bfs);
    // No ghost is nearer to e than the representative of its own point, and
    // the domain is no wider than the breadth-first one.
    expect(dirichlet.ghostsNotCloserThanRepresentative).toBe(1);
    expect(breadthFirst.ghostsNotCloserThanRepresentative).toBeLessThan(1);
    expect(dirichlet.maxRepresentativeDistance).toBeLessThan(
      breadthFirst.maxRepresentativeDistance,
    );
    // Representatives were accepted in distance order from e.
    const reps = cubeCell.chambers.filter((c) => c.role === "representative");
    expect(reps[0].word).toEqual([]);
    for (const chamber of reps) {
      expect(chamber.distance).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic", () => {
    const again = buildUnitCell(cube.barX, unitCellRepresentativeWords(cube));
    expect(again).toEqual(cubeCell);
  });

  it("draws every relation cell as a planar convex hexagon in the orbit layout", () => {
    const base = buildUnitCellBase(cube);
    expect(base.unavailableReason).toBeUndefined();
    expect(base.layoutKind).toBe("hyperbolic-orbit");
    for (const cell of base.unitCell!.cells) {
      const points = cell.boundaryChamberIds.map(
        (id) => base.positions.get(id)!,
      );
      expectPlanarConvex(points);
    }
  });

  it("names neighbouring copies h D with h in H", () => {
    expect(cubeCell.copies.length).toBeGreaterThan(0);
    for (const copy of cubeCell.copies) {
      // h fixes the basepoint coset, so h lies in H.
      expect(
        unitCellPointOfWord(cube.barX, cubeCell.basepointId, copy.elementWord),
      ).toBe(cubeCell.basepointId);
      expect(copy.chamberIds).toHaveLength(24);
    }
  });
});

describe("unit cell of the C44 PSL(2,7) cover", () => {
  it("has 336 chambers and satisfies the gluing invariants", () => {
    const c44 = buildCoverCompression(
      buildC44Psl27Cover(C44_SYSTEM as CoxeterSystemInput),
    );
    const unit = buildUnitCell(c44.barX, unitCellRepresentativeWords(c44));
    expect(unit.index).toBe(336);
    expectUnitCellInvariants(c44, unit);
    const metrics = unitCellMetrics(unit);
    expect(metrics.cellsInside + metrics.cellsCrossing).toBe(364);
    expect(metrics.cellsInside).toBeGreaterThan(0);
    // The adjacency requirement can leave a few ghosts nearer than their
    // representative; the domain is still almost exactly Dirichlet.
    expect(metrics.ghostsNotCloserThanRepresentative).toBeGreaterThan(0.99);
  });
});

describe("unit cell of a finite group (trivial H)", () => {
  it("is the whole group with no gluings", () => {
    const cover = buildCoverCompression(parseQuotientComplex(I2_5_IDENTITY));
    const base = buildUnitCellBase(cover);
    expect(base.layoutKind).toBe("tits-orbit");
    expect(base.unitCell!.distanceKind).toBe("tits-euclidean");
    expect(base.unitCell!.index).toBe(10);
    expect(base.unitCell!.stubs).toEqual([]);
    expect(base.unitCell!.cells).toHaveLength(1);
    expect(base.unitCell!.cells[0].outsideChamberIds).toEqual([]);
  });
});

describe("unit cell scene", () => {
  const base = buildUnitCellBase(cube);
  const unit = base.unitCell!;

  it("labels domain vertices, ghosts and gluing stubs", () => {
    const scene = buildUnitCellScene(base, { showCopies: false });
    const rep = scene.nodes.find((node) => node.id === unit.basepointId)!;
    expect(rep.label).toBe(base.labelByPoint.get(unit.basepointId));
    const ghost = scene.nodes.find(
      (node) => node.id === unit.stubs[0].ghostChamberId,
    )!;
    expect(ghost.ghost).toBe(true);
    expect(ghost.label).toMatch(/^≡ /);
    const tags = scene.nodes.filter((node) => node.id.startsWith("uc:tag:"));
    expect(tags).toHaveLength(unit.stubs.length);
    expect(tags.map((node) => node.label)).toContain("a′");
    expect(scene.cells).toHaveLength(48);
    expect(unitCellBadge(base)).toBe(
      `Unit cell: 24 chambers, ${unit.gluingPairs.length} gluing pairs`,
    );
    // Copies are hidden by default and only add drawing-only geometry.
    const withCopies = buildUnitCellScene(base, { showCopies: true });
    expect(withCopies.nodes.length).toBeGreaterThan(scene.nodes.length);
    expect(
      withCopies.nodes
        .filter((node) => !scene.nodes.some((other) => other.id === node.id))
        .every((node) => node.drawingOnly),
    ).toBe(true);
  });

  it("highlights the ghosts of a selected vertex and the partner of a selected stub", () => {
    const ghostPoint = unit.chambers.find((c) => c.role === "ghost")!.pointId;
    const scene = buildUnitCellScene(base, {
      showCopies: false,
      selectedNodeId: ghostPoint,
    });
    const echoes = scene.nodes.filter(
      (node) => node.label?.startsWith("≡ ") && node.alwaysLabel,
    );
    expect(echoes.length).toBeGreaterThan(0);
    expect(
      echoes.every(
        (node) =>
          node.label === `≡ ${base.labelByPoint.get(ghostPoint)}` &&
          node.ghost === false,
      ),
    ).toBe(true);

    const stub = unit.stubs[0];
    const stubScene = buildUnitCellScene(base, {
      showCopies: false,
      selectedNodeId: unitCellTagNodeId(stub.id),
    });
    const highlighted = stubScene.edges
      .filter((edge) => edge.readabilityOverlay)
      .map((edge) => edge.id)
      .sort();
    expect(highlighted).toEqual([stub.id, stub.partnerStubId].sort());
    const summary = unitCellInspectorSummary(base, {
      selectedEdgeId: stub.id,
    })!;
    expect(summary.reason).toMatch(/^Glued to a′ .* by an element of H/);
  });

  it("explains ghosts and the view in the inspector", () => {
    const ghost = unit.chambers.find((c) => c.role === "ghost")!;
    const summary = unitCellInspectorSummary(base, {
      selectedNodeId: ghost.id,
    })!;
    expect(summary.selected).toBe(
      `A ghost chamber: H-equivalent to ${base.labelByPoint.get(ghost.pointId)}; it lies outside the unit cell.`,
    );
    const view = unitCellInspectorSummary(base, {})!;
    expect(view.status).toBe(
      "Fundamental domain of H: one chamber per coset, the one nearest the base chamber e (a Dirichlet-type domain grown outward from e). Positions are the reflection orbit (a drawing of the universal cover); gluings are exact.",
    );
  });

  it("frames D with an oblique camera", () => {
    const { target, offset } = base.camera!;
    const reps = unit.chambers
      .filter((c) => c.role === "representative")
      .map((c) => base.positions.get(c.id)!);
    const radius = Math.max(
      ...reps.map((p) =>
        Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]),
      ),
    );
    const distance = Math.hypot(...offset);
    expect(distance).toBeGreaterThan(2 * radius);
    // Not straight down a coordinate axis.
    for (const component of offset) {
      expect(Math.abs(component) / distance).toBeLessThan(0.95);
    }
    expect(obliqueCamera(reps)).toEqual(base.camera);
  });

  it("lifts gluing-tag colours on the dark canvas", () => {
    const light = buildUnitCellScene(base, { showCopies: false });
    const dark = buildUnitCellScene(base, {
      showCopies: false,
      colorScheme: "dark",
    });
    const tagColour = (scene: typeof light) =>
      scene.nodes.find((node) => node.id.startsWith("uc:tag:"))!.colorHint;
    expect(tagColour(light)).toBe(GLUING_TAG_PALETTE.light[0]);
    expect(tagColour(dark)).toBe(GLUING_TAG_PALETTE.dark[0]);
  });
});

describe("gluing tags", () => {
  it("run a..z, skipping e, then a1..z1", () => {
    expect(gluingTag(0)).toBe("a");
    expect(gluingTag(4)).toBe("f");
    expect(gluingTag(24)).toBe("z");
    expect(gluingTag(25)).toBe("a1");
    expect(gluingTag(51)).toBe("b2");
  });
});

type P3 = [number, number, number];

function sub(a: P3, b: P3): P3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: P3, b: P3): P3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function dot(a: P3, b: P3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Planar to 1e-6 of the polygon's size, and every corner turns the same way. */
function expectPlanarConvex(points: P3[]) {
  const n = points.length;
  // Newell normal.
  const normal: P3 = [0, 0, 0];
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
    normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
    normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const length = Math.hypot(...normal);
  const unit: P3 = [normal[0] / length, normal[1] / length, normal[2] / length];
  const size = Math.max(...points.map((p) => Math.hypot(...sub(p, points[0]))));
  for (const point of points) {
    expect(Math.abs(dot(sub(point, points[0]), unit))).toBeLessThan(
      1e-6 * size,
    );
  }
  for (let i = 0; i < n; i += 1) {
    const turn = cross(
      sub(points[(i + 1) % n], points[i]),
      sub(points[(i + 2) % n], points[(i + 1) % n]),
    );
    expect(dot(turn, unit)).toBeGreaterThan(0);
  }
}
