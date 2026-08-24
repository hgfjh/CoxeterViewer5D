import { describe, expect, it } from "vitest";

import { planSphericalSpecialSubgroups } from "../src/torsionFree/sphericalPlanning";
import { canonicalSha256 } from "../src/utils/canonicalSha256";
import {
  applySymbolicGeneratorTransition,
  assertSymbolicRegularCoverClaimAllowed,
  buildExactSymbolicWallOrbitCatalogue,
  buildSymbolicRegularKernelCover,
  buildSymmetryRestrictedWallSpace,
  certifyExactSymbolicDirectedLinks,
  certifyExactSymbolicPullingMorseModel,
  certifyExactSymbolicSchreierHomomorphism,
  certifySymbolicRegularKernelFibering,
  createSymmetryRestrictedCoorientation,
  flipSymmetryRestrictedWallVariable,
  replayExactOrbitPartition,
  searchSymmetryRestrictedCoorientations,
  symbolicCoorientationDigest,
  symbolicCoxeterMatrixDigest,
  symbolicWallSpaceDigest,
  traceSymbolicRegularCoverWord,
  type BuildSymmetryRestrictedWallSpaceInput,
  type ExactDeckGroupOracle,
  type ExactSymbolicCellBoundaryCatalogue,
  type ExactSymbolicLinkOrbitCatalogue,
  type ExactSymbolicDirectedLinkOracle,
  type ExactSymbolicPullingMorseOracle,
  type ExactSymbolicPullingMorseReplay,
  type ExactSymbolicSchreierOracle,
  type ExactSymbolicWallIncidenceCatalogue,
} from "../src/torsionFree/symbolicRegularCover";
import type { CoxeterSystemInput } from "../src/types";

const COMMUTING_PAIR: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "A1 x A1 symbolic kernel",
  rank: 2,
  generators: [
    { id: "s0", label: "s0" },
    { id: "s1", label: "s1" },
  ],
  coxeterMatrix: [
    [1, 2],
    [2, 1],
  ],
};

const UNIVERSAL_PAIR: CoxeterSystemInput = {
  ...COMMUTING_PAIR,
  name: "Universal rank-two symbolic kernel",
  coxeterMatrix: [
    [1, "inf"],
    ["inf", 1],
  ],
};

function sha256(value: unknown): string {
  return `sha256:${canonicalSha256(value)}`;
}

function singletonOrbitReplay(keys: string[], method: string) {
  return replayExactOrbitPartition({
    method,
    objectKeys: [...keys].sort(),
    generatorIds: [],
    transitions: [],
  });
}

function kleinFourOracle(
  generatorImages: readonly number[] = [1, 2],
  system: CoxeterSystemInput = COMMUTING_PAIR,
): ExactDeckGroupOracle<number> {
  const digest = symbolicCoxeterMatrixDigest(system);
  return {
    id: "Q:klein-four",
    name: "C2 x C2",
    identity: 0,
    generatorImages,
    multiply: (left, right) => left ^ right,
    inverse: (element) => element,
    key: (element) => `q${element}`,
    certificate: {
      status: "passed",
      method: "exact-bit-vector-group",
      deckGroupId: "Q:klein-four",
      sourceSystem: {
        name: system.name,
        rank: system.rank,
        coxeterMatrixDigest: digest,
      },
      groupOrder: { decimal: "4", safeInteger: 4 },
      generatorClosureOrder: { decimal: "4", safeInteger: 4 },
      checks: {
        exactOperations: true,
        canonicalElementKeys: true,
        finiteGroupOrder: true,
        generatorsGenerateDeckGroup: true,
      },
      certificateHash: sha256({ kind: "klein-four-test", system }),
    },
  };
}

function buildKleinFourCover() {
  return buildSymbolicRegularKernelCover(
    COMMUTING_PAIR,
    kleinFourOracle(),
    planSphericalSpecialSubgroups(COMMUTING_PAIR),
  );
}

