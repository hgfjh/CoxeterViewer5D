import { describe, expect, it } from "vitest";

import { buildGeneralizedCompressionCertificate } from "../src/davis/generalizedCompression";
import {
  buildExactTernaryHeightConeCover,
  replayExactTernaryHeightConeCover,
} from "../src/fibering/streamedHeightArrangement";
import {
  computeStreamedTrackBIntegralCocycleSectionDigest,
  streamStreamedTrackBLinearLinkTemplates,
  type StreamedTrackBLinearLinkTemplate,
  type StreamedTrackBLinkFailureKind,
} from "../src/fibering/streamedTrackB";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

function infiniteDihedralSystem(): CoxeterSystemInput {
  return {
    schemaVersion: 1,
    name: "Infinite-dihedral rigorous Track B fixture",
    rank: 2,
    generators: [
      { id: "s0", label: "s0" },
      { id: "s1", label: "s1" },
    ],
    coxeterMatrix: [
      [1, "inf"],
      ["inf", 1],
    ],
  };
}

/** Right action on r^k s^e for the index-six cyclic subgroup. */
function infiniteDihedralRows(rotationQuotientOrder = 3): number[][] {
  const degree = 2 * rotationQuotientOrder;
  return [
    Array.from({ length: degree }, (_unused, point) => point ^ 1),
    Array.from({ length: degree }, (_unused, point) => {
      const rotation = Math.floor(point / 2);
      const reflected = point % 2;
      return reflected === 0
        ? 2 * ((rotation - 1 + rotationQuotientOrder) % rotationQuotientOrder) +
            1
        : 2 * ((rotation + 1) % rotationQuotientOrder);
    }),
  ];
}

function componentSizes(
  selected: readonly number[],
  adjacency: readonly Uint32Array[],
): number[] {
  const unseen = new Uint8Array(adjacency.length);
  for (const index of selected) unseen[index] = 1;
  const sizes: number[] = [];
  for (const root of selected) {
    if (unseen[root] === 0) continue;
    unseen[root] = 0;
    const component = [root];
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      for (const neighbor of adjacency[component[cursor]]) {
        if (unseen[neighbor] === 0) continue;
        unseen[neighbor] = 0;
        component.push(neighbor);
      }
    }
    sizes.push(component.length);
  }
  return sizes.sort((left, right) => right - left);
}

interface ToyDirectedFailure {
  point: number;
  kind: StreamedTrackBLinkFailureKind;
  componentSizes: number[];
  templateDigest: string;
}

function directedFailure(
  template: StreamedTrackBLinearLinkTemplate,
  characterSign: -1 | 1,
  sigma: -1 | 1,
): ToyDirectedFailure | undefined {
  const ascending: number[] = [];
  const descending: number[] = [];
  for (let germIndex = 0; germIndex < template.germs.length; germIndex += 1) {
    const germ = template.germs[germIndex];
    let coefficient = 0n;
    for (const [coordinateIndex, value] of germ.coefficientPairs) {
      if (coordinateIndex !== 0) {
        throw new Error("The toy H^1 basis has only one coordinate.");
      }
      coefficient += BigInt(value);
    }
    const rawSign =
      coefficient === 0n
        ? 0
        : coefficient * BigInt(characterSign) > 0n
          ? 1
          : -1;
    const sign =
      rawSign === 0 ? Math.sign(sigma * germ.pointDifference) : rawSign;
    if (sign > 0) ascending.push(germIndex);
    else if (sign < 0) descending.push(germIndex);
    else throw new Error("The fixed point-order offset left a germ tied.");
  }

  const ascendingSizes = componentSizes(ascending, template.adjacency);
  const descendingSizes = componentSizes(descending, template.adjacency);
  const failure = (
    kind: StreamedTrackBLinkFailureKind,
    sizes: number[],
  ): ToyDirectedFailure => ({
    point: template.point,
    kind,
    componentSizes: sizes,
    templateDigest: template.templateDigest,
  });
  if (ascending.length === 0) return failure("ascending-empty", []);
  if (descending.length === 0) return failure("descending-empty", []);
  if (ascendingSizes.length !== 1) {
    return failure("ascending-disconnected", ascendingSizes);
  }
  if (descendingSizes.length !== 1) {
    return failure("descending-disconnected", descendingSizes);
  }
  return undefined;
}

