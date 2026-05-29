import { describe, expect, it } from "vitest";

import A3 from "../public/examples/A3.json";
import I2_5 from "../public/examples/I2_5.json";
import { generateViewerBall } from "../src/app/generationPipeline";
import {
  baseOrbicomplexForSystem,
  quotientToGeneratedBall,
} from "../src/app/viewerDataset";
import {
  buildYGammaCellAtlas,
  isYGammaBaseComplex,
} from "../src/app/yGammaAtlas";
import { buildYGamma2SkeletonScene } from "../src/app/yGammaScene";
import {
  buildLocalNeighborhoodExport,
  cellBoundaryEdgeKeys,
  cellNeighborhoodNodeIds,
  compactWordLabel,
  computeLocalChamber3DLayout,
  computeLocalLayout,
  generatorStepOptions,
  pairKey,
  polygonLabelForM,
  parsePairKey,
  rankTwoPairDiagnostics,
  relationWalkEntries,
  wordBreadcrumb,
} from "../src/app/localView";
import { groupWarnings } from "../src/app/viewStory";
import type { CoxeterSystemInput } from "../src/types";

const createdAt = "2026-01-01T00:00:00.000Z";

function finitePairKeys(
  system: CoxeterSystemInput,
  predicate: (m: number, pair: [number, number]) => boolean = () => true,
) {
  const keys: string[] = [];
  for (let i = 0; i < system.rank; i += 1) {
    for (let j = i + 1; j < system.rank; j += 1) {
      const entry = system.coxeterMatrix[i]?.[j];
      if (typeof entry === "number" && predicate(entry, [i, j])) {
        keys.push(pairKey([i, j]));
      }
    }
  }
  return keys.sort();
}

function centroid3(
  points: Array<[number, number, number]>,
): [number, number, number] | undefined {
  if (points.length === 0) {
    return undefined;
  }
  const sum = points.reduce<[number, number, number]>(
    (total, point) => [
      total[0] + point[0],
      total[1] + point[1],
      total[2] + point[2],
    ],
    [0, 0, 0],
  );
  return [
    sum[0] / points.length,
    sum[1] / points.length,
    sum[2] / points.length,
  ];
}

function subtract3(
  left: [number, number, number],
  right: [number, number, number],
): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot3(left: [number, number, number], right: [number, number, number]) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross3(
  left: [number, number, number],
  right: [number, number, number],
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize3(
  vector: [number, number, number],
): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return length > 1e-9
    ? [vector[0] / length, vector[1] / length, vector[2] / length]
    : [1, 0, 0];
}

