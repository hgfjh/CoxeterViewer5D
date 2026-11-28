import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { generateViewerBall } from "../src/app/generationPipeline";
import { localGraphDistances } from "../src/app/localFocus";
import { generateCayleyBall } from "../src/cayley";
import {
  buildSourceComplexBase,
  projectionAvailability,
  resolveSceneProjection,
} from "../src/app/sourceComplexScene";
import { parseCoxeterSystemInput } from "../src/coxeter";
import {
  buildHyperbolicReflectionData,
  computeHyperbolicOrbitPoints,
  computeOrbitLayout,
  lorentzDot,
  lorentzNormalizeTimelike,
  validateOrSolveChamberBasepoint,
} from "../src/geometry";
import type { CoxeterSystemInput } from "../src/types";

const examplesDir = new URL("../public/examples/", import.meta.url);

function loadExample(id: string): CoxeterSystemInput {
  return parseCoxeterSystemInput(
    JSON.parse(readFileSync(new URL(`${id}.json`, examplesDir), "utf8")),
  );
}

function ballFor(system: CoxeterSystemInput, radius: number) {
  return generateViewerBall(system, {
    radius,
    maxNodes: 20_000,
    maxEdges: 80_000,
    createdAt: "2026-01-01T00:00:00.000Z",
  }).ball;
}

type P3 = [number, number, number];
const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: P3) => Math.sqrt(dot(a, a));

/**
 * Relative off-plane residual and convexity of a cyclic polygon in R^3.
 * Uses the Newell normal, so the polygon need not be triangulated first.
 */
function polygonShape(points: P3[]): { residual: number; convex: boolean } {
  const centre: P3 = [0, 0, 0];
  for (const p of points)
    for (let k = 0; k < 3; k += 1) centre[k] += p[k] / points.length;
  const normal: P3 = [0, 0, 0];
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    normal[0] += (p[1] - q[1]) * (p[2] + q[2]);
    normal[1] += (p[2] - q[2]) * (p[0] + q[0]);
    normal[2] += (p[0] - q[0]) * (p[1] + q[1]);
  });
  const n = length(normal);
  const unit: P3 = [normal[0] / n, normal[1] / n, normal[2] / n];
  const diameter = Math.max(
    ...points.flatMap((p) => points.map((q) => length(sub(p, q)))),
  );
  const residual =
    Math.max(...points.map((p) => Math.abs(dot(sub(p, centre), unit)))) /
    diameter;
  // Convex iff every turn has the same orientation about the normal.
  const turns = points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    const r = points[(i + 2) % points.length];
    return dot(cross(sub(q, p), sub(r, q)), unit);
  });
  const convex =
    turns.every((t) => t > -1e-9 * diameter * diameter) ||
    turns.every((t) => t < 1e-9 * diameter * diameter);
  return { residual, convex };
}

