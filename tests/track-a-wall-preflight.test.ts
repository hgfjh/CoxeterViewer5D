import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseCoxeterSystemInput } from "../src/coxeter";
import { buildCoverCompression } from "../src/compression";
import {
  createBipartiteJnwMoveSystem,
  createJnwState,
  jnwOrbitToQuotientComplex,
  summarizeJnwLegalSystem,
} from "../src/game";
import {
  buildTrackAWallPreflightCertificate,
  parseTrackAWallPreflightInput,
  replayTrackAWallPreflightCertificate,
  trackAWallPreflightInputFromBarX,
  type TrackAWallPreflightCertificate,
  type TrackAWallPreflightInput,
} from "../src/walls/preflight";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const JNW_SOURCE = "public/examples/jnw_cube_graph.json";
const JNW_CERTIFICATE =
  "scripts/certificates/torsion-free/jnw_cube_graph_degree4_track_a_wall_preflight.json";
const JNW_EXPECTED_DIGEST =
  "f6b267c88b35a78092c99c8cb1ba502f4072f9dae1337023fb3f4f858adc5710";
const P2_UNAVAILABLE =
  "scripts/certificates/portfolio/makarov_p2_section5_track_a_wall_preflight_unavailable.json";
const P2_EXPECTED_DIGEST =
  "ae316c83bb59df9f247d83d5853908f70bf7aab4178e3ae0b5e9c86cea5182a9";
const CUBE_UNAVAILABLE =
  "scripts/certificates/torsion-free/compact_5_cube_index34560_track_a_wall_preflight_unavailable.json";
const CUBE_EXPECTED_DIGEST =
  "7c0f82c32cd41d439e2ffe2fce4bbdc2349f50ea1de898aefbfc29ea87eb965b";
const P2_WALL_SOURCE =
  "scripts/certificates/portfolio/makarov_p2_section5_wall_coorientation_obstruction.json";
const CUBE_COMPRESSION_SOURCE =
  "scripts/certificates/torsion-free/compact_5_cube_index34560_generalized_compression.json";

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  return value as Record<string, unknown>;
}

function buildJnwInput(): TrackAWallPreflightInput {
  const system = parseCoxeterSystemInput(loadJson(JNW_SOURCE));
  const moves = createBipartiteJnwMoveSystem(system);
  if (!moves) throw new Error("The JNW fixture must remain bipartite.");
  const orbit = summarizeJnwLegalSystem(
    system,
    moves,
    createJnwState([0, 2, 6, 7]),
  );
  const cover = buildCoverCompression(jnwOrbitToQuotientComplex(system, orbit));
  return trackAWallPreflightInputFromBarX(cover.barX, {
    kind: "bar-x-compression",
    name: "JNW degree-four move-kernel bar-X compression",
    notes: [
      "Materialized from the bundled verified JNW cube-graph source and its complete four-state move orbit.",
      "This Track A preflight is independent of the existing JNW cellular-cocycle positive control.",
    ],
  });
}

function loopFixture(
  name: string,
  cellBoundaries: Record<string, string[]>,
): TrackAWallPreflightInput {
  const edgeIds = [...new Set(Object.values(cellBoundaries).flat())].sort();
  return parseTrackAWallPreflightInput({
    schemaVersion: 1,
    kind: "track-a-wall-preflight-input",
    name,
    source: { kind: "abstract-rank-two-complex", name },
    vertices: [{ id: "v" }],
    edges: edgeIds.map((id) => ({
      id,
      sourceVertexId: "v",
      targetVertexId: "v",
    })),
    rankTwoCells: Object.entries(cellBoundaries).map(([id, boundary]) => ({
      id,
      boundary: boundary.map((edgeId) => ({ edgeId, traversal: 1 })),
    })),
  });
}