describe("rigorous Track B pipeline integration", () => {
  it("passes a canonical tree-gauge H1 basis through templates and an exact pruned cone cover", () => {
    const system = infiniteDihedralSystem();
    const rows = infiniteDihedralRows();
    const action: TorsionFreeActionCandidate = {
      id: "infinite-dihedral-index-six",
      index: rows[0].length,
      generatorImages: rows,
      backend: "test-exact",
    };
    const torsionFree = certifyTorsionFreeAction(
      system,
      action,
      planSphericalSpecialSubgroups(system),
    );
    expect(torsionFree.status).toBe("passed");
    const generalizedCompression = buildGeneralizedCompressionCertificate(
      system,
      { candidate: action, certificate: torsionFree },
    );
    const oracle = buildStreamedLawfulDavisOracle({
      system,
      generatorImages: rows,
    });

    // Canonical generator-order BFS fixes a gauge: tree-edge values are zero,
    // while the sole cotree edge is the positive generator of H^1(S^1;Z).
    const parent = new Int32Array(oracle.degree);
    parent.fill(-1);
    parent[0] = 0;
    const queue = [0];
    const treeEdgeIndices = new Set<number>();
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const point = queue[cursor];
      for (
        let generator = 0;
        generator < oracle.generatorCount;
        generator += 1
      ) {
        const target = oracle.neighbor(point, generator);
        if (parent[target] !== -1) continue;
        parent[target] = point;
        queue.push(target);
        treeEdgeIndices.add(oracle.geometricEdge(point, generator).edgeIndex);
      }
    }
    expect(queue).toHaveLength(oracle.degree);
    expect(treeEdgeIndices.size).toBe(oracle.degree - 1);
    const cotreeEdgeIndices: number[] = [];
    for (let point = 0; point < oracle.degree; point += 1) {
      for (
        let generator = 0;
        generator < oracle.generatorCount;
        generator += 1
      ) {
        const geometric = oracle.geometricEdge(point, generator);
        if (
          geometric.sourcePoint === point &&
          !treeEdgeIndices.has(geometric.edgeIndex)
        ) {
          cotreeEdgeIndices.push(geometric.edgeIndex);
        }
      }
    }
    expect(cotreeEdgeIndices).toHaveLength(1);
    expect(oracle.geometricEdgeCount - oracle.degree + 1).toBe(1);
    const cotreeEdgeIndex = cotreeEdgeIndices[0];
    const edgeCoordinatePairs = (point: number, generator: number) => {
      const geometric = oracle.geometricEdge(point, generator);
      if (geometric.edgeIndex !== cotreeEdgeIndex) return [];
      return [[0, geometric.sourcePoint === point ? 1 : -1] as const] as const;
    };
    const coordinateIds = ["eta0"];
    const latticeBasisDigest = canonicalSha256({
      schemaVersion: 1,
      method: "toy-canonical-bfs-tree-h1-basis",
      oracleStructureHash: oracle.structureHash,
      root: 0,
      treeEdgeIndices: [...treeEdgeIndices].sort((a, b) => a - b),
      cotreeEdgeIndex,
      rank: 1,
    });
    const expectedCocycleSectionDigest =
      computeStreamedTrackBIntegralCocycleSectionDigest(oracle, {
        coordinateIds,
        edgeCoordinatePairs,
      });
    const toyH1Certificate = {
      status: "passed" as const,
      rank: 1,
      latticeBasisDigest,
      cocycleSectionDigest: expectedCocycleSectionDigest,
      checks: {
        quotientGraphConnected: queue.length === oracle.degree,
        bfsTreeHasExpectedSize: treeEdgeIndices.size === oracle.degree - 1,
        cotreeRankEqualsOne:
          oracle.geometricEdgeCount - oracle.degree + 1 === 1,
      },
    };
    expect(Object.values(toyH1Certificate.checks).every(Boolean)).toBe(true);

    const templates: StreamedTrackBLinearLinkTemplate[] = [];
    const templateStream = streamStreamedTrackBLinearLinkTemplates(
      {
        oracle,
        generalizedCompression,
        cocycleBasis: {
          coordinateIds,
          latticeBasisDigest,
          expectedCocycleSectionDigest,
          edgeCoordinatePairs,
        },
      },
      (template) => {
        templates.push(template);
      },
    );
    expect(templateStream).toMatchObject({
      status: "completed",
      scanOutcome: "exhaustive-request",
      coordinateCount: 1,
      checkedPointCount: 6,
      exhaustiveAllPoints: true,
      adjacencyIncluded: true,
      checks: {
        sourceReplayed: true,
        directedEdgesAntisymmetric: true,
        rankTwoBoundariesClosed: true,
        everyQuotientPointStreamed: true,
      },
    });
    expect(templateStream.latticeBasisDigest).toBe(
      toyH1Certificate.latticeBasisDigest,
    );
    expect(templateStream.cocycleSectionDigest).toBe(
      toyH1Certificate.cocycleSectionDigest,
    );

    const sigma = 1 as const;
    const cover = buildExactTernaryHeightConeCover({
      rank: 1,
      decide(context) {
        const assignment = context.assignments[0];
        if (!assignment) return { kind: "split" as const, normal: [1] };
        if (assignment.sign === 0) {
          throw new Error(
            "The cone engine should separate the zero character.",
          );
        }
        const characterSign = assignment.sign;
        const obstruction = templates
          .map((template) => directedFailure(template, characterSign, sigma))
          .find((failure) => failure !== undefined);
        if (!obstruction) {
          return {
            kind: "leaf" as const,
            value: { characterSign, sigma, outcome: "all-links-passed" },
          };
        }
        return {
          kind: "prune" as const,
          proof: {
            ...obstruction,
            characterSign,
            sigma,
            latticeBasisDigest,
            cocycleSectionDigest: expectedCocycleSectionDigest,
            heightRuleDigest: templateStream.heightRule.heightRuleDigest,
          },
        };
      },
    });
    expect(cover).toMatchObject({
      pruneLeafCount: 2,
      ordinaryLeafCount: 0,
      zeroCharacterLeafCount: 1,
    });

    const replay = replayExactTernaryHeightConeCover(cover, {
      verifyPrune: (context, proof) => {
        const assignment = context.assignments[0];
        if (
          !assignment ||
          assignment.sign === 0 ||
          assignment.sign !== proof.characterSign ||
          proof.sigma !== sigma ||
          proof.latticeBasisDigest !== latticeBasisDigest ||
          proof.cocycleSectionDigest !== expectedCocycleSectionDigest ||
          proof.heightRuleDigest !== templateStream.heightRule.heightRuleDigest
        ) {
          return false;
        }
        const template = templates.find(
          (candidate) =>
            candidate.point === proof.point &&
            candidate.templateDigest === proof.templateDigest,
        );
        if (!template) return false;
        const rebuilt = directedFailure(template, proof.characterSign, sigma);
        return (
          rebuilt?.kind === proof.kind &&
          rebuilt.componentSizes.join(",") === proof.componentSizes.join(",")
        );
      },
    });
    expect(replay).toMatchObject({
      status: "passed",
      checks: {
        storedCoverHashValid: true,
        geometryComplete: true,
        everyPruneVerified: true,
      },
    });
  });
});