describe("chamber basepoint", () => {
  const geometricExamples = readdirSync(examplesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter((id) => loadExample(id).geometry !== undefined);

  it("finds bundled examples with geometry", () => {
    expect(geometricExamples.length).toBeGreaterThan(10);
  });

  it.each(geometricExamples)(
    "%s: basepoint is strictly interior and the radius-1 orbit is injective",
    (id) => {
      const system = loadExample(id);
      const data = buildHyperbolicReflectionData(system, { tolerance: 1e-7 });
      expect(data.ok).toBe(true);
      const { basepoint, normals } = data.data!;
      const margin = Math.min(
        ...normals.map((normal) => -lorentzDot(basepoint, normal)),
      );
      // sinh(d) >= 0.05: at least ~0.05 hyperbolic units from every mirror.
      expect(margin).toBeGreaterThan(0.05);

      // Radius 1 already exposes a basepoint on a mirror (s_i x0 = x0); the
      // larger H5-P7-22 check below covers longer words.
      const ball = generateCayleyBall(system, {
        radius: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      const orbit = computeHyperbolicOrbitPoints(system, ball.nodes, {
        tolerance: 1e-7,
      });
      expect(orbit.ok).toBe(true);
      const points = [...orbit.points.values()];
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          // -<x,y> = cosh d(x,y); distinct chambers are > 0.01 apart.
          expect(-lorentzDot(points[i], points[j])).toBeGreaterThan(
            Math.cosh(0.01),
          );
        }
      }
    },
  );

  it("draws all 123 radius-3 chambers of H5-P7-22 at distinct points", () => {
    const system = loadExample("compact_5_prism_h5_p7_22");
    const ball = ballFor(system, 3);
    expect(ball.nodes).toHaveLength(123);
    const orbit = computeHyperbolicOrbitPoints(system, ball.nodes);
    const keys = new Set(
      [...orbit.points.values()].map((p) =>
        p.map((c) => c.toFixed(6)).join(","),
      ),
    );
    expect(keys.size).toBe(123);
  });

  it("replaces a supplied basepoint that lies on a mirror and names the margin", () => {
    const system = loadExample("compact_3_tetrahedron_c44_2233");
    const { normals, basepoint } = buildHyperbolicReflectionData(system).data!;
    const n0 = normals[0];
    const onMirror = lorentzNormalizeTimelike(
      basepoint.map((c, k) => c - lorentzDot(basepoint, n0) * n0[k]),
    );
    expect(Math.abs(lorentzDot(onMirror, n0))).toBeLessThan(1e-12);

    const result = validateOrSolveChamberBasepoint(normals, onMirror);
    expect(result.ok).toBe(true);
    expect(result.diagnostics?.method).toBe("incentre");
    expect(result.diagnostics!.minFacetMargin).toBeGreaterThan(
      result.diagnostics!.requiredMargin,
    );
    expect(result.warnings.join(" ")).toMatch(
      /facet margin .* replaced by the numerically solved approximate hyperbolic incentre/,
    );
  });

  it("keeps a well-centred supplied basepoint", () => {
    const system = loadExample("ideal_hyperbolic_3_cube_m3");
    const result = buildHyperbolicReflectionData(system);
    expect(result.ok).toBe(true);
    expect(result.data!.basepoint).toEqual(system.geometry!.basepoint);
    expect(result.warnings.join(" ")).not.toContain("replaced");
  });
});

describe("Davis orbit layout", () => {
  it("draws I2(5) as a regular decagon (Tits orbit)", () => {
    const system = loadExample("I2_5");
    const ball = ballFor(system, 5);
    const layout = computeOrbitLayout(system, ball.nodes, ball.edges);
    expect(layout.kind).toBe("tits-orbit");
    const positions = [...layout.positions!.values()];
    expect(positions).toHaveLength(10);
    const radii = positions.map(length);
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 9);
    const edgeLengths = ball.edges.map((edge) =>
      length(
        sub(
          layout.positions!.get(edge.source)!,
          layout.positions!.get(edge.target)!,
        ),
      ),
    );
    for (const e of edgeLengths) expect(e).toBeCloseTo(edgeLengths[0], 9);
    expect(positions.every((p) => Math.abs(p[2]) < 1e-12)).toBe(true);
  });

  it("draws A3 as the permutohedron: 24 distinct vertices, planar convex cells", () => {
    const system = loadExample("A3");
    const ball = ballFor(system, 6);
    const layout = computeOrbitLayout(system, ball.nodes, ball.edges);
    expect(layout.kind).toBe("tits-orbit");
    expect(layout.diagnostics!.minVertexDistance).toBeGreaterThan(0.5);
    const radii = [...layout.positions!.values()].map(length);
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 9);
    expect(ball.twoCells.length).toBe(14);
    for (const cell of ball.twoCells) {
      const shape = polygonShape(
        cell.boundaryNodeIds.map((id) => layout.positions!.get(id)!),
      );
      expect(shape.residual).toBeLessThan(1e-9);
      expect(shape.convex).toBe(true);
    }
  });

  it("falls back to shells with a warning for an infinite group without geometry", () => {
    const system = loadExample("universal_rank3");
    const ball = ballFor(system, 3);
    const layout = computeOrbitLayout(system, ball.nodes, ball.edges);
    expect(layout.kind).toBe("shell-fallback");
    expect(layout.positions).toBeUndefined();
    expect(layout.warnings.join(" ")).toContain("word-length shells");
  });

  it.each([
    ["ideal_hyperbolic_3_cube_m3", 3],
    ["compact_3_tetrahedron_c44_2233", 4],
    ["compact_5_prism_h5_p7_22", 3],
    ["compact_5_cube_gamma1", 2],
  ] as const)(
    "%s r=%i: hyperbolic orbit keeps every 2m-gon planar and convex",
    (id, radius) => {
      const system = loadExample(id);
      const ball = ballFor(system, radius);
      const layout = computeOrbitLayout(system, ball.nodes, ball.edges);
      expect(layout.kind).toBe("hyperbolic-orbit");
      expect(layout.caveat).toContain(
        "drawing derived from the reflection orbit",
      );
      expect(layout.diagnostics!.minVertexDistance).toBeGreaterThan(1e-3);
      expect(layout.diagnostics!.minEdgeMidpointDistance).toBeGreaterThan(1e-4);
      expect(layout.positions!.get("e")).toEqual([0, 0, 0]);
      for (const cell of ball.twoCells) {
        const shape = polygonShape(
          cell.boundaryNodeIds.map((nodeId) => layout.positions!.get(nodeId)!),
        );
        expect(shape.residual).toBeLessThan(1e-6);
        expect(shape.convex).toBe(true);
      }
    },
  );

  it("is deterministic", () => {
    const system = loadExample("compact_5_prism_h5_p7_22");
    const ball = ballFor(system, 2);
    const first = computeOrbitLayout(system, ball.nodes, ball.edges);
    const second = computeOrbitLayout(system, ball.nodes, ball.edges);
    expect([...first.positions!.entries()]).toEqual([
      ...second.positions!.entries(),
    ]);
  });
});