function disjointCopies(
  source: TrackAWallPreflightInput,
  copyCount: number,
): TrackAWallPreflightInput {
  return parseTrackAWallPreflightInput({
    schemaVersion: 1,
    kind: "track-a-wall-preflight-input",
    name: `${copyCount} disjoint JNW copies`,
    source: {
      kind: "abstract-rank-two-complex",
      name: "scalability fixture",
    },
    vertices: Array.from({ length: copyCount }, (_unused, copy) =>
      source.vertices.map((vertex) => ({ id: `c${copy}:${vertex.id}` })),
    ).flat(),
    edges: Array.from({ length: copyCount }, (_unused, copy) =>
      source.edges.map((edge) => ({
        ...edge,
        id: `c${copy}:${edge.id}`,
        sourceVertexId: `c${copy}:${edge.sourceVertexId}`,
        targetVertexId: `c${copy}:${edge.targetVertexId}`,
      })),
    ).flat(),
    rankTwoCells: Array.from({ length: copyCount }, (_unused, copy) =>
      source.rankTwoCells.map((cell) => ({
        ...cell,
        id: `c${copy}:${cell.id}`,
        boundary: cell.boundary.map((occurrence) => ({
          ...occurrence,
          edgeId: `c${copy}:${occurrence.edgeId}`,
        })),
        ...(cell.wallSegments
          ? {
              wallSegments: cell.wallSegments.map((segment) => ({
                ...segment,
                ...(segment.id ? { id: `c${copy}:${segment.id}` } : {}),
              })),
            }
          : {}),
      })),
    ).flat(),
  });
}