function isSimpleProjectedPolygon(
  points: Array<[number, number, number]>,
): boolean {
  const center = centroid3(points);
  if (!center || points.length < 3) {
    return false;
  }
  let normal: [number, number, number] = [0, 0, 0];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    normal = [
      normal[0] + (current[1] - next[1]) * (current[2] + next[2]),
      normal[1] + (current[2] - next[2]) * (current[0] + next[0]),
      normal[2] + (current[0] - next[0]) * (current[1] + next[1]),
    ];
  }
  if (Math.hypot(normal[0], normal[1], normal[2]) < 1e-9) {
    return false;
  }
  const basisZ = normalize3(normal);
  const basisX = normalize3(subtract3(points[0], center));
  const basisY = normalize3(cross3(basisZ, basisX));
  const projected = points.map((point): [number, number] => {
    const relative = subtract3(point, center);
    return [dot3(relative, basisX), dot3(relative, basisY)];
  });

  for (let left = 0; left < projected.length; left += 1) {
    const leftNext = (left + 1) % projected.length;
    for (let right = left + 1; right < projected.length; right += 1) {
      const rightNext = (right + 1) % projected.length;
      const adjacent =
        left === right ||
        leftNext === right ||
        rightNext === left ||
        (left === 0 && right === projected.length - 1);
      if (adjacent) {
        continue;
      }
      if (
        segmentsProperlyIntersect(
          projected[left],
          projected[leftNext],
          projected[right],
          projected[rightNext],
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

function segmentsProperlyIntersect(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): boolean {
  const orient = (
    p: [number, number],
    q: [number, number],
    r: [number, number],
  ) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = orient(a, b, c);
  const abD = orient(a, b, d);
  const cdA = orient(c, d, a);
  const cdB = orient(c, d, b);
  return abC * abD < -1e-8 && cdA * cdB < -1e-8;
}

describe("local chamber UX helpers", () => {
  it("keeps the selected node at the origin and lays out neighbors deterministically", () => {
    const { ball } = generateViewerBall(A3 as CoxeterSystemInput, {
      radius: 3,
      createdAt,
    });
    const first = computeLocalLayout(ball.nodes, ball.edges, "e", {
      depth: 2,
      generatorCount: 3,
    });
    const second = computeLocalLayout(ball.nodes, ball.edges, "e", {
      depth: 2,
      generatorCount: 3,
    });

    expect(first.positions.get("e")).toEqual([0, 0, 0]);
    expect([...first.positions.entries()]).toEqual([
      ...second.positions.entries(),
    ]);
    expect(first.nodes.filter((node) => node.distance === 1)).toHaveLength(3);
    expect(first.nodes.some((node) => node.distance === 2)).toBe(true);
  });

  it("creates a deterministic 3D local chamber layout with separated shells", () => {
    const { ball } = generateViewerBall(A3 as CoxeterSystemInput, {
      radius: 3,
      createdAt,
    });
    const first = computeLocalChamber3DLayout(
      ball.nodes,
      ball.edges,
      ball.twoCells,
      "e",
      { depth: 2, generatorCount: 3 },
    );
    const second = computeLocalChamber3DLayout(
      ball.nodes,
      ball.edges,
      ball.twoCells,
      "e",
      { depth: 2, generatorCount: 3 },
    );

    expect(first.layout).toBe("local-chamber-3d");
    expect(first.positions.get("e")).toEqual([0, 0, 0]);
    expect([...first.positions.entries()]).toEqual([
      ...second.positions.entries(),
    ]);
    expect(first.generatorDirections.size).toBe(3);
    expect(
      new Set(
        ball.nodes
          .filter((node) => node.length === 1)
          .map((node) => first.positions.get(node.id)?.[2].toFixed(3)),
      ).size,
    ).toBeGreaterThan(1);
    expect(
      first.nodes.some((node) => node.distance === 2 && node.position[2] > 0.2),
    ).toBe(true);
  });

  it("derives stable relation-focus pair presets from the Coxeter matrix", () => {
    const system = A3 as CoxeterSystemInput;
    const { ball } = generateViewerBall(system, {
      radius: 3,
      createdAt,
    });
    const layout = computeLocalChamber3DLayout(
      ball.nodes,
      ball.edges,
      ball.twoCells,
      "e",
      { depth: 2, generatorCount: system.rank },
    );
    const allFinitePairs = finitePairKeys(system);
    const m3Pairs = finitePairKeys(system, (m) => m === 3);
    const disabledForAllOff = new Set(allFinitePairs);
    const disabledForM3Only = new Set(
      allFinitePairs.filter((key) => !m3Pairs.includes(key)),
    );

    expect(allFinitePairs).toEqual(["0-1", "0-2", "1-2"]);
    expect(m3Pairs).toEqual(["0-1", "1-2"]);
    expect([...disabledForAllOff].sort()).toEqual(allFinitePairs);
    expect([...disabledForM3Only].sort()).toEqual(["0-2"]);
    expect(parsePairKey("1-2")).toEqual([1, 2]);
    expect([...layout.pairPanelDirections.keys()].sort()).toEqual(
      allFinitePairs,
    );
    expect([...layout.cameraTargets.keys()].sort()).toEqual(allFinitePairs);
  });

  it("describes finite pair cells and expands a cell neighborhood from its boundary", () => {
    const system = A3 as CoxeterSystemInput;
    const { ball } = generateViewerBall(system, {
      radius: 3,
      createdAt,
    });
    const layout = computeLocalChamber3DLayout(
      ball.nodes,
      ball.edges,
      ball.twoCells,
      "e",
      { depth: 3, generatorCount: system.rank },
    );
    const selectedCell = ball.twoCells.find(
      (cell) => pairKey(cell.generatorPair) === "0-1",
    );
    const boundaryIds = cellNeighborhoodNodeIds(
      ball.edges,
      selectedCell,
      "cell-boundary",
    );
    const plusOneIds = cellNeighborhoodNodeIds(
      ball.edges,
      selectedCell,
      "cell-plus-1",
    );
    const diagnostics = rankTwoPairDiagnostics({
      allCells: ball.twoCells,
      visibleCells: selectedCell ? [selectedCell] : [],
      sceneNodeIds: boundaryIds ?? new Set(),
      system,
      localDistances: layout.distances,
    });
    const pair = diagnostics.find((entry) => entry.key === "0-1");

    expect(polygonLabelForM(3)).toBe("hexagon");
    expect(selectedCell?.boundaryNodeIds).toHaveLength(6);
    expect(boundaryIds).toEqual(new Set(selectedCell?.boundaryNodeIds));
    expect(plusOneIds?.size ?? 0).toBeGreaterThan(boundaryIds?.size ?? 0);
    expect(pair).toMatchObject({
      m: 3,
      polygonLabel: "hexagon",
      boundaryLength: 6,
      visibleCount: 1,
    });
  });

  it("builds numbered relation walks and boundary edge ids", () => {
    const system = I2_5 as CoxeterSystemInput;
    const { ball } = generateViewerBall(system, {
      radius: 5,
      createdAt,
    });
    const cell = ball.twoCells[0];
    const walk = relationWalkEntries({
      cell,
      nodes: ball.nodes,
      edges: ball.edges,
      generators: system.generators,
    });
    const boundaryEdges = cellBoundaryEdgeKeys(ball.edges, cell);

    expect(cell.boundaryNodeIds).toHaveLength(10);
    expect(walk).toHaveLength(10);
    expect(walk[0].label).toMatch(/^0:/);
    expect(
      walk.slice(1).map((entry) => entry.generatorLabelFromPrevious),
    ).toEqual(expect.arrayContaining(["s0", "s1"]));
    expect(boundaryEdges.size).toBe(10);
  });

  it("builds the Y_Gamma fundamental-domain atlas with oriented generator arrows", () => {
    const system = A3 as CoxeterSystemInput;
    const quotient = baseOrbicomplexForSystem(system);
    const atlas = buildYGammaCellAtlas(system);
    const ball = quotientToGeneratedBall(quotient);
    const hexagon = ball.twoCells.find(
      (cell) => pairKey(cell.generatorPair) === "0-1",
    );
    const boundaryEdges = cellBoundaryEdgeKeys(ball.edges, hexagon);
    const walk = relationWalkEntries({
      cell: hexagon,
      nodes: ball.nodes,
      edges: ball.edges,
      generators: system.generators,
    });

    expect(quotient.vertices).toHaveLength(1);
    expect(isYGammaBaseComplex(quotient)).toBe(true);
    expect(quotient.edges).toHaveLength(system.rank);
    expect(ball.nodes).toEqual([
      expect.objectContaining({ id: "*", word: [] }),
    ]);
    expect(hexagon?.boundaryNodeIds).toEqual(Array(6).fill("*"));
    expect(boundaryEdges).toEqual(new Set(["Y:edge:0", "Y:edge:1"]));
    expect(
      walk.slice(1).map((entry) => entry.generatorLabelFromPrevious),
    ).toEqual(["s0", "s1", "s0", "s1", "s0"]);
    expect(ball.higherCells?.some((cell) => cell.rank === 3)).toBe(true);
    expect(atlas.baseVertex.label).toBe("*");
    expect(atlas.generatorCells).toHaveLength(3);
    expect(atlas.generatorCells[0]).toMatchObject({
      kind: "generator-arrow",
      attachingWord: ["s0"],
    });
    expect(atlas.rankTwoCells).toHaveLength(3);
    expect(
      atlas.rankTwoCells.find((cell) => cell.label === "s0-s1"),
    ).toMatchObject({
      polygonLabel: "hexagon",
      attachingWord: ["s0", "s1", "s0", "s1", "s0", "s1"],
    });
    expect(atlas.higherCells.some((cell) => cell.rank === 3)).toBe(true);
    expect(atlas.labelLegend.map((entry) => entry.meaning).join(" ")).toContain(
      "not distinct affine vertices",
    );

    const scene = buildYGamma2SkeletonScene(atlas, {
      activeGeneratorPairKey: "0-1",
    });
    const base = scene.nodes.find((node) => node.id === "Y:*");
    const activeHexagon = scene.cells.find((cell) => cell.id === "Y:cell:0-1");
    const arrowEdges = scene.edges.filter((edge) =>
      edge.id.startsWith("Y:arrow:"),
    );

    expect(base?.position).toEqual([0, 0, 0]);
    expect(arrowEdges).toHaveLength(system.rank);
    expect(arrowEdges.every((edge) => edge.directed)).toBe(true);
    expect(
      scene.nodes
        .filter((node) => node.id.startsWith("Y:arrow-end:"))
        .map((node) => node.compactLabel),
    ).toEqual(["", "", ""]);
    expect(arrowEdges.map((edge) => edge.compactLabel)).toEqual([
      "s0",
      "s1",
      "s2",
    ]);
    expect(
      Math.max(
        ...scene.nodes
          .filter((node) => node.id.startsWith("Y:arrow-end:"))
          .map((node) => Math.hypot(...(node.position ?? [0, 0, 0]))),
      ),
    ).toBeGreaterThan(5);
    expect(activeHexagon?.boundaryNodeIds).toHaveLength(6);
    expect(activeHexagon?.boundaryNodeIds.slice(0, 2)).toEqual([
      "Y:*",
      "Y:arrow-end:0",
    ]);
    expect(activeHexagon?.boundaryNodeIds.at(-1)).toBe("Y:arrow-end:1");
    expect(
      Math.max(
        ...(activeHexagon?.boundaryNodeIds ?? []).map((nodeId) => {
          const node = scene.nodes.find((entry) => entry.id === nodeId);
          return Math.hypot(...(node?.position ?? [0, 0, 0]));
        }),
      ),
    ).toBeGreaterThan(4);
    expect(
      scene.nodes.some(
        (node) =>
          node.id === "Y:cell:0-1:sheet-corner:0" &&
          node.isRelationBoundary &&
          node.hidden,
      ),
    ).toBe(true);
    expect(
      scene.edges.filter((edge) => edge.id.startsWith("Y:cell:0-1:boundary:")),
    ).toHaveLength(6);
    expect(scene.cells.filter((cell) => cell.dimension === 3)).toHaveLength(14);
    expect(scene.nodes.filter((node) => !node.hidden)).toHaveLength(
      system.rank + 1,
    );

    const filtered = buildYGamma2SkeletonScene(atlas, {
      activeGeneratorPairKey: "0-1",
      faceMode: "active-pair",
    });
    expect(filtered.cells.some((cell) => cell.id === "Y:cell:0-1")).toBe(true);
    expect(
      filtered.cells.filter((cell) => cell.sourceCellId === "Y:higher:0-1-2"),
    ).toHaveLength(14);
    expect(
      filtered.edges
        .filter((edge) => edge.id.startsWith("Y:arrow:"))
        .map((edge) => edge.compactLabel),
    ).toEqual(["s0", "s1", "s2"]);

    const rankThreeFocus = buildYGamma2SkeletonScene(atlas, {
      includeRankThreeCells: true,
      rankThreeFocus: {
        cellId: "Y:higher:0-1-2",
        generatorSet: [0, 1, 2],
        pairKeys: ["0-2", "0-1"],
        exposeConstructionVertices: true,
        showOnlyFundamentalFaces: true,
        mode: "hinge-witness",
      },
    });
    const focusedFaces = rankThreeFocus.cells.filter(
      (cell) => cell.sourceCellId === "Y:higher:0-1-2",
    );
    expect(rankThreeFocus.cells.some((cell) => cell.id === "Y:cell:0-1")).toBe(
      false,
    );
    expect(
      focusedFaces.map((cell) => cell.boundaryNodeIds.length).sort(),
    ).toEqual([4, 6]);
    expect(
      new Set(focusedFaces.map((cell) => pairKey(cell.generatorPair))),
    ).toEqual(new Set(["0-1", "0-2"]));
    const focusedPositions = new Map(
      rankThreeFocus.nodes.map((node) => [node.id, node.position ?? [0, 0, 0]]),
    );
    const faceNormals = focusedFaces.map((cell) => {
      const [base, first, second] = cell.boundaryNodeIds.map(
        (nodeId) => focusedPositions.get(nodeId) ?? [0, 0, 0],
      );
      const left = [first[0] - base[0], first[1] - base[1], first[2] - base[2]];
      const right = [
        second[0] - base[0],
        second[1] - base[1],
        second[2] - base[2],
      ];
      return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
      ];
    });
    const normalDot =
      faceNormals[0][0] * faceNormals[1][0] +
      faceNormals[0][1] * faceNormals[1][1] +
      faceNormals[0][2] * faceNormals[1][2];
    expect(Math.abs(normalDot)).toBeLessThan(1e-6);
    expect(
      rankThreeFocus.edges.filter((edge) =>
        edge.id.startsWith("Y:higher:0-1-2:focus-edge:"),
      ),
    ).toHaveLength(10);
    expect(
      rankThreeFocus.nodes.filter((node) => !node.hidden).length,
    ).toBeGreaterThan(system.rank + 1);
  });

  it("can focus the full m=2/m=3 rank-three Y_Gamma cell boundary", () => {
    const system = A3 as CoxeterSystemInput;
    const atlas = buildYGammaCellAtlas(system);
    const rankThreeFocus = buildYGamma2SkeletonScene(atlas, {
      includeRankThreeCells: true,
      rankThreeFocus: {
        cellId: "Y:higher:0-1-2",
        generatorSet: [0, 1, 2],
        pairKeys: ["0-2", "0-1", "1-2"],
        exposeConstructionVertices: true,
        showOnlyFundamentalFaces: false,
        mode: "full-cell",
      },
    });
    const focusedFaces = rankThreeFocus.cells.filter(
      (cell) => cell.sourceCellId === "Y:higher:0-1-2",
    );
    const boundaryLengths = focusedFaces
      .map((cell) => cell.boundaryNodeIds.length)
      .sort((left, right) => left - right);
    expect(boundaryLengths).toEqual([4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 6, 6]);
    expect(
      new Set(focusedFaces.map((cell) => pairKey(cell.generatorPair))),
    ).toEqual(new Set(["0-1", "0-2", "1-2"]));
    expect(
      rankThreeFocus.edges.filter((edge) =>
        edge.id.startsWith("Y:higher:0-1-2:coxeter-face-edge:"),
      ),
    ).toHaveLength(72);
    expect(
      rankThreeFocus.nodes.filter((node) => !node.hidden).length,
    ).toBeGreaterThan(system.rank + 1);

    const focusedPositions = new Map(
      rankThreeFocus.nodes.map((node) => [node.id, node.position ?? [0, 0, 0]]),
    );
    const normals = focusedFaces.map((cell) => {
      const [base, first, second] = cell.boundaryNodeIds.map(
        (nodeId) => focusedPositions.get(nodeId) ?? [0, 0, 0],
      );
      const left = [first[0] - base[0], first[1] - base[1], first[2] - base[2]];
      const right = [
        second[0] - base[0],
        second[1] - base[1],
        second[2] - base[2],
      ];
      return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
      ];
    });
    const hasSeparatedFaceDirections = normals.some((left, leftIndex) =>
      normals.some((right, rightIndex) => {
        if (leftIndex === rightIndex) {
          return false;
        }
        const crossMagnitude = Math.hypot(
          left[1] * right[2] - left[2] * right[1],
          left[2] * right[0] - left[0] * right[2],
          left[0] * right[1] - left[1] * right[0],
        );
        return crossMagnitude > 1e-6;
      }),
    );
    expect(hasSeparatedFaceDirections).toBe(true);
  });

  it("uses the actual Y_Gamma 3-cell boundary for the active hexagon family", () => {
    const system = A3 as CoxeterSystemInput;
    const atlas = buildYGammaCellAtlas(system);
    const scene = buildYGamma2SkeletonScene(atlas, {
      activeGeneratorPairKey: "0-1",
      includeRankThreeCells: true,
      rankThreeFocus: {
        cellId: "Y:higher:0-1-2",
        generatorSet: [0, 1, 2],
        pairKeys: ["0-2", "0-1", "1-2"],
        exposeConstructionVertices: true,
        showOnlyFundamentalFaces: false,
        mode: "full-cell",
      },
    });
    const readableEdges = scene.edges.filter((edge) =>
      edge.id.startsWith("Y:higher:0-1-2:coxeter-face-edge:"),
    );
    const emphasizedHexagonEdges = readableEdges.filter(
      (edge) => edge.emphasis === "readable-boundary",
    );
    expect(
      scene.nodes.some((node) => node.id.includes(":readable-face:")),
    ).toBe(false);
    expect(emphasizedHexagonEdges).toHaveLength(24);
    expect(
      emphasizedHexagonEdges.every((edge) => edge.isRelationBoundary),
    ).toBe(true);

    const firstHexagon = scene.cells.find(
      (cell) =>
        cell.sourceCellId === "Y:higher:0-1-2" &&
        pairKey(cell.generatorPair) === "0-1",
    );
    expect(firstHexagon?.boundaryNodeIds).toHaveLength(6);
    const positions = new Map(
      scene.nodes.map((node) => [node.id, node.position ?? [0, 0, 0]]),
    );
    const boundary = (firstHexagon?.boundaryNodeIds ?? []).map((nodeId) => {
      const node = scene.nodes.find((entry) => entry.id === nodeId);
      if (nodeId !== "Y:*") {
        expect(node?.compactLabel).toBe("");
      }
      return (positions.get(nodeId) ?? [0, 0, 0]) as [number, number, number];
    });
    const center = centroid3(boundary);
    expect(center).toBeDefined();
    const radii = boundary.map((point) =>
      Math.hypot(
        point[0] - (center?.[0] ?? 0),
        point[1] - (center?.[1] ?? 0),
        point[2] - (center?.[2] ?? 0),
      ),
    );
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.6);
  });

  it("can show a simply embedded focused Y_Gamma hexagon family without detached pieces", () => {
    const system = A3 as CoxeterSystemInput;
    const atlas = buildYGammaCellAtlas(system);
    const scene = buildYGamma2SkeletonScene(atlas, {
      activeGeneratorPairKey: "0-1",
      faceMode: "active-pair",
      includeRankThreeCells: true,
      rankThreeFocus: {
        cellId: "Y:higher:0-1-2",
        generatorSet: [0, 1, 2],
        pairKeys: ["0-2", "0-1", "1-2"],
        exposeConstructionVertices: true,
        showOnlyFundamentalFaces: false,
        mode: "full-cell",
      },
    });
    const focusedFaces = scene.cells.filter(
      (cell) => cell.sourceCellId === "Y:higher:0-1-2",
    );
    expect(focusedFaces).toHaveLength(4);
    expect(
      focusedFaces.every((cell) => pairKey(cell.generatorPair) === "0-1"),
    ).toBe(true);
    expect(
      focusedFaces.every((cell) => cell.boundaryNodeIds.length === 6),
    ).toBe(true);
    expect(
      scene.nodes.some((node) => node.id.includes(":readable-face:")),
    ).toBe(false);

    const focusedEdges = scene.edges.filter((edge) =>
      edge.id.startsWith("Y:higher:0-1-2:coxeter-face-edge:"),
    );
    expect(focusedEdges).toHaveLength(24);
    expect(
      focusedEdges.every((edge) => edge.emphasis === "readable-boundary"),
    ).toBe(true);

    const positions = new Map(
      scene.nodes.map((node) => [node.id, node.position ?? [0, 0, 0]]),
    );
    expect(
      focusedFaces.every((cell) => {
        const boundary = cell.boundaryNodeIds.map(
          (nodeId) =>
            (positions.get(nodeId) ?? [0, 0, 0]) as [number, number, number],
        );
        return isSimpleProjectedPolygon(boundary);
      }),
    ).toBe(true);
  });

  it("keeps every full Y_Gamma rank-three square and hexagon simply embedded", () => {
    const system = A3 as CoxeterSystemInput;
    const atlas = buildYGammaCellAtlas(system);
    const scene = buildYGamma2SkeletonScene(atlas, {
      includeRankThreeCells: true,
      rankThreeFocus: {
        cellId: "Y:higher:0-1-2",
        generatorSet: [0, 1, 2],
        pairKeys: ["0-2", "0-1", "1-2"],
        exposeConstructionVertices: true,
        showOnlyFundamentalFaces: false,
        mode: "full-cell",
      },
    });
    const focusedFaces = scene.cells.filter(
      (cell) => cell.sourceCellId === "Y:higher:0-1-2",
    );
    const positions = new Map(
      scene.nodes.map((node) => [node.id, node.position ?? [0, 0, 0]]),
    );
    expect(focusedFaces).toHaveLength(14);
    expect(
      focusedFaces.every((cell) => {
        const boundary = cell.boundaryNodeIds.map(
          (nodeId) =>
            (positions.get(nodeId) ?? [0, 0, 0]) as [number, number, number],
        );
        return isSimpleProjectedPolygon(boundary);
      }),
    ).toBe(true);
    expect(focusedFaces.some((cell) => cell.boundaryNodeIds.length === 4)).toBe(
      true,
    );
    expect(focusedFaces.some((cell) => cell.boundaryNodeIds.length === 6)).toBe(
      true,
    );
  });

  it("keeps square and hexagon families visible together in normal Y_Gamma 3D focus", () => {
    const system = A3 as CoxeterSystemInput;
    const atlas = buildYGammaCellAtlas(system);
    const scene = buildYGamma2SkeletonScene(atlas, {
      activeGeneratorPairKey: "0-1",
      faceMode: "all",
      includeRankThreeCells: true,
      rankThreeFocus: {
        cellId: "Y:higher:0-1-2",
        generatorSet: [0, 1, 2],
        pairKeys: ["0-2", "0-1", "1-2"],
        exposeConstructionVertices: true,
        restrictGeneratorSpine: false,
        mode: "full-cell",
      },
    });
    const focusedFaces = scene.cells.filter(
      (cell) => cell.sourceCellId === "Y:higher:0-1-2",
    );
    const pairKeys = new Set(
      focusedFaces.map((cell) => pairKey(cell.generatorPair)),
    );
    const emphasizedEdges = scene.edges.filter(
      (edge) => edge.emphasis === "readable-boundary",
    );

    expect(focusedFaces).toHaveLength(14);
    expect(pairKeys).toEqual(new Set(["0-1", "0-2", "1-2"]));
    expect(focusedFaces.some((cell) => cell.boundaryNodeIds.length === 4)).toBe(
      true,
    );
    expect(focusedFaces.some((cell) => cell.boundaryNodeIds.length === 6)).toBe(
      true,
    );
    expect(emphasizedEdges).toHaveLength(24);
  });

  it("filters Y_Gamma readability views by relation order and generator", () => {
    const system = A3 as CoxeterSystemInput;
    const atlas = buildYGammaCellAtlas(system);
    const squareScene = buildYGamma2SkeletonScene(atlas, {
      relationOrderFilter: 2,
      includeRankThreeCells: true,
    });
    const aroundGeneratorScene = buildYGamma2SkeletonScene(atlas, {
      focusGenerator: 2,
      includeRankThreeCells: true,
    });

    expect(
      squareScene.cells.every((cell) => pairKey(cell.generatorPair) === "0-2"),
    ).toBe(true);
    expect(
      aroundGeneratorScene.cells.every((cell) =>
        cell.generatorPair.includes(2),
      ),
    ).toBe(true);
    expect(
      aroundGeneratorScene.edges
        .filter((edge) => edge.id.startsWith("Y:arrow:"))
        .map((edge) => edge.compactLabel),
    ).toEqual(["s0", "s1", "s2"]);
  });

  it("peels focused Y_Gamma rank-three cells without creating detached pieces", () => {
    const system = A3 as CoxeterSystemInput;
    const atlas = buildYGammaCellAtlas(system);
    const selectedFace = buildYGamma2SkeletonScene(atlas, {
      activeGeneratorPairKey: "0-1",
      includeRankThreeCells: true,
      peelMode: "selected-face",
      rankThreeFocus: {
        cellId: "Y:higher:0-1-2",
        generatorSet: [0, 1, 2],
        pairKeys: ["0-2", "0-1", "1-2"],
        exposeConstructionVertices: true,
        restrictGeneratorSpine: false,
        mode: "full-cell",
      },
    });
    const adjacentFaces = buildYGamma2SkeletonScene(atlas, {
      activeGeneratorPairKey: "0-1",
      includeRankThreeCells: true,
      peelMode: "adjacent-faces",
      rankThreeFocus: {
        cellId: "Y:higher:0-1-2",
        generatorSet: [0, 1, 2],
        pairKeys: ["0-2", "0-1", "1-2"],
        exposeConstructionVertices: true,
        restrictGeneratorSpine: false,
        mode: "full-cell",
      },
    });

    const selectedFocusedFaces = selectedFace.cells.filter(
      (cell) => cell.sourceCellId === "Y:higher:0-1-2",
    );
    const adjacentFocusedFaces = adjacentFaces.cells.filter(
      (cell) => cell.sourceCellId === "Y:higher:0-1-2",
    );

    expect(selectedFocusedFaces).toHaveLength(1);
    expect(selectedFocusedFaces[0].boundaryNodeIds).toHaveLength(6);
    expect(adjacentFocusedFaces.length).toBeGreaterThan(1);
    expect(adjacentFocusedFaces.length).toBeLessThan(14);
    expect(selectedFace.nodes.some((node) => node.id === "Y:arrow-end:2")).toBe(
      true,
    );
  });

  it("numbers active Y_Gamma relation edges while leaving construction vertices unlabeled", () => {
    const system = A3 as CoxeterSystemInput;
    const atlas = buildYGammaCellAtlas(system);
    const scene = buildYGamma2SkeletonScene(atlas, {
      activeGeneratorPairKey: "0-1",
      faceMode: "active-pair",
      includeRankThreeCells: false,
    });
    const boundaryEdges = scene.edges.filter((edge) =>
      edge.id.startsWith("Y:cell:0-1:boundary:"),
    );

    expect(boundaryEdges.map((edge) => edge.compactLabel)).toEqual([
      "0: s0",
      "1: s1",
      "2: s0",
      "3: s1",
      "4: s0",
      "5: s1",
    ]);
    expect(
      scene.nodes
        .filter((node) => node.id.includes(":sheet-corner:"))
        .every((node) => node.compactLabel === "" && node.hidden),
    ).toBe(true);
  });

  it("can keep the full generator spine visible around a focused Y_Gamma 3-cell", () => {
    const rankFourWithA3Cell: CoxeterSystemInput = {
      schemaVersion: 1,
      name: "A3 cell with extra generator",
      dataStatus: "toy",
      rank: 4,
      generators: [
        { id: "s0", label: "s0" },
        { id: "s1", label: "s1" },
        { id: "s2", label: "s2" },
        { id: "s3", label: "s3" },
      ],
      coxeterMatrix: [
        [1, 3, 2, "inf"],
        [3, 1, 3, "inf"],
        [2, 3, 1, "inf"],
        ["inf", "inf", "inf", 1],
      ],
    };
    const atlas = buildYGammaCellAtlas(rankFourWithA3Cell);
    const scene = buildYGamma2SkeletonScene(atlas, {
      activeGeneratorPairKey: "0-1",
      faceMode: "active-pair",
      includeRankThreeCells: true,
      rankThreeFocus: {
        cellId: "Y:higher:0-1-2",
        generatorSet: [0, 1, 2],
        pairKeys: ["0-2", "0-1", "1-2"],
        exposeConstructionVertices: true,
        restrictGeneratorSpine: false,
        mode: "full-cell",
      },
    });

    expect(scene.nodes.some((node) => node.id === "Y:arrow-end:3")).toBe(true);
    expect(scene.edges.some((edge) => edge.id === "Y:arrow:3")).toBe(true);
    expect(
      scene.cells.some((cell) => cell.sourceCellId === "Y:higher:0-1-2"),
    ).toBe(true);
  });

  it("renders a right-angled rank-three Y_Gamma cell as a cube boundary", () => {
    const rightAngledTriple: CoxeterSystemInput = {
      schemaVersion: 1,
      name: "Right-angled rank 3",
      dataStatus: "toy",
      rank: 3,
      generators: [
        { id: "s0", label: "s0" },
        { id: "s1", label: "s1" },
        { id: "s2", label: "s2" },
      ],
      coxeterMatrix: [
        [1, 2, 2],
        [2, 1, 2],
        [2, 2, 1],
      ],
    };
    const atlas = buildYGammaCellAtlas(rightAngledTriple);
    const scene = buildYGamma2SkeletonScene(atlas);
    const cubeFaces = scene.cells.filter(
      (cell) => cell.sourceCellId === "Y:higher:0-1-2",
    );

    expect(cubeFaces).toHaveLength(6);
    expect(cubeFaces.every((cell) => cell.boundaryNodeIds.length === 4)).toBe(
      true,
    );
    expect(
      new Set(cubeFaces.map((cell) => pairKey(cell.generatorPair))).size,
    ).toBe(3);
    expect(scene.nodes.filter((node) => !node.hidden)).toHaveLength(4);
    expect(
      scene.nodes.filter(
        (node) => node.hidden && node.id.includes(":coxeter-vertex:"),
      ),
    ).toHaveLength(4);
  });

  it("steps by generator when the adjacent chamber is inside the finite ball", () => {
    const { ball } = generateViewerBall(I2_5 as CoxeterSystemInput, {
      radius: 1,
      createdAt,
    });
    const steps = generatorStepOptions(ball.edges, "e", I2_5.generators);

    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generator: 0,
          available: true,
          targetNodeId: "w:0",
        }),
        expect.objectContaining({
          generator: 1,
          available: true,
          targetNodeId: "w:1",
        }),
      ]),
    );

    const boundarySteps = generatorStepOptions(
      ball.edges,
      "w:0",
      I2_5.generators,
    );
    expect(boundarySteps.some((step) => !step.available)).toBe(true);
    expect(boundarySteps.map((step) => step.reason).join(" ")).toContain(
      "increase radius",
    );
  });

  it("builds clickable breadcrumbs from reduced-word prefixes", () => {
    const { ball } = generateViewerBall(I2_5 as CoxeterSystemInput, {
      radius: 3,
      createdAt,
    });
    const selected = ball.nodes.find((node) => node.word.join(".") === "0.1");
    const breadcrumb = wordBreadcrumb(ball.nodes, selected, I2_5.generators);

    expect(breadcrumb.map((entry) => entry.label)).toEqual(["e", "s0", "s1"]);
    expect(breadcrumb.every((entry) => entry.clickable)).toBe(true);
    expect(compactWordLabel(selected?.word ?? [], I2_5.generators)).toBe(
      "s0s1",
    );
  });

  it("exports a deterministic local neighborhood payload", () => {
    const { ball } = generateViewerBall(I2_5 as CoxeterSystemInput, {
      radius: 2,
      createdAt,
    });
    const selected = ball.nodes.find((node) => node.id === "e");
    const payload = buildLocalNeighborhoodExport({
      datasetId: "I2_5",
      datasetLabel: "I2(5)",
      system: I2_5 as CoxeterSystemInput,
      ball,
      selectedNode: selected,
      visibleNodes: ball.nodes.slice(0, 3),
      visibleEdges: ball.edges.slice(0, 2),
      visibleCells: ball.twoCells,
      activePreset: "local-chamber",
      graphView: "on-graph",
      localDepth: 2,
      mode: "shell",
      projection: "klein-axes",
      labelScope: "focused",
      layout: "local-chamber-3d",
      cellRenderMode: "lifted-panels",
      cellFocusMode: "incident-selected",
      cellNeighborhoodMode: "chamber",
      relationWalkMode: "numbered",
      occlusionMode: "hide-far",
      disabledPairs: new Set(["0-1"]),
      activeGeneratorPairKey: "0-1",
      warnings: ["z warning", "a warning", "z warning"],
    });

    expect(payload).toMatchObject({
      kind: "coxeter-local-neighborhood-view",
      selectedNodeId: "e",
      selectedWord: { compactLabel: "e" },
      view: { preset: "local-chamber", labelScope: "focused" },
      filters: { disabledGeneratorPairs: ["0-1"] },
    });
    expect(payload.visible.nodeIds).toEqual(
      [...payload.visible.nodeIds].sort(),
    );
    expect(payload.warnings).toEqual(["a warning", "z warning"]);
  });

  it("exports relation-focus state narrowed to one visible rank-two cell", () => {
    const system = A3 as CoxeterSystemInput;
    const { ball } = generateViewerBall(system, {
      radius: 3,
      createdAt,
    });
    const activePairKey = "0-1";
    const selectedCell = ball.twoCells.find(
      (cell) => pairKey(cell.generatorPair) === activePairKey,
    );
    const boundaryNodeIds = new Set(selectedCell?.boundaryNodeIds ?? []);
    const boundaryGenerators = new Set(selectedCell?.generatorPair ?? []);
    const relationWalkLabels = (selectedCell?.boundaryNodeIds ?? []).map(
      (nodeId, index) =>
        `${nodeId}:${system.generators[index % 2 === 0 ? 0 : 1]?.label}`,
    );

    expect(selectedCell?.m).toBe(3);
    expect(selectedCell?.boundaryNodeIds).toHaveLength(6);
    expect(relationWalkLabels.join(" ")).toContain("s0");
    expect(relationWalkLabels.join(" ")).toContain("s1");

    const payload = buildLocalNeighborhoodExport({
      datasetId: "A3",
      datasetLabel: "A3",
      system,
      ball,
      selectedNode: ball.nodes.find((node) => node.id === "e"),
      visibleNodes: ball.nodes.filter((node) => boundaryNodeIds.has(node.id)),
      visibleEdges: ball.edges.filter(
        (edge) =>
          boundaryGenerators.has(edge.generator) &&
          boundaryNodeIds.has(edge.source) &&
          boundaryNodeIds.has(edge.target),
      ),
      visibleCells: selectedCell ? [selectedCell] : [],
      activePreset: "rank-two-cells",
      graphView: "on-graph",
      localDepth: 1,
      mode: "shell",
      projection: "klein-axes",
      labelScope: "focused",
      layout: "local-chamber-3d",
      cellRenderMode: "outline-only",
      cellFocusMode: "selected-pair",
      cellNeighborhoodMode: "cell-plus-1",
      relationWalkMode: "numbered",
      occlusionMode: "fade-far",
      disabledPairs: new Set(["0-2", "1-2"]),
      activeGeneratorPairKey: activePairKey,
      warnings: ["Ghost context is visual context, not extra graph data."],
    });

    expect(payload.view).toMatchObject({
      preset: "rank-two-cells",
      cellRenderMode: "outline-only",
      cellFocusMode: "selected-pair",
      cellNeighborhoodMode: "cell-plus-1",
      relationWalkMode: "numbered",
      occlusionMode: "fade-far",
    });
    expect(payload.filters).toEqual({
      disabledGeneratorPairs: ["0-2", "1-2"],
      activeGeneratorPair: activePairKey,
    });
    expect(payload.visible.rankTwoCellIds).toEqual([selectedCell?.id]);
    expect(payload.warnings).toEqual([
      "Ghost context is visual context, not extra graph data.",
    ]);
  });

  it("groups warnings by user-facing meaning", () => {
    const groups = groupWarnings([
      "This dataset is a placeholder.",
      "Rounded matrix keys are approximate.",
      "8 cells were omitted by the render budget.",
      "Cayley ball generation is running in a worker.",
    ]);

    expect(groups.map((group) => group.id)).toEqual([
      "important",
      "approximation",
      "omitted",
      "backend",
    ]);
  });
});