function wallSpaceInput(
  coverId: string,
): BuildSymmetryRestrictedWallSpaceInput {
  return {
    symmetry: {
      id: "sym:C2",
      name: "order-two deck symmetry",
      deckGroupId: "Q:klein-four",
      order: { decimal: "2", safeInteger: 2 },
      generatorElementKeys: ["q1"],
      action: "left-deck-transformations",
      certificate: {
        status: "passed",
        method: "exact-subgroup-enumeration",
        checks: {
          subgroupOrderVerified: true,
          generatorsBelongToDeckGroup: true,
          actionPreservesCoverIncidence: true,
        },
        certificateHash: "sha256:symmetry-test",
      },
    },
    wallCatalogue: {
      status: "passed",
      method: "exact-wall-deck-orbits",
      sourceCoverId: coverId,
      exhaustive: true,
      wallOrbits: [
        {
          id: "wall-orbit:s0",
          representativeWallKey: "wall:q0:s0",
          representativeGenerator: 0,
          wallCount: { decimal: "2", safeInteger: 2 },
          stabilizerOrder: { decimal: "2", safeInteger: 2 },
          twoSided: true,
          sideStabilizerPreserving: true,
          certificateHash: "sha256:wall-s0",
        },
        {
          id: "wall-orbit:s1",
          representativeWallKey: "wall:q0:s1",
          representativeGenerator: 1,
          wallCount: { decimal: "2", safeInteger: 2 },
          stabilizerOrder: { decimal: "2", safeInteger: 2 },
          twoSided: true,
          sideStabilizerPreserving: true,
          certificateHash: "sha256:wall-s1",
        },
      ],
      checks: {
        deckOrbitPartitionVerified: true,
        stabilizerOrdersVerified: true,
        twoSidednessVerified: true,
      },
      certificateHash: "sha256:wall-catalogue",
    },
    variables: [
      {
        id: "x:s0:a",
        wallDeckOrbitId: "wall-orbit:s0",
        representativeWallKey: "wall:q0:s0",
        wallCount: { decimal: "1", safeInteger: 1 },
        stabilizerPreservesSides: true,
        sideTransportCertificateHash: "sha256:transport-s0-a",
      },
      {
        id: "x:s0:b",
        wallDeckOrbitId: "wall-orbit:s0",
        representativeWallKey: "wall:q2:s0",
        wallCount: { decimal: "1", safeInteger: 1 },
        stabilizerPreservesSides: true,
        sideTransportCertificateHash: "sha256:transport-s0-b",
      },
      {
        id: "x:s1",
        wallDeckOrbitId: "wall-orbit:s1",
        representativeWallKey: "wall:q0:s1",
        wallCount: { decimal: "2", safeInteger: 2 },
        stabilizerPreservesSides: true,
        sideTransportCertificateHash: "sha256:transport-s1",
      },
    ],
    partitionCertificate: {
      status: "passed",
      method: "exact-double-coset-partition",
      sourceCoverId: coverId,
      symmetrySubgroupId: "sym:C2",
      checks: {
        doubleCosetOrbitsComplete: true,
        orbitCardinalitiesVerified: true,
        sideTransportConsistent: true,
      },
      certificateHash: "sha256:wall-partition",
    },
  };
}