describe("generic Track A wall-cleanliness and rank-two Morse preflight", () => {
  it("seals and replays the JNW degree-four whole-wall positive control", () => {
    const input = buildJnwInput();
    const certificate = buildTrackAWallPreflightCertificate(input);
    const stored = loadJson(JNW_CERTIFICATE) as TrackAWallPreflightCertificate;

    expect(certificate.status).toBe("rank-two-feasible");
    expect(certificate.cleanliness).toMatchObject({
      wallCount: 8,
      segmentCount: 24,
      germCount: 32,
      twoSided: true,
      twoSidedWallCount: 8,
      repeatedWallGermFree: true,
      selfIntersectionFree: true,
      selfOsculationFree: true,
      interOsculationFree: true,
    });
    expect(certificate.cleanliness.pathologyCounts).toMatchObject({
      oneSidedWalls: { count: 0, universe: 8, unit: "wall" },
      parityConflictSegments: {
        count: 0,
        universe: 24,
        unit: "dual-segment",
      },
      repeatedWallGermSites: {
        count: 0,
        universe: 32,
        unit: "vertex-wall-site",
      },
      selfIntersectionSites: {
        count: 0,
        universe: 36,
        unit: "declared-local-intersection-site",
      },
      crossingWallPairs: {
        count: 12,
        universe: 28,
        unit: "unordered-wall-pair",
      },
      osculatingWallPairs: {
        count: 16,
        universe: 28,
        unit: "unordered-wall-pair",
      },
      interOsculatingWallPairs: {
        count: 0,
        universe: 28,
        unit: "unordered-wall-pair",
      },
    });
    expect(certificate.perVertexNecessaryFeasibility).toMatchObject({
      vertexCount: 4,
      feasibleVertexCount: 4,
      infeasibleVertexCount: 0,
      incompleteVertexCount: 0,
      everyVertexIndividuallyFeasible: true,
    });
    expect(certificate.globalMorseFeasibility).toMatchObject({
      status: "feasible",
      exact: true,
      wallVariableCount: 8,
      freeVariableCount: 7,
      assignmentSpaceSize: 128,
      assignmentsTested: 14,
      terminationReason: "witness-found",
    });
    expect(certificate.triage.map((entry) => entry.disposition)).toEqual([
      "pass",
      "pass",
      "survivor",
      "diagnostic-only",
    ]);
    expect(certificate.artifactDigest).toBe(JNW_EXPECTED_DIGEST);
    expect(certificate.artifactDigest).toBe(stored.artifactDigest);
    expect(replayTrackAWallPreflightCertificate(stored, input).valid).toBe(
      true,
    );
  });

  it("treats two-sidedness as a hard gate over the entire wall component", () => {
    const certificate = buildTrackAWallPreflightCertificate(
      loopFixture("odd parity wall", {
        ab: ["a", "x", "b", "y"],
        bc: ["b", "u", "c", "v"],
        ca: ["c", "p", "a", "q"],
      }),
    );

    expect(certificate.cleanliness.twoSided).toBe(false);
    expect(certificate.cleanliness.oneSidedWallIds).toHaveLength(1);
    expect(
      certificate.cleanliness.pathologyCounts.parityConflictSegments.count,
    ).toBe(1);
    expect(certificate.globalMorseFeasibility).toMatchObject({
      status: "infeasible",
      exact: true,
      assignmentsTested: 0,
      terminationReason: "one-sided-wall-gate",
    });
    expect(certificate.triage[0].disposition).toBe("hard-stop");
    expect(certificate.conclusion).toContain("two-sidedness gate");
  });

  it("reports self-intersection, self-osculation, crossing, and inter-osculation without using them as vetoes", () => {
    const selfCrossing = buildTrackAWallPreflightCertificate(
      loopFixture("self-crossing wall", {
        crossing: ["a", "b", "c", "d"],
        merge: ["a", "x", "b", "y"],
      }),
    );
    expect(selfCrossing.cleanliness.selfIntersectionFree).toBe(false);
    expect(
      selfCrossing.cleanliness.selfIntersections.some(
        (entry) => entry.kind === "crossing-segments-have-same-wall",
      ),
    ).toBe(true);
    expect(
      selfCrossing.cleanliness.directSelfOsculations.length +
        selfCrossing.cleanliness.indirectSelfOsculations.length,
    ).toBeGreaterThan(0);
    expect(selfCrossing.triage[3].disposition).toBe("diagnostic-only");

    const interOsculating = buildTrackAWallPreflightCertificate(
      loopFixture("inter-osculating pair", {
        square: ["a", "b", "c", "d"],
      }),
    );
    expect(interOsculating.cleanliness.wallPairInteractions).toHaveLength(1);
    expect(interOsculating.cleanliness.wallPairInteractions[0]).toMatchObject({
      crosses: true,
      osculates: true,
      interOsculates: true,
    });
    expect(
      interOsculating.cleanliness.pathologyCounts.interOsculatingWallPairs,
    ).toMatchObject({ count: 1, universe: 1 });
  });

  it("runs projected vertex tests above the global wall limit and enforces assignment caps", () => {
    const jnw = buildJnwInput();
    const large = buildTrackAWallPreflightCertificate(disjointCopies(jnw, 4), {
      exactWallLimit: 24,
      perVertexExactWallLimit: 24,
      assignmentCap: 100_000,
    });
    expect(large.cleanliness.wallCount).toBe(32);
    expect(large.globalMorseFeasibility.status).toBe("not-run-variable-limit");
    expect(large.perVertexNecessaryFeasibility).toMatchObject({
      vertexCount: 16,
      feasibleVertexCount: 16,
      incompleteVertexCount: 0,
      everyVertexIndividuallyFeasible: true,
    });
    expect(
      Math.max(
        ...large.perVertexNecessaryFeasibility.records.map(
          (record) => record.wallVariableCount,
        ),
      ),
    ).toBe(8);

    const capped = buildTrackAWallPreflightCertificate(jnw, {
      assignmentCap: 1,
    });
    expect(capped.globalMorseFeasibility).toMatchObject({
      status: "not-run-assignment-cap",
      exact: false,
      assignmentSpaceSize: 128,
      assignmentsTested: 1,
      terminationReason: "assignment-cap",
    });
    expect(capped.perVertexNecessaryFeasibility).toMatchObject({
      assignmentCapPerVertex: 1,
      incompleteVertexCount: 2,
      everyVertexIndividuallyFeasible: null,
    });
    expect(
      capped.perVertexNecessaryFeasibility.records.every(
        (record) => record.assignmentsTested <= 1,
      ),
    ).toBe(true);
    expect(capped.status).toBe("preflight-incomplete");
    expect(capped.conclusion).toContain("declared variable or assignment cap");
  });

  it("seals explicit P2 and compact-cube non-runnable records", () => {
    const p2 = asRecord(loadJson(P2_UNAVAILABLE));
    const cube = asRecord(loadJson(CUBE_UNAVAILABLE));
    for (const artifact of [p2, cube]) {
      const body = { ...artifact };
      const digest = body.artifactDigest;
      delete body.artifactDigest;
      expect(digest).toBe(canonicalSha256(body));
    }
    expect(p2).toMatchObject({
      artifactDigest: P2_EXPECTED_DIGEST,
      status: "hard-stop-one-sided",
      gate: {
        twoSidedness: "failed-by-bound-source-certificate",
        rankTwoComplexMaterialized: false,
      },
    });
    expect(cube).toMatchObject({
      artifactDigest: CUBE_EXPECTED_DIGEST,
      status: "not-runnable-unmaterialized",
      gate: {
        twoSidedness: "not-recomputed-without-materialized-rank-two-complex",
        rankTwoComplexMaterialized: false,
      },
    });
    expect(asRecord(p2.source).artifactCanonicalSha256).toBe(
      canonicalSha256(loadJson(P2_WALL_SOURCE)),
    );
    expect(asRecord(cube.source).artifactCanonicalSha256).toBe(
      canonicalSha256(loadJson(CUBE_COMPRESSION_SOURCE)),
    );
  });
});
