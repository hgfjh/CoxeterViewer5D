import { describe, expect, it } from "vitest";
import {
  buildCoverCompression,
  type BarXCompressedComplex,
} from "../src/compression";
import I2_5_IDENTITY_QUOTIENT from "../src/examples/I2_5_identity_quotient.json";
import IDEAL_3_CUBE from "../src/examples/ideal_hyperbolic_3_cube_m3.json";
import {
  certifyWallHomomorphismFiniteData,
  computeBezoutIdentity,
  computeCocycleImage,
  deriveWallIntegerCocycle,
} from "../src/fibering/wallHomomorphism";
import type { QuotientComplex } from "../src/quotient";
import { buildIdealHyperbolic3CubeS4Cover } from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import {
  createWallCoorientation,
  findWallSystem,
  type WallCoorientation,
} from "../src/walls";

describe("wall coorientation integer cocycles", () => {
  it("preserves the exact I2(5) edge ids and checks its signed decagon", () => {
    const { barX } = buildCoverCompression(
      I2_5_IDENTITY_QUOTIENT as unknown as QuotientComplex,
    );
    const original = structuredClone(barX);
    const wallSystem = findWallSystem(barX);
    const cocycle = deriveWallIntegerCocycle(
      barX,
      wallSystem,
      createWallCoorientation(wallSystem),
    );
    const cell = barX.relationCells[0];
    const orderedBoundary = [...cell.boundaryOccurrences].sort(
      (left, right) => left.boundaryIndex - right.boundaryIndex,
    );

    expect(cocycle.closed).toBe(true);
    expect(cocycle.failures).toEqual([]);
    expect(cocycle.edgeValues.map((entry) => entry.edgeId)).toEqual(
      barX.geometricEdges.map((edge) => edge.id).sort(),
    );
    expect(cocycle.relationChecks).toHaveLength(1);
    expect(cocycle.relationChecks[0]).toMatchObject({
      cellId: cell.id,
      m: 5,
      boundarySum: 0,
      passed: true,
    });
    expect(cocycle.relationChecks[0].boundaryEdgeIds).toEqual(
      orderedBoundary.map((occurrence) => occurrence.edgeId),
    );
    expect(cocycle.relationChecks[0].boundaryVertexIds).toEqual(
      orderedBoundary.map((occurrence) => occurrence.sourceVertexId),
    );
    expect(cocycle.relationChecks[0].steps).toHaveLength(10);
    expect(cocycle.relationChecks[0].steps.at(-1)?.runningSum).toBe(0);
    expect(barX).toEqual(original);

    // The decagon fills the only graph cycle, so this finite example has zero
    // image even though every edge receives a nonzero coorientation value.
    const image = computeCocycleImage(barX, cocycle);
    expect(image.status).toBe("zero");
    expect(image.rawImageGenerator).toBe(0);
    expect(image.primitiveRepresentativeAvailable).toBe(false);
    expect(image.failures).toEqual([
      expect.objectContaining({ kind: "zero-image" }),
    ]);
  });

  it("checks all 48 ideal-cube compressed relation cells deterministically", () => {
    const quotient = buildIdealHyperbolic3CubeS4Cover(
      IDEAL_3_CUBE as CoxeterSystemInput,
    );
    const { barX } = buildCoverCompression(quotient);
    const wallSystem = findWallSystem(barX);
    const coorientation = createWallCoorientation(wallSystem);
    const first = certifyWallHomomorphismFiniteData(
      barX,
      wallSystem,
      coorientation,
    );
    const second = certifyWallHomomorphismFiniteData(
      {
        ...barX,
        vertices: [...barX.vertices].reverse(),
        geometricEdges: [...barX.geometricEdges].reverse(),
        relationCells: [...barX.relationCells].reverse().map((cell) => ({
          ...cell,
          boundaryOccurrences: [...cell.boundaryOccurrences].reverse(),
        })),
      },
      wallSystem,
      coorientation,
    );

    expect(first.cocycle.closed).toBe(true);
    expect(first.cocycle.edgeValues).toHaveLength(72);
    expect(first.cocycle.relationChecks).toHaveLength(48);
    expect(
      first.cocycle.relationChecks.every(
        (check) => check.passed && check.boundarySum === 0,
      ),
    ).toBe(true);
    expect(second).toEqual(first);
    expect(first.image.connected).toBe(true);
    expect(first.image.fundamentalCycles).toHaveLength(49);
    expect(first.image.bezoutIdentity?.verified).toBe(true);
    if (first.image.primitiveRepresentativeAvailable) {
      expect(first.image.normalizedBezoutIdentity).toMatchObject({
        gcd: 1,
        evaluatedSum: 1,
        verified: true,
      });
    }
  });

  it("returns the exact failing cell and boundary contributions", () => {
    const { barX } = buildCoverCompression(
      I2_5_IDENTITY_QUOTIENT as unknown as QuotientComplex,
    );
    const wallSystem = findWallSystem(barX);
    const valid = createWallCoorientation(wallSystem);
    const changedEdgeId = barX.relationCells[0].boundaryOccurrences[0].edgeId;
    const broken: WallCoorientation = {
      ...valid,
      edgeDirections: {
        ...valid.edgeDirections,
        [changedEdgeId]: valid.edgeDirections[changedEdgeId] === 1 ? -1 : 1,
      },
    };
    const cocycle = deriveWallIntegerCocycle(barX, wallSystem, broken);
    const relationFailure = cocycle.failures.find(
      (failure) => failure.kind === "relation-boundary-sum",
    );

    expect(cocycle.closed).toBe(false);
    expect(cocycle.checks.coorientationConsistent).toBe(false);
    expect(cocycle.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "edge-direction-mismatch",
          edgeId: changedEdgeId,
        }),
        expect.objectContaining({
          kind: "relation-boundary-sum",
          cellId: barX.relationCells[0].id,
        }),
      ]),
    );
    expect(relationFailure).toMatchObject({
      edgeIds: cocycle.relationChecks[0].boundaryEdgeIds,
      contributions: cocycle.relationChecks[0].steps.map(
        (step) => step.signedContribution,
      ),
      boundarySum: cocycle.relationChecks[0].boundarySum,
    });
    expect(computeCocycleImage(barX, cocycle)).toMatchObject({
      status: "unavailable",
      primitiveRepresentativeAvailable: false,
      failures: [expect.objectContaining({ kind: "cocycle-not-closed" })],
    });
  });

  it("normalizes a nonprimitive loop image with explicit Bezout data", () => {
    const barX = weightedLoopComplex();
    const wallSystem = findWallSystem(barX);
    const certificate = certifyWallHomomorphismFiniteData(
      barX,
      wallSystem,
      createWallCoorientation(wallSystem),
      {
        wallWeights: {
          [wallSystem.edgeToWallId.e0]: 6,
          [wallSystem.edgeToWallId.e1]: 15,
        },
      },
    );

    expect(certificate.finiteChecksPassed).toBe(true);
    expect(certificate.image).toMatchObject({
      status: "nonprimitive",
      rawImageGenerator: 3,
      rawImageNotation: "3Z",
      rawHomomorphismPrimitive: false,
      primitiveRepresentativeAvailable: true,
      normalizationDivisor: 3,
      bezoutIdentity: {
        gcd: 3,
        evaluatedSum: 3,
        verified: true,
      },
      normalizedBezoutIdentity: {
        gcd: 1,
        evaluatedSum: 1,
        verified: true,
      },
    });
    expect(
      certificate.image.fundamentalCycles.map((cycle) => ({
        id: cycle.nonTreeEdgeId,
        raw: cycle.rawValue,
        normalized: cycle.normalizedValue,
      })),
    ).toEqual([
      { id: "e0", raw: 6, normalized: 2 },
      { id: "e1", raw: 15, normalized: 5 },
    ]);
    expect(certificate.nonClaims.join(" ")).toContain(
      "not a virtual-fibering certificate",
    );
  });

  it("computes the same Bezout witness regardless of input order", () => {
    const values = [
      { generatorId: "b", value: 15 },
      { generatorId: "a", value: 6 },
      { generatorId: "c", value: 0 },
    ];
    const first = computeBezoutIdentity(values);
    const second = computeBezoutIdentity([...values].reverse());

    expect(second).toEqual(first);
    expect(first).toMatchObject({ gcd: 3, evaluatedSum: 3, verified: true });
    expect(
      first.terms.reduce((sum, term) => sum + term.coefficient * term.value, 0),
    ).toBe(3);
  });
});