function buildPositiveSymbolicFiberingFixture() {
  const sphericalPlan = planSphericalSpecialSubgroups(UNIVERSAL_PAIR);
  const cover = buildSymbolicRegularKernelCover(
    UNIVERSAL_PAIR,
    kleinFourOracle([1, 2], UNIVERSAL_PAIR),
    sphericalPlan,
    {
      sphericalPlanSourceBinding: {
        status: "passed",
        method: "exact-planner-replay",
        sourceSystemSha256: sha256(UNIVERSAL_PAIR),
        sphericalPlanSha256: sha256(sphericalPlan),
        checks: {
          fullCoxeterInputHashed: true,
          sphericalPlanHashed: true,
          planDerivedFromSource: true,
          replayedByExactPlanner: true,
        },
        replayHash: sha256({ UNIVERSAL_PAIR, sphericalPlan }),
      },
    },
  );
  const incidence: ExactSymbolicWallIncidenceCatalogue = {
    status: "passed",
    method: "complete-square-graph-edge-incidence",
    sourceCoverId: cover.id,
    exhaustive: true,
    edgeOrbits: [0, 1].map((generator) => ({
      id: `edge:g${generator}`,
      sphericalCellOrbitId: `cell-orbit:T:${generator}`,
      generator,
      representativeEdgeKey: `edge:q0:g${generator}`,
      edgeCount: { decimal: "2", safeInteger: 2 },
      exact: true as const,
    })),
    rankTwoCellOrbits: [],
    wallOrbitEvidence: [0, 1].map((generator) => ({
      id: `wall-orbit:g${generator}`,
      edgeOrbitIds: [`edge:g${generator}`],
      representativeWallKey: `wall:q0:g${generator}`,
      representativeGenerator: generator,
      wallCount: { decimal: "2", safeInteger: 2 },
      stabilizerOrder: { decimal: "2", safeInteger: 2 },
      sideTransport: {
        status: "passed" as const,
        method: "exact-kernel-loop-side-replay",
        complete: true,
        twoSided: true,
        stabilizerPreservesSides: true,
        checks: {
          localSidesAssigned: true,
          oppositeEdgeTransportReplayed: true,
          stabilizerLoopsReplayed: true,
          noKernelLoopReversesSides: true,
        },
        certificateHash: sha256(`side-g${generator}`),
      },
    })),
    orbitPartitionReplay: singletonOrbitReplay(
      ["wall:q0:g0", "wall:q0:g1"],
      "exact-wall-orbit-partition-replay",
    ),
    checks: {
      edgeOrbitCatalogueComplete: true,
      rankTwoCellOrbitCatalogueComplete: true,
      oppositeEdgeIncidenceExact: true,
      wallStabilizersExact: true,
      sideTransportExact: true,
    },
    certificateHash: sha256("universal-pair-wall-incidence"),
  };
  const wallCatalogue = buildExactSymbolicWallOrbitCatalogue(cover, incidence);
  const wallSpace = buildSymmetryRestrictedWallSpace(cover, {
    symmetry: {
      id: "sym:identity",
      name: "identity deck symmetry",
      deckGroupId: cover.deckGroup.id,
      order: { decimal: "1", safeInteger: 1 },
      generatorElementKeys: [],
      action: "left-deck-transformations",
      certificate: {
        status: "passed",
        method: "exact-identity-subgroup",
        checks: {
          subgroupOrderVerified: true,
          generatorsBelongToDeckGroup: true,
          actionPreservesCoverIncidence: true,
        },
        certificateHash: sha256("identity-symmetry"),
      },
    },
    wallCatalogue,
    variables: [
      {
        id: "x:g0:a",
        wallDeckOrbitId: "wall-orbit:g0",
        representativeWallKey: "wall:q0:g0",
        wallCount: { decimal: "1", safeInteger: 1 },
        stabilizerPreservesSides: true,
        sideTransportCertificateHash: sha256("x-g0-a"),
      },
      {
        id: "x:g0:b",
        wallDeckOrbitId: "wall-orbit:g0",
        representativeWallKey: "wall:q2:g0",
        wallCount: { decimal: "1", safeInteger: 1 },
        stabilizerPreservesSides: true,
        sideTransportCertificateHash: sha256("x-g0-b"),
      },
      {
        id: "x:g1:a",
        wallDeckOrbitId: "wall-orbit:g1",
        representativeWallKey: "wall:q0:g1",
        wallCount: { decimal: "1", safeInteger: 1 },
        stabilizerPreservesSides: true,
        sideTransportCertificateHash: sha256("x-g1-a"),
      },
      {
        id: "x:g1:b",
        wallDeckOrbitId: "wall-orbit:g1",
        representativeWallKey: "wall:q1:g1",
        wallCount: { decimal: "1", safeInteger: 1 },
        stabilizerPreservesSides: true,
        sideTransportCertificateHash: sha256("x-g1-b"),
      },
    ],
    partitionCertificate: {
      status: "passed",
      method: "exact-identity-orbits",
      sourceCoverId: cover.id,
      symmetrySubgroupId: "sym:identity",
      checks: {
        doubleCosetOrbitsComplete: true,
        orbitCardinalitiesVerified: true,
        sideTransportConsistent: true,
      },
      certificateHash: sha256("identity-wall-partition"),
    },
  });
  const boundaryCatalogue: ExactSymbolicCellBoundaryCatalogue = {
    status: "passed",
    method: "complete-empty-rank-two-catalogue",
    sourceCoverId: cover.id,
    wallSpaceHash: symbolicWallSpaceDigest(wallSpace),
    exhaustive: true,
    representatives: [],
    orbitPartitionReplay: singletonOrbitReplay(
      [],
      "exact-empty-cell-orbit-partition",
    ),
    checks: {
      cellOrbitRepresentativesComplete: true,
      boundaryCyclesExact: true,
      wallVariablesResolved: true,
      orientationsReplayed: true,
    },
    certificateHash: sha256("empty-cell-boundaries"),
  };
  const search = searchSymmetryRestrictedCoorientations(
    cover,
    wallSpace,
    boundaryCatalogue,
  );
  if (search.solution === undefined || search.cocycle === undefined) {
    throw new Error("The universal-pair fixture must have a coorientation.");
  }
  const coorientationHash = symbolicCoorientationDigest(search.solution);
  const schreierOracle: ExactSymbolicSchreierOracle = {
    status: "passed",
    method: "exact-shortlex-transversal-replay",
    sourceCoverId: cover.id,
    coorientationHash,
    exhaustive: true,
    transversalRepresentativeKeys: ["q0", "q1", "q2", "q3"],
    transversalOrbitPartitionReplay: singletonOrbitReplay(
      ["q0", "q1", "q2", "q3"],
      "exact-transversal-replay",
    ),
    generators: [
      {
        id: "h0",
        sourceDeckElementKey: "q0",
        generator: 0,
        targetTransversalDeckElementKey: "q0",
        kernelWord: [0, 1, 0, 1],
      },
    ],
    relations: [],
    checks: {
      transversalComplete: true,
      schreierGeneratorsComplete: true,
      presentationRelationsComplete: true,
      wordActionsExact: true,
    },
    certificateHash: sha256("universal-pair-schreier"),
    replayGenerator: () => ({
      closesInKernel: true,
      value: 2n,
      replayHash: sha256("h0-replay"),
    }),
    replayRelation: () => ({
      closesInKernel: true,
      replayHash: sha256("vacuous-relation-replay"),
    }),
  };
  const schreier = certifyExactSymbolicSchreierHomomorphism(
    cover,
    search.solution,
    schreierOracle,
  );
  const pullingOracle: ExactSymbolicPullingMorseOracle = {
    method: "exact-test-square-pulling-recomputation",
    recompute: ({ coorientation }) => {
      const sign = (variableId: string) =>
        BigInt(coorientation.variableSigns[variableId]);
      const q0 = 0n;
      const q1 = q0 + sign("x:g0:a");
      const q2 = q0 + sign("x:g1:a");
      const q3 = q2 + sign("x:g0:b");
      const simplices = [
        { id: "edge:q0:g0", vertexIds: ["q0", "q1"] },
        { id: "edge:q2:g0", vertexIds: ["q2", "q3"] },
        { id: "edge:q0:g1", vertexIds: ["q0", "q2"] },
        { id: "edge:q1:g1", vertexIds: ["q1", "q3"] },
      ];
      return {
        exhaustive: true,
        vertices: [q0, q1, q2, q3].map((height, index) => ({
          id: `q${index}`,
          integratedHeight: { decimal: height.toString() },
        })),
        simplices,
        directedEdges: [
          {
            id: "edge:q0:g0",
            sourceVertexId: "q0",
            targetVertexId: "q1",
            variableId: "x:g0:a",
            orientation: 1 as const,
          },
          {
            id: "edge:q2:g0",
            sourceVertexId: "q2",
            targetVertexId: "q3",
            variableId: "x:g0:b",
            orientation: 1 as const,
          },
          {
            id: "edge:q0:g1",
            sourceVertexId: "q0",
            targetVertexId: "q2",
            variableId: "x:g1:a",
            orientation: 1 as const,
          },
          {
            id: "edge:q1:g1",
            sourceVertexId: "q1",
            targetVertexId: "q3",
            variableId: "x:g1:b",
            orientation: 1 as const,
          },
        ],
        simplexOrbitAction: {
          method: "exact-test-simplex-orbits",
          objectKeys: simplices.map((simplex) => simplex.id).sort(),
          generatorIds: [],
          transitions: [],
        },
      };
    },
  };
  const pullingMorse = certifyExactSymbolicPullingMorseModel(
    cover,
    search.solution,
    schreier,
    pullingOracle,
  );
  const linkOracle: ExactSymbolicDirectedLinkOracle = {
    method: "exact-test-link-recomputation",
    recompute: () => ({
      exhaustive: true,
      representatives: Array.from({ length: 4 }, (_unused, index) => ({
        id: `vertex-orbit:q${index}`,
        vertexKey: `q${index}`,
        representedVertexCount: { decimal: "1", safeInteger: 1 },
        fullLink: {
          vertices: ["toward", "away"],
          facets: [["toward"], ["away"]],
        },
        directions: [
          { vertexId: "toward", value: { decimal: "-1", safeInteger: -1 } },
          { vertexId: "away", value: { decimal: "1", safeInteger: 1 } },
        ],
      })),
      vertexOrbitAction: {
        method: "exact-test-link-vertex-orbits",
        objectKeys: ["q0", "q1", "q2", "q3"],
        generatorIds: [],
        transitions: [],
      },
    }),
  };
  const links = certifyExactSymbolicDirectedLinks(
    cover,
    search.solution,
    schreier,
    pullingMorse,
    linkOracle,
    {
      checkCollapsibility: () => ({
        status: "collapsible",
        collapseSequence: [],
      }),
    },
  );
  const promotion = certifySymbolicRegularKernelFibering(cover, {
    wallCatalogue,
    wallSpace,
    search,
    boundaryCatalogue,
    cocycle: search.cocycle,
    schreier,
    pullingMorse,
    links,
  });
  return {
    cover,
    wallCatalogue,
    wallSpace,
    boundaryCatalogue,
    search,
    schreier,
    pullingOracle,
    pullingMorse,
    linkOracle,
    links,
    promotion,
  };
}