describe("source complex scene", () => {
  it("uses the Tits orbit for A3 and reports projection as unavailable", () => {
    const system = loadExample("A3");
    const ball = ballFor(system, 3);
    const davis = buildSourceComplexBase(system, ball);
    expect(davis.layoutKind).toBe("tits-orbit");
    expect(davis.projectionUnavailableReason).toContain("geometry block");
    expect(davis.referenceBallRadius).toBeUndefined();

    const projection = buildSourceComplexBase(system, ball, {
      geometric: true,
      projection: "poincare-axes",
    });
    expect(projection.projectionOk).toBe(false);
    expect(projection.projectionUnavailableReason).toBeDefined();
    expect(projection.referenceBallRadius).toBeUndefined();
    expect(projectionAvailability(system).ok).toBe(false);
  });

  it("recomputes projection positions when the projection type changes", () => {
    const system = loadExample("ideal_hyperbolic_3_cube_m3");
    const ball = ballFor(system, 2);
    const klein = buildSourceComplexBase(system, ball, {
      geometric: true,
      projection: "klein-axes",
    });
    const poincare = buildSourceComplexBase(system, ball, {
      geometric: true,
      projection: "poincare-axes",
    });
    expect(klein.projectionUnavailableReason).toBeUndefined();
    expect(klein.referenceBallRadius).toBe(12);
    const far = ball.nodes.find((node) => node.length === 2)!.id;
    const kp = klein.nodes.find((n) => n.id === far)!.position!;
    const pp = poincare.nodes.find((n) => n.id === far)!.position!;
    expect(length(kp)).toBeGreaterThan(length(pp));
    expect(projectionAvailability(system).ok).toBe(true);
  });

  it("uses exact axes for Klein in d = 3 and drops the ball for PCA in d = 5", () => {
    expect(
      resolveSceneProjection(
        loadExample("ideal_hyperbolic_3_cube_m3"),
        "klein-pca",
      ),
    ).toBe("klein-axes");
    expect(
      resolveSceneProjection(
        loadExample("compact_3_tetrahedron_c44_2233"),
        undefined,
      ),
    ).toBe("klein-axes");
    const prism = loadExample("compact_5_prism_h5_p7_22");
    expect(resolveSceneProjection(prism, undefined)).toBe("klein-pca");
    const scene = buildSourceComplexBase(prism, ballFor(prism, 2), {
      geometric: true,
      projection: "klein-pca",
    });
    expect(scene.projectionOk).toBe(true);
    expect(scene.referenceBallRadius).toBeUndefined();
  });

  it("places the Davis view by the hyperbolic orbit when geometry exists", () => {
    const system = loadExample("compact_3_tetrahedron_c44_2233");
    const scene = buildSourceComplexBase(system, ballFor(system, 2));
    expect(scene.layoutKind).toBe("hyperbolic-orbit");
    expect(scene.layoutCaveat).toContain("Incidence is exact");
    expect(scene.projectionUnavailableReason).toBeUndefined();
  });
});

describe("localGraphDistances", () => {
  const edges = [
    { source: "e", target: "a" },
    { source: "a", target: "ab" },
    { source: "ab", target: "aba" },
    { source: "e", target: "b" },
  ];

  it("computes BFS distances over undirected edges", () => {
    const distances = localGraphDistances("a", edges);
    expect(Object.fromEntries(distances)).toEqual({
      a: 0,
      e: 1,
      ab: 1,
      b: 2,
      aba: 2,
    });
  });

  it("respects maxDistance and handles no selection", () => {
    expect([...localGraphDistances("e", edges, 1).keys()].sort()).toEqual([
      "a",
      "b",
      "e",
    ]);
    expect(localGraphDistances(undefined, edges).size).toBe(0);
  });
});