function weightedLoopComplex(): BarXCompressedComplex {
  return {
    schemaVersion: 1,
    kind: "bar-x-compression",
    name: "two weighted loops",
    sourceSystem: {
      schemaVersion: 1,
      name: "two weighted loop source",
      rank: 2,
      generators: [
        { id: "s0", label: "s0" },
        { id: "s1", label: "s1" },
      ],
      coxeterMatrix: [
        [1, "inf"],
        ["inf", 1],
      ],
    },
    vertices: [
      {
        id: "v",
        sourceHatVertexId: "hat:v",
        sourceQuotientVertexId: "q:v",
      },
    ],
    geometricEdges: [
      {
        id: "e0",
        sourceVertexId: "v",
        targetVertexId: "v",
        generator: 0,
        sourceHatDirectedEdgeIds: ["hat:e0:0", "hat:e0:1"],
        sourceHatBigonCellIds: ["bigon:e0:0", "bigon:e0:1"],
      },
      {
        id: "e1",
        sourceVertexId: "v",
        targetVertexId: "v",
        generator: 1,
        sourceHatDirectedEdgeIds: ["hat:e1:0", "hat:e1:1"],
        sourceHatBigonCellIds: ["bigon:e1:0", "bigon:e1:1"],
      },
    ],
    relationCells: [],
    provenance: {
      sourceQuotientName: "two weighted loop quotient",
      construction: "permutation-action-lift",
      compression: "generator-bigons-and-parallel-relation-lifts",
      actionEvidence: "in-repo-checked",
      torsionFreeEvidence: "not-supplied",
      checksPerformed: [],
      claims: [],
      limitations: [],
    },
    warnings: [],
  };
}