describe("symbolic regular kernel covers", () => {
  it("stores exact right transitions and spherical cells as deck-group orbits", () => {
    const oracle = kleinFourOracle();
    const cover = buildKleinFourCover();

    expect(cover).toMatchObject({
      kind: "symbolic-regular-kernel-cover",
      kernelIndex: { decimal: "4", safeInteger: 4 },
      vertexOrbit: {
        vertexCount: { decimal: "4", safeInteger: 4 },
        deckOrbitCount: 1,
        stabilizerOrder: { decimal: "1", safeInteger: 1 },
      },
      certificate: {
        status: "passed",
        checks: {
          generatorInvolutions: true,
          finiteCoxeterRelations: true,
          sphericalRestrictionsFaithful: true,
        },
      },
    });
    expect(cover.generatorTransitions).toEqual([
      expect.objectContaining({
        generator: 0,
        rightFactorKey: "q1",
        target: {
          kind: "right-product",
          leftParameter: "q",
          rightFactorKey: "q1",
        },
      }),
      expect.objectContaining({ generator: 1, rightFactorKey: "q2" }),
    ]);

    expect(applySymbolicGeneratorTransition(cover, oracle, 2, 0)).toBe(3);
    expect(traceSymbolicRegularCoverWord(cover, oracle, 2, [0, 1, 0, 1])).toBe(
      2,
    );

    const counts = Object.fromEntries(
      cover.sphericalCellOrbits.map((orbit) => [
        orbit.sphericalSubsetId,
        orbit.cellCount.decimal,
      ]),
    );
    expect(counts).toEqual({
      "T:empty": "4",
      "T:0": "2",
      "T:1": "2",
      "T:0,1": "1",
    });
    expect(
      cover.sphericalFaceOrbits.find(
        (incidence) => incidence.id === "face-orbit:T:empty<T:0,1",
      ),
    ).toMatchObject({ codimension: 2, facesPerCoface: { decimal: "4" } });
    expect(cover.scientificSourceBinding).toBeUndefined();
    expect(cover.certificate.checks.sphericalPlanSourceBound).toBe(false);
    expect(cover.completeness.promotionGate.sourceAndSphericalPlanBound).toBe(
      false,
    );
  });

  it("rejects a stale full-source binding for the spherical plan", () => {
    const plan = planSphericalSpecialSubgroups(COMMUTING_PAIR);

    expect(() =>
      buildSymbolicRegularKernelCover(COMMUTING_PAIR, kleinFourOracle(), plan, {
        sphericalPlanSourceBinding: {
          status: "passed",
          method: "stale-test-binding",
          sourceSystemSha256: sha256("another-system"),
          sphericalPlanSha256: sha256(plan),
          checks: {
            fullCoxeterInputHashed: true,
            sphericalPlanHashed: true,
            planDerivedFromSource: true,
            replayedByExactPlanner: true,
          },
          replayHash: sha256("stale-plan-replay"),
        },
      }),
    ).toThrow(/spherical-subset plan source binding is stale/);
  });

  it("rejects a non-SHA deck-group certificate hash", () => {
    const oracle = kleinFourOracle();
    oracle.certificate.certificateHash = "fnv1a64:0123456789abcdef";

    expect(() =>
      buildSymbolicRegularKernelCover(
        COMMUTING_PAIR,
        oracle,
        planSphericalSpecialSubgroups(COMMUTING_PAIR),
      ),
    ).toThrow(/deck-group certificate must carry a SHA-256 hash/);
  });

  it("rejects a regular kernel whose spherical restriction is not faithful", () => {
    const collapsed = kleinFourOracle([1, 1]);

    expect(() =>
      buildSymbolicRegularKernelCover(
        COMMUTING_PAIR,
        collapsed,
        planSphericalSpecialSubgroups(COMMUTING_PAIR),
      ),
    ).toThrow(/exact image has order 2/);
  });

  it("rejects an oracle certificate bound to another Coxeter matrix", () => {
    const stale = kleinFourOracle();
    stale.certificate.sourceSystem.coxeterMatrixDigest = "fnv1a64:stale";

    expect(() =>
      buildSymbolicRegularKernelCover(
        COMMUTING_PAIR,
        stale,
        planSphericalSpecialSubgroups(COMMUTING_PAIR),
      ),
    ).toThrow(/bound to another Coxeter system/);
  });

  it("constructs wall deck orbits from exact opposite edges in rank-two cells", () => {
    const cover = buildKleinFourCover();
    const incidence: ExactSymbolicWallIncidenceCatalogue = {
      status: "passed",
      method: "exact-square-opposite-edges",
      sourceCoverId: cover.id,
      exhaustive: true,
      edgeOrbits: [0, 1].map((generator) => ({
        id: `edge:g${generator}`,
        sphericalCellOrbitId: `cell-orbit:T:${generator}`,
        generator,
        representativeEdgeKey: `edge:q0:g${generator}`,
        edgeCount: { decimal: "2", safeInteger: 2 },
        exact: true as const,
      })),
      rankTwoCellOrbits: [
        {
          id: "cell:q0:0,1",
          sphericalCellOrbitId: "cell-orbit:T:0,1",
          representedCellCount: { decimal: "1", safeInteger: 1 },
          m: 2,
          boundaryEdgeOrbitIds: ["edge:g0", "edge:g1", "edge:g0", "edge:g1"],
          certificateHash: sha256("square-boundary"),
        },
      ],
      wallOrbitEvidence: [0, 1].map((generator) => ({
        id: `wall-orbit:g${generator}`,
        edgeOrbitIds: [`edge:g${generator}`],
        representativeWallKey: `wall:q0:g${generator}`,
        representativeGenerator: generator,
        wallCount: { decimal: "2", safeInteger: 2 },
        stabilizerOrder: { decimal: "2", safeInteger: 2 },
        sideTransport: {
          status: "passed" as const,
          method: "exact-side-transport",
          complete: true,
          twoSided: true,
          stabilizerPreservesSides: true,
          checks: {
            localSidesAssigned: true,
            oppositeEdgeTransportReplayed: true,
            stabilizerLoopsReplayed: true,
            noKernelLoopReversesSides: true,
          },
          certificateHash: sha256(`square-side-g${generator}`),
        },
      })),
      orbitPartitionReplay: singletonOrbitReplay(
        ["wall:q0:g0", "wall:q0:g1"],
        "exact-square-wall-partition",
      ),
      checks: {
        edgeOrbitCatalogueComplete: true,
        rankTwoCellOrbitCatalogueComplete: true,
        oppositeEdgeIncidenceExact: true,
        wallStabilizersExact: true,
        sideTransportExact: true,
      },
      certificateHash: sha256("square-wall-incidence"),
    };

    const catalogue = buildExactSymbolicWallOrbitCatalogue(cover, incidence);

    expect(catalogue.wallOrbits.map((wall) => wall.id)).toEqual([
      "wall-orbit:g0",
      "wall-orbit:g1",
    ]);
    expect(catalogue).toMatchObject({
      exhaustive: true,
      checks: {
        rankTwoOppositeIncidenceVerified: true,
        sideTransportVerified: true,
      },
      sourceIncidenceHash: sha256("square-wall-incidence"),
    });
  });
});

describe("symmetry-restricted symbolic wall variables", () => {
  it("partitions exact wall counts and transports one sign per symmetry orbit", () => {
    const cover = buildKleinFourCover();
    const wallSpace = buildSymmetryRestrictedWallSpace(
      cover,
      wallSpaceInput(cover.id),
    );
    const coorientation = createSymmetryRestrictedCoorientation(wallSpace, {
      "x:s0:a": -1,
      "x:s1": -1,
    });

    expect(wallSpace.variables.map((variable) => variable.id)).toEqual([
      "x:s0:a",
      "x:s0:b",
      "x:s1",
    ]);
    expect(wallSpace).toMatchObject({
      exactWithinRestrictedSpace: true,
      completeness: {
        wallSearch: {
          kind: "symmetry-restricted",
          symmetrySubgroupId: "sym:C2",
          exhaustiveWithinRestrictedSpace: true,
          exhaustiveWithoutSymmetryRestriction: false,
        },
        promotionGate: { positiveWitnessVerified: false },
      },
    });
    expect(coorientation).toMatchObject({
      valid: true,
      exactWithinRestrictedSpace: true,
      variableSigns: { "x:s0:a": -1, "x:s0:b": 1, "x:s1": -1 },
    });
    expect(
      flipSymmetryRestrictedWallVariable(wallSpace, coorientation, "x:s0:b")
        .variableSigns["x:s0:b"],
    ).toBe(-1);
  });

  it("rejects an incomplete symmetry partition of a wall deck orbit", () => {
    const cover = buildKleinFourCover();
    const input = wallSpaceInput(cover.id);
    input.variables = input.variables.filter(
      (variable) => variable.id !== "x:s0:b",
    );

    expect(() => buildSymmetryRestrictedWallSpace(cover, input)).toThrow(
      /cover 1 walls in wall-orbit:s0; expected 2/,
    );
  });

  it("prevents restricted variables from being promoted to fibering claims", () => {
    const cover = buildKleinFourCover();
    const wallSpace = buildSymmetryRestrictedWallSpace(
      cover,
      wallSpaceInput(cover.id),
    );

    expect(() =>
      assertSymbolicRegularCoverClaimAllowed(
        wallSpace.completeness,
        "symmetry-restricted-wall-search",
      ),
    ).not.toThrow();
    expect(() =>
      assertSymbolicRegularCoverClaimAllowed(
        wallSpace.completeness,
        "virtual-algebraic-fibering",
      ),
    ).toThrow(/No complete replayed/);
    expect(
      wallSpace.completeness.promotionGate.unrestrictedCoorientationSearch,
    ).toBe(false);
  });

  it("does not call a partition exhaustive when the wall catalogue is partial", () => {
    const cover = buildKleinFourCover();
    const input = wallSpaceInput(cover.id);
    input.wallCatalogue.exhaustive = false;
    const wallSpace = buildSymmetryRestrictedWallSpace(cover, input);
    const coorientation = createSymmetryRestrictedCoorientation(wallSpace);

    expect(wallSpace.exactWithinRestrictedSpace).toBe(false);
    expect(
      wallSpace.completeness.wallSearch.exhaustiveWithinRestrictedSpace,
    ).toBe(false);
    expect(coorientation).toMatchObject({
      valid: true,
      exactWithinRestrictedSpace: false,
    });
    expect(() =>
      assertSymbolicRegularCoverClaimAllowed(
        wallSpace.completeness,
        "symmetry-restricted-wall-search",
      ),
    ).toThrow(/outside this model's exact scope/);
  });
});

describe("symbolic regular-kernel fibering promotion", () => {
  it("promotes a complete replayed orbit certificate with a primitive normalized map", () => {
    const fixture = buildPositiveSymbolicFiberingFixture();

    expect(fixture.wallCatalogue).toMatchObject({
      exhaustive: true,
      checks: {
        rankTwoOppositeIncidenceVerified: true,
        sideTransportVerified: true,
      },
    });
    expect(fixture.schreier).toMatchObject({
      status: "passed",
      imageGcd: { decimal: "2" },
      normalizationDivisor: { decimal: "2" },
      bezoutCoefficients: [
        { generatorId: "h0", coefficient: { decimal: "1" } },
      ],
      bezoutCombination: { decimal: "2" },
      rawMapPrimitive: false,
      normalizedMapPrimitive: true,
      generatorValues: [
        {
          id: "h0",
          value: { decimal: "2" },
          normalizedValue: { decimal: "1" },
        },
      ],
    });
    expect(fixture.links).toMatchObject({
      status: "passed",
      exhaustive: true,
      allAscendingNonemptyConnected: true,
      allDescendingNonemptyConnected: true,
      collapsibilityComplete: true,
    });
    expect(fixture.promotion).toMatchObject({
      status: "passed",
      claims: [
        "virtual-algebraic-fibering",
        "finitely-generated-fibering-kernel",
      ],
      completeness: {
        promotionGate: {
          cellRepresentation: "complete-exact-cell-orbit-catalogue",
          sourceAndSphericalPlanBound: true,
          completeCellOrbitCatalogue: true,
          allQuotientWallsEnumerated: true,
          coorientationExistenceCertified: true,
          primitiveEpimorphismCertified: true,
          allAscendingDescendingLinksChecked: true,
          positiveWitnessVerified: true,
        },
      },
    });
    if (fixture.promotion.status !== "passed") {
      throw new Error("Expected a positive symbolic promotion certificate.");
    }
    const completeness = fixture.promotion.completeness;
    expect(() =>
      assertSymbolicRegularCoverClaimAllowed(
        completeness,
        "virtual-algebraic-fibering",
      ),
    ).not.toThrow();
    expect(() =>
      assertSymbolicRegularCoverClaimAllowed(
        completeness,
        "unrestricted-wall-search",
      ),
    ).toThrow(/Symmetry-restricted existence/);
  });

  it("blocks stale or incomplete link-orbit data from promotion", () => {
    const fixture = buildPositiveSymbolicFiberingFixture();
    const incompleteLinks = {
      ...fixture.links,
      status: "incomplete" as const,
      exhaustive: false,
      coorientationHash: sha256("stale-coorientation"),
    };
    const result = certifySymbolicRegularKernelFibering(fixture.cover, {
      wallCatalogue: fixture.wallCatalogue,
      wallSpace: fixture.wallSpace,
      search: fixture.search,
      boundaryCatalogue: fixture.boundaryCatalogue,
      cocycle: fixture.search.cocycle!,
      schreier: fixture.schreier,
      pullingMorse: fixture.pullingMorse,
      links: incompleteLinks,
    });

    expect(result).toMatchObject({
      status: "blocked",
      claim: "none",
      restrictedSearchFailureConclusion: "inconclusive",
    });
    if (result.status !== "blocked") {
      throw new Error("Stale link data must block promotion.");
    }
    expect(result.blockers.join(" ")).toMatch(
      /ascending\/descending link replay did not pass/,
    );
  });

  it("rejects structurally identical certificates that bypass runtime replay", () => {
    const fixture = buildPositiveSymbolicFiberingFixture();
    const forgedLinks = { ...fixture.links };
    const result = certifySymbolicRegularKernelFibering(fixture.cover, {
      wallCatalogue: fixture.wallCatalogue,
      wallSpace: fixture.wallSpace,
      search: fixture.search,
      boundaryCatalogue: fixture.boundaryCatalogue,
      cocycle: fixture.search.cocycle!,
      schreier: fixture.schreier,
      pullingMorse: fixture.pullingMorse,
      links: forgedLinks,
    });

    expect(result).toMatchObject({ status: "blocked", claim: "none" });
    if (result.status !== "blocked") {
      throw new Error("A forged imported certificate must not promote.");
    }
    expect(result.blockers.join(" ")).toMatch(/runtime verifier/);
  });

  it("rejects forged orbit booleans and a side-reversing stabilizer loop", () => {
    expect(() =>
      replayExactOrbitPartition({
        method: "adversarial-side-loop",
        objectKeys: ["wall"],
        generatorIds: ["stabilizer"],
        transitions: [
          {
            sourceKey: "wall",
            generatorId: "stabilizer",
            targetKey: "wall",
            sideSign: -1,
          },
        ],
      }),
    ).toThrow(/stabilizer loop reverses/);

    const fixture = buildPositiveSymbolicFiberingFixture();
    const forgedOracle: ExactSymbolicSchreierOracle = {
      status: "passed",
      method: "forged-transversal-assertions",
      sourceCoverId: fixture.cover.id,
      coorientationHash: symbolicCoorientationDigest(fixture.search.solution!),
      exhaustive: true,
      transversalRepresentativeKeys: ["q0", "q1", "q2", "q3"],
      transversalOrbitPartitionReplay: {
        status: "passed",
        method: "not-executed",
        canonicalRepresentativeKeys: ["q0", "q1", "q2", "q3"],
        checks: {
          representativesCanonical: true,
          stabilizersReplayed: true,
          transportsReplayed: true,
          pairwiseDisjoint: true,
          coversEveryObject: true,
        },
        replayHash: sha256("invented-transversal-hash"),
      },
      generators: [
        {
          id: "h0",
          sourceDeckElementKey: "q0",
          generator: 0,
          targetTransversalDeckElementKey: "q0",
          kernelWord: [0, 1, 0, 1],
        },
      ],
      relations: [],
      checks: {
        transversalComplete: true,
        schreierGeneratorsComplete: true,
        presentationRelationsComplete: true,
        wordActionsExact: true,
      },
      certificateHash: sha256("invented-schreier-certificate"),
      replayGenerator: () => ({
        closesInKernel: true,
        value: 2n,
        replayHash: sha256("invented-generator-replay"),
      }),
      replayRelation: () => ({
        closesInKernel: true,
        replayHash: sha256("invented-relation-replay"),
      }),
    };
    const forged = certifyExactSymbolicSchreierHomomorphism(
      fixture.cover,
      fixture.search.solution!,
      forgedOracle,
    );
    expect(forged.status).toBe("failed");
    expect(forged.failures.join(" ")).toMatch(/assertion-only/);
  });

  it("keeps imported pulling and directed-link assertions diagnostic", () => {
    const fixture = buildPositiveSymbolicFiberingFixture();
    const coorientationHash = symbolicCoorientationDigest(
      fixture.search.solution!,
    );
    const forgedPulling: ExactSymbolicPullingMorseReplay = {
      status: "passed",
      method: "forged-all-true-pulling",
      sourceCoverId: fixture.cover.id,
      coorientationHash,
      schreierCertificateHash: fixture.schreier.replayHash,
      exhaustive: true,
      globalVertexOrderSha256: sha256("invented-order"),
      simplexOrbitCatalogueSha256: sha256("invented-simplices"),
      integratedHeightSha256: sha256("invented-height"),
      rationalOffsetSha256: sha256("invented-offset"),
      offsetDenominator: { decimal: "5", safeInteger: 5 },
      simplexOrbitRepresentativeKeys: ["invented-simplex"],
      simplexOrbitPartitionReplay: {
        status: "passed",
        method: "forged-partition",
        canonicalRepresentativeKeys: ["invented-simplex"],
        checks: {
          representativesCanonical: true,
          stabilizersReplayed: true,
          transportsReplayed: true,
          pairwiseDisjoint: true,
          coversEveryObject: true,
        },
        replayHash: sha256("invented-partition"),
      },
      checks: {
        globalVertexOrderTotal: true,
        simplexOrbitCatalogueComplete: true,
        pullingTriangulationsCompatibleOnFaces: true,
        wallCocycleIntegratedToVertexHeights: true,
        rationalOffsetsBreakEveryTie: true,
        rationalOffsetsPreserveEveryDirectedEdge: true,
        quotientPeriodicOffsets: true,
        affineExtensionOnEverySimplex: true,
        deckEquivarianceReplayed: true,
      },
      certificateHash: sha256("invented-pulling-certificate"),
    };
    const pulling = certifyExactSymbolicPullingMorseModel(
      fixture.cover,
      fixture.search.solution!,
      fixture.schreier,
      forgedPulling,
    );
    expect(pulling.status).toBe("incomplete");
    expect(pulling.failures.join(" ")).toMatch(/Assertion-only/);

    const forgedLinks: ExactSymbolicLinkOrbitCatalogue = {
      status: "passed",
      method: "forged-all-true-links",
      sourceCoverId: fixture.cover.id,
      coorientationHash,
      schreierCertificateHash: fixture.schreier.replayHash,
      pullingMorseCertificateHash: fixture.pullingMorse.replayHash,
      exhaustive: true,
      morseModel: "canonical-pulling-subdivision",
      representatives: [],
      orbitPartitionReplay: {
        status: "passed",
        method: "forged-link-partition",
        canonicalRepresentativeKeys: [],
        checks: {
          representativesCanonical: true,
          stabilizersReplayed: true,
          transportsReplayed: true,
          pairwiseDisjoint: true,
          coversEveryObject: true,
        },
        replayHash: sha256("invented-link-partition"),
      },
      checks: {
        vertexOrbitPartitionComplete: true,
        fullLinkIncidenceComplete: true,
        directionValuesReplayed: true,
        pullingSubdivisionCompatible: true,
      },
      certificateHash: sha256("invented-links"),
    };
    const links = certifyExactSymbolicDirectedLinks(
      fixture.cover,
      fixture.search.solution!,
      fixture.schreier,
      fixture.pullingMorse,
      forgedLinks,
    );
    expect(links.status).toBe("incomplete");
    expect(links.failures.join(" ")).toMatch(/Assertion-only/);
  });

  it("recomputes heights and refuses a corrupted executable witness", () => {
    const fixture = buildPositiveSymbolicFiberingFixture();
    const corruptedOracle: ExactSymbolicPullingMorseOracle = {
      method: "corrupted-height-oracle",
      recompute: (input) => {
        const raw = fixture.pullingOracle.recompute(input);
        return {
          ...raw,
          vertices: raw.vertices.map((vertex) =>
            vertex.id === "q3"
              ? { ...vertex, integratedHeight: { decimal: "999" } }
              : vertex,
          ),
        };
      },
    };
    const result = certifyExactSymbolicPullingMorseModel(
      fixture.cover,
      fixture.search.solution!,
      fixture.schreier,
      corruptedOracle,
    );
    expect(result.status).toBe("failed");
    expect(result.failures.join(" ")).toMatch(/height difference/);
  });

  it("does not accept collapsibility from a replay boolean alone", () => {
    const fixture = buildPositiveSymbolicFiberingFixture();
    const links = certifyExactSymbolicDirectedLinks(
      fixture.cover,
      fixture.search.solution!,
      fixture.schreier,
      fixture.pullingMorse,
      fixture.linkOracle,
      {
        checkCollapsibility: () => ({
          status: "collapsible",
          replayPassed: true,
          certificateHash: sha256("forged-collapse"),
        }),
      },
    );
    expect(links.status).toBe("passed");
    expect(links.collapsibilityComplete).toBe(false);
    expect(links.vertexOrbits[0].ascending.collapsibility?.reason).toMatch(
      /diagnostic only/,
    );
  });

  it("reports an exhaustive restricted failure as inconclusive globally", () => {
    const fixture = buildPositiveSymbolicFiberingFixture();
    const search = searchSymmetryRestrictedCoorientations(
      fixture.cover,
      fixture.wallSpace,
      fixture.boundaryCatalogue,
      {
        testCandidate: () => ({
          accepted: false,
          replayHash: sha256("disconnected-link-replay"),
          reason: "A directed link is disconnected.",
        }),
      },
    );

    expect(search).toMatchObject({
      status: "no-solution-in-restricted-space",
      assignmentsVisited: 16,
      candidateTestsReplayed: 16,
      totalAssignments: { decimal: "16" },
      exhaustiveWithinRestrictedSpace: true,
      unrestrictedConclusion: "inconclusive",
    });
    expect(search.solution).toBeUndefined();
    expect(search.warnings.join(" ")).toMatch(
      /does not rule out a nonsymmetric coorientation/,
    );
  });
});
