import { describe, expect, it } from "vitest";

import {
  buildGeneralizedCompressionCertificate,
  computeGeneralizedCompressionArchiveHash,
  type GeneralizedCompressionCertificate,
} from "../src/davis/generalizedCompression";
import A2 from "../src/examples/A2.json";
import A3 from "../src/examples/A3.json";
import I2_5 from "../src/examples/I2_5.json";
import {
  buildDirectCellwiseAffineCertificate,
  computeDirectCellwiseAffineArtifactHash,
  computeDirectPolyhedralLinkAtPoint,
  replayDirectCellwiseAffineCertificate,
  type DirectCellwiseAffineOptions,
  type DirectPolyhedralLinkPointResult,
} from "../src/fibering/directCellwiseAffine";
import {
  buildStreamedLawfulDavisOracle,
  type StreamedLawfulDavisOracle,
  type StreamedLawfulEvaluation,
  type StreamedOrientationSign,
  type StreamedWallSignCandidate,
} from "../src/fibering/streamedLawfulDavis";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

const A2_SYSTEM = A2 as CoxeterSystemInput;
const A3_SYSTEM = A3 as CoxeterSystemInput;
const I2_5_SYSTEM = I2_5 as CoxeterSystemInput;

const A1_CUBED_SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "A1 cubed direct-affine fixture",
  rank: 3,
  generators: [0, 1, 2].map((generator) => ({
    id: `s${generator}`,
    label: `s${generator}`,
  })),
  coxeterMatrix: [
    [1, 2, 2],
    [2, 1, 2],
    [2, 2, 1],
  ],
};

function permutations(values: readonly number[]): number[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_entry, other) => other !== index)).map(
      (tail) => [value, ...tail],
    ),
  );
}

function a3RegularAction(): TorsionFreeActionCandidate {
  const elements = permutations([0, 1, 2, 3]);
  const indexByElement = new Map(
    elements.map((element, index) => [element.join(","), index]),
  );
  return {
    id: "a3-regular-direct-affine-test",
    index: elements.length,
    generatorImages: [0, 1, 2].map((generator) =>
      elements.map((element) => {
        const image = [...element];
        [image[generator], image[generator + 1]] = [
          image[generator + 1],
          image[generator],
        ];
        return indexByElement.get(image.join(","))!;
      }),
    ),
    backend: "test-exact",
  };
}

function dihedralRegularAction(m: number): TorsionFreeActionCandidate {
  const index = 2 * m;
  const encode = (rotation: number, reflected: number): number =>
    2 * ((rotation + m) % m) + reflected;
  return {
    id: `i2-${m}-regular-direct-affine-test`,
    index,
    generatorImages: [
      Array.from({ length: index }, (_unused, point) => point ^ 1),
      Array.from({ length: index }, (_unused, point) => {
        const rotation = Math.floor(point / 2);
        return point % 2 === 0
          ? encode(rotation - 1, 1)
          : encode(rotation + 1, 0);
      }),
    ],
    backend: "test-exact",
  };
}

function cubeRegularAction(): TorsionFreeActionCandidate {
  return {
    id: "a1-cubed-regular-direct-affine-test",
    index: 8,
    generatorImages: [0, 1, 2].map((generator) =>
      Array.from({ length: 8 }, (_unused, point) => point ^ (1 << generator)),
    ),
    backend: "test-exact",
  };
}

function certify(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): TorsionFreeCandidateResult {
  const certificate = certifyTorsionFreeAction(
    system,
    candidate,
    planSphericalSpecialSubgroups(system),
  );
  expect(certificate.status).toBe("passed");
  return { candidate, certificate };
}

function candidateForMask(
  oracle: StreamedLawfulDavisOracle,
  mask: number,
): StreamedWallSignCandidate {
  return {
    id: `canonical-wall-mask-${mask.toString(16)}`,
    wallSigns: Object.fromEntries(
      oracle.walls.walls.map((wall, wallIndex) => [
        wall.id,
        (mask & (1 << wallIndex) ? -1 : 1) as StreamedOrientationSign,
      ]),
    ),
  };
}

/** Find a chamber orientation: every spherical Coxeter cell is retained. */
function bindFullLawfulOrientation(
  oracle: StreamedLawfulDavisOracle,
): StreamedLawfulEvaluation {
  const maskCount = 2 ** oracle.walls.wallCount;
  for (let mask = 0; mask < maskCount; mask += 1) {
    const evaluation = oracle.bindCoorientations([
      candidateForMask(oracle, mask),
    ]);
    const summary = evaluation.closure.candidateSummaries[0];
    if (summary.retainedCellCount === oracle.cellCount) return evaluation;
  }
  throw new Error("The finite Coxeter fixture has no full lawful orientation.");
}

interface DirectFixture {
  options: DirectCellwiseAffineOptions;
  oracle: StreamedLawfulDavisOracle;
  evaluation: StreamedLawfulEvaluation;
  compression: GeneralizedCompressionCertificate;
}

function directFixture(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): DirectFixture {
  const accepted = certify(system, candidate);
  const oracle = buildStreamedLawfulDavisOracle({
    system,
    generatorImages: candidate.generatorImages,
  });
  const evaluation = bindFullLawfulOrientation(oracle);
  const compression = buildGeneralizedCompressionCertificate(system, accepted);
  return {
    oracle,
    evaluation,
    compression,
    options: {
      oracle,
      evaluation,
      candidateIndex: 0,
      generalizedCompression: compression,
    },
  };
}

function compareGeneratorSets(
  left: readonly number[],
  right: readonly number[],
) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

/**
 * This is the direct polyhedral definition, expressed without any heights:
 * a spherical cell is ascending exactly when all of its edge germs point out.
 * It makes the weight-independence assertion in the A2 test executable.
 */
function expectedMaximalCellsFromSigns(
  fixture: DirectFixture,
  point: number,
  direction: StreamedOrientationSign,
): number[][] {
  const cells = fixture.oracle.sphericalTypes
    .filter((type) => type.dimension > 0)
    .filter((type) =>
      type.generators.every(
        (generator) =>
          fixture.evaluation.edgeIncrement(point, generator, 0) === direction,
      ),
    )
    .filter((type) =>
      fixture.evaluation.isRetained(
        fixture.oracle.cellContaining(type.typeIndex, point),
        0,
      ),
    )
    .map((type) => [...type.generators]);
  return cells
    .filter(
      (cell) =>
        !cells.some(
          (other) =>
            other.length > cell.length &&
            cell.every((generator) => other.includes(generator)),
        ),
    )
    .sort(compareGeneratorSets);
}

function expectPointUsesOnlySigns(
  fixture: DirectFixture,
  result: DirectPolyhedralLinkPointResult,
): void {
  expect(
    result.ascending.maximalCells
      .map((cell) => [...cell])
      .sort(compareGeneratorSets),
  ).toEqual(expectedMaximalCellsFromSigns(fixture, result.point, 1));
  expect(
    result.descending.maximalCells
      .map((cell) => [...cell])
      .sort(compareGeneratorSets),
  ).toEqual(expectedMaximalCellsFromSigns(fixture, result.point, -1));
}

describe("direct cellwise-affine feasibility and polyhedral links", () => {
  it("certifies unit and positive weights on the canonical A1 cubed Coxeter cell", () => {
    const fixture = directFixture(A1_CUBED_SYSTEM, cubeRegularAction());
    const certificate = buildDirectCellwiseAffineCertificate(fixture.options);

    expect(certificate.status).toBe("completed");
    expect(certificate.subdivision).toEqual({
      method: "none-direct-coxeter-cell-links",
      introducedVertexIds: [],
    });
    expect(certificate.feasibility).toMatchObject({
      status: "passed",
      affineModel: "zone-scaled-simply-laced-right-angled-coxeter-zonotopes",
      rootCoordinates: "simple-root-basis",
      retainedCellCountByDimension: {
        "0": 8,
        "1": 12,
        "2": 6,
        "3": 1,
      },
      equalZoneScales: {
        outcome: "feasible",
        weightRule: "equal-zone-scales",
      },
      retainedWallComponentInverseZoneScales: {
        outcome: "feasible",
        weightRule: "positive-retained-wall-component-inverse-zone-scales",
      },
    });
    expect(certificate.feasibility.sourceCompressionArchiveHash).toBe(
      fixture.compression.archiveHash,
    );
    expect(
      Object.values(
        certificate.feasibility.retainedWallComponentInverseZoneScales
          .inverseZoneScales!,
      ),
    ).toEqual(["1", "1", "1"]);

    const mixed = certificate.directedLinks.vertexSummaries.find(
      (summary) =>
        summary.ascendingVertexCount === 2 &&
        summary.descendingVertexCount === 1,
    );
    expect(mixed).toBeDefined();
    const pointResult = computeDirectPolyhedralLinkAtPoint(
      fixture.options,
      mixed!.point,
    );
    expect(pointResult.status).toBe("passed");
    expect(pointResult.ascending.maximalCells).toHaveLength(1);
    expect(pointResult.ascending.maximalCells[0]).toHaveLength(2);
    expect(pointResult.ascending).toMatchObject({
      nonempty: true,
      connected: true,
    });
    expect(pointResult.descending).toMatchObject({
      nonempty: true,
      connected: true,
    });
    expectPointUsesOnlySigns(fixture, pointResult);
  });

  it("separates A2 unit-weight failure from positive-weight feasibility without changing links", () => {
    const fixture = directFixture(A2_SYSTEM, dihedralRegularAction(3));
    const certificate = buildDirectCellwiseAffineCertificate(fixture.options);

    expect(certificate.status).toBe("completed");
    expect(certificate.feasibility.equalZoneScales).toMatchObject({
      outcome: "infeasible-for-canonical-model",
      weightRule: "equal-zone-scales",
      checks: { affineEdgeEquationsSatisfied: false },
    });
    expect(
      certificate.feasibility.equalZoneScales.violatingEquationCount,
    ).toBeGreaterThan(0);
    expect(
      certificate.feasibility.equalZoneScales.nonClaims.join(" "),
    ).toContain(
      "does not rule out arbitrary compatible affine-polytope charts",
    );
    expect(
      certificate.feasibility.retainedWallComponentInverseZoneScales,
    ).toMatchObject({
      outcome: "feasible",
      weightRule: "positive-retained-wall-component-inverse-zone-scales",
      checks: {
        affineEdgeEquationsSatisfied: true,
        everyInverseZoneScalePositive: true,
      },
    });
    const inverseZoneScales = Object.values(
      certificate.feasibility.retainedWallComponentInverseZoneScales
        .inverseZoneScales!,
    ).map(BigInt);
    expect(inverseZoneScales.every((weight) => weight > 0n)).toBe(true);
    // In the equal-zone A2 permutahedron, alpha_1 + alpha_2 forces one
    // primitive positive inverse-zone weight to differ from the other two.
    // The cocycle increments themselves remain the original signed units.
    expect(new Set(inverseZoneScales.map(String)).size).toBeGreaterThan(1);

    const mixed = certificate.directedLinks.vertexSummaries.find(
      (summary) =>
        summary.ascendingVertexCount === 1 &&
        summary.descendingVertexCount === 1,
    );
    expect(mixed).toBeDefined();
    const pointResult = computeDirectPolyhedralLinkAtPoint(
      fixture.options,
      mixed!.point,
    );
    expect(pointResult.status).toBe("passed");
    expectPointUsesOnlySigns(fixture, pointResult);
    expect(pointResult.ascending.maximalCells[0]).toHaveLength(1);
    expect(pointResult.descending.maximalCells[0]).toHaveLength(1);

    const reversedCandidate: StreamedWallSignCandidate = {
      id: "reversed-a2-chamber-orientation",
      wallSigns: Object.fromEntries(
        Object.entries(fixture.evaluation.candidates[0].wallSigns).map(
          ([wallId, sign]) => [wallId, -sign as StreamedOrientationSign],
        ),
      ),
    };
    const reversedEvaluation = fixture.oracle.bindCoorientations([
      reversedCandidate,
    ]);
    const reversedOptions: DirectCellwiseAffineOptions = {
      ...fixture.options,
      evaluation: reversedEvaluation,
    };
    const reversedCertificate =
      buildDirectCellwiseAffineCertificate(reversedOptions);
    expect(
      reversedCertificate.feasibility.retainedWallComponentInverseZoneScales
        .inverseZoneScales,
    ).toEqual(
      certificate.feasibility.retainedWallComponentInverseZoneScales
        .inverseZoneScales,
    );
    const reversedPoint = computeDirectPolyhedralLinkAtPoint(
      reversedOptions,
      mixed!.point,
    );
    expect(reversedPoint.ascending.maximalCells).toEqual(
      pointResult.descending.maximalCells,
    );
    expect(reversedPoint.descending.maximalCells).toEqual(
      pointResult.ascending.maximalCells,
    );
  });

  it("omits an unlawful A2 polygon from the direct link instead of using the native finite-pair edge", () => {
    const system = A2_SYSTEM;
    const candidate = dihedralRegularAction(3);
    const accepted = certify(system, candidate);
    const oracle = buildStreamedLawfulDavisOracle({
      system,
      generatorImages: candidate.generatorImages,
    });
    const evaluation = oracle.bindCoorientations([candidateForMask(oracle, 0)]);
    expect(
      evaluation.closure.candidateSummaries[0].retainedCellCountByDimension[
        "2"
      ],
    ).toBe(0);
    const compression = buildGeneralizedCompressionCertificate(
      system,
      accepted,
    );
    const fixture: DirectFixture = {
      oracle,
      evaluation,
      compression,
      options: {
        oracle,
        evaluation,
        candidateIndex: 0,
        generalizedCompression: compression,
      },
    };
    const twoOutgoingPoint = Array.from(
      { length: oracle.degree },
      (_unused, point) => point,
    ).find((point) =>
      [0, 1].every(
        (generator) => evaluation.edgeIncrement(point, generator, 0) === 1,
      ),
    );
    expect(twoOutgoingPoint).toBeDefined();

    const certificate = buildDirectCellwiseAffineCertificate(fixture.options);
    const pointResult = computeDirectPolyhedralLinkAtPoint(
      fixture.options,
      twoOutgoingPoint!,
    );
    expect(
      certificate.feasibility.retainedWallComponentInverseZoneScales.outcome,
    ).toBe("feasible");
    expect(certificate.feasibility.retainedZoneComponents.componentCount).toBe(
      oracle.geometricEdgeCount,
    );
    expect(certificate.feasibility.retainedZoneComponents.checks).toEqual({
      everyGeometricEdgeAssigned: true,
      everyRetainedRankTwoCellVisited: true,
      onlyRetainedRankTwoOppositionsUsed: true,
    });
    expect(
      certificate.feasibility.retainedZoneComponents.componentCount,
    ).toBeGreaterThan(oracle.walls.wallCount);
    expect(
      Object.keys(
        certificate.feasibility.retainedWallComponentInverseZoneScales
          .inverseZoneScales!,
      ),
    ).toHaveLength(oracle.geometricEdgeCount);
    expect(pointResult.ascending.maximalCells).toEqual([[0], [1]]);
    expect(pointResult.ascending.components).toHaveLength(2);
    expect(pointResult.ascending).toMatchObject({
      nonempty: true,
      connected: false,
    });
    expectPointUsesOnlySigns(fixture, pointResult);
    expect(certificate.directedLinks.morseCondition).toBe("not-established");
  });

  it("solves the all-ranks A3 root equations and includes rank-two polyhedral link cells", () => {
    const fixture = directFixture(A3_SYSTEM, a3RegularAction());
    const certificate = buildDirectCellwiseAffineCertificate(fixture.options);

    expect(certificate.status).toBe("completed");
    expect(certificate.feasibility.retainedCellCountByDimension).toEqual({
      "0": 24,
      "1": 36,
      "2": 14,
      "3": 1,
    });
    expect(certificate.feasibility.explicitlyCheckedRankTwoCells).toBe(14);
    expect(certificate.feasibility.explicitlyCheckedHigherCells).toBe(1);
    expect(certificate.feasibility.higherEdgeEquationsExpected).toBe(72);
    expect(certificate.feasibility.higherEdgeEquationsChecked).toBe(72);
    expect(
      certificate.feasibility.higherChartsVerifiedByFullRootTraversal,
    ).toBe(1);
    expect(certificate.feasibility.higherCellExtension).toMatchObject({
      theoremId: "simply-laced-weighted-root-zonotope-face-gluing",
      verificationMode: "full-retained-cell-root-traversal",
      theoremVersion: 1,
      transitionConvention: "R(ws_i)=R(w)R(s_i)-on-root-columns",
      retainedHigherCellsExpected: 1,
      retainedHigherCellsChecked: 1,
      higherEdgeEquationsExpected: 72,
      higherEdgeEquationsChecked: 72,
      rankTwoFaceOccurrencesChecked: 14,
      checks: {
        everyRetainedHigherCellVisited: true,
        everyRetainedHigherCellEdgeEquationChecked: true,
        everyExpectedRankTwoFacePresent: true,
        everySupportingRankTwoFaceRetained: true,
        sharedFacesUseZoneComponentsAndCocycle: true,
      },
    });
    expect(certificate.feasibility.higherCellExtension.evidenceDigest).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(
      certificate.feasibility.retainedWallComponentInverseZoneScales.checks
        .everyCellOrbitMatrixConsistent,
    ).toBe(true);
    expect(
      certificate.feasibility.retainedWallComponentInverseZoneScales.checks
        .everyRetainedHigherCellSupportedByRetainedRankTwoFaces,
    ).toBe(true);
    expect(certificate.feasibility.equalZoneScales.outcome).toBe(
      "infeasible-for-canonical-model",
    );
    expect(
      certificate.feasibility.retainedWallComponentInverseZoneScales.outcome,
    ).toBe("feasible");
    expect(
      certificate.feasibility.retainedWallComponentInverseZoneScales
        .equationCount,
    ).toBeGreaterThan(
      certificate.feasibility.retainedWallComponentInverseZoneScales
        .independentEquationCount,
    );

    const mixed = certificate.directedLinks.vertexSummaries.find(
      (summary) =>
        summary.ascendingVertexCount === 2 &&
        summary.descendingVertexCount === 1,
    );
    expect(mixed).toBeDefined();
    const pointResult = computeDirectPolyhedralLinkAtPoint(
      fixture.options,
      mixed!.point,
    );
    expectPointUsesOnlySigns(fixture, pointResult);
    expect(pointResult.ascending.maximalCells).toContainEqual(
      expect.arrayContaining([expect.any(Number), expect.any(Number)]),
    );
    expect(pointResult.ascending.connected).toBe(true);
    expect(pointResult.descending.connected).toBe(true);
  });

  it("reports unsupported noncrystallographic I2(5) cells as not established, not infeasible", () => {
    const fixture = directFixture(I2_5_SYSTEM, dihedralRegularAction(5));
    const certificate = buildDirectCellwiseAffineCertificate(fixture.options);

    expect(certificate.status).toBe("completed");
    expect(certificate.feasibility.status).toBe("not-established");
    expect(certificate.feasibility.equalZoneScales.outcome).toBe(
      "not-established",
    );
    expect(
      certificate.feasibility.retainedWallComponentInverseZoneScales.outcome,
    ).toBe("not-established");
    expect(certificate.feasibility.equalZoneScales.outcome).not.toBe(
      "infeasible-for-canonical-model",
    );
    expect(
      certificate.feasibility.retainedWallComponentInverseZoneScales.outcome,
    ).not.toBe("infeasible-for-canonical-model");
    expect(certificate.directedLinks.checks.affineMorseFunctionCertified).toBe(
      false,
    );
    expect(certificate.conclusion).toBe("not-established");
  });

  it("binds a selected nonzero evaluation slot and rejects a closure candidate-id mismatch", () => {
    const fixture = directFixture(A2_SYSTEM, dihedralRegularAction(3));
    const selected = fixture.evaluation.candidates[0];
    const evaluation = fixture.oracle.bindCoorientations([
      candidateForMask(fixture.oracle, 0),
      selected,
    ]);
    const options: DirectCellwiseAffineOptions = {
      ...fixture.options,
      evaluation,
      candidateIndex: 1,
    };
    const certificate = buildDirectCellwiseAffineCertificate(options);

    expect(certificate.status).toBe("completed");
    expect(certificate.candidateIndex).toBe(1);
    expect(certificate.candidateId).toBe(selected.id);
    expect(certificate.source.coorientationHash).toBe(
      evaluation.closure.candidateSummaries[1].coorientationHash,
    );
    expect(
      replayDirectCellwiseAffineCertificate(options, certificate).status,
    ).toBe("passed");
    expect(
      replayDirectCellwiseAffineCertificate(
        { ...options, candidateIndex: 0 },
        certificate,
      ).status,
    ).toBe("failed");

    const mismatchedClosure = structuredClone(evaluation.closure);
    mismatchedClosure.candidateSummaries[1].candidateId =
      "forged-closure-candidate";
    const mismatchedEvaluation: StreamedLawfulEvaluation = {
      ...evaluation,
      closure: mismatchedClosure,
    };
    const rejected = buildDirectCellwiseAffineCertificate({
      ...options,
      evaluation: mismatchedEvaluation,
    });
    expect(rejected.status).toBe("failed");
    expect(rejected.errors.join(" ")).toMatch(
      /closure summary candidate.*does not match/i,
    );
    expect(rejected.feasibility.equalZoneScales.outcome).toBe(
      "not-established",
    );
    expect(
      rejected.feasibility.retainedWallComponentInverseZoneScales.outcome,
    ).toBe("not-established");
  });

  it("rebuilds oracle and evaluation query methods from action-rooted data", () => {
    const fixture = directFixture(A1_CUBED_SYSTEM, cubeRegularAction());
    const genuine = buildDirectCellwiseAffineCertificate(fixture.options);
    const forgedEvaluation: StreamedLawfulEvaluation = {
      ...fixture.evaluation,
      isRetained: () => false,
      edgeIncrement: () => -1,
      retentionBits: () => 0,
      isMaximalRetained: () => false,
    };
    const failIfCalled = (): never => {
      throw new Error("forged streamed-oracle query method was called");
    };
    const forgedOracle: StreamedLawfulDavisOracle = {
      ...fixture.oracle,
      cellContaining: failIfCalled,
      cellVertices: failIfCalled,
      forEachCell: failIfCalled,
      forEachFacet: failIfCalled,
      forEachCofacet: failIfCalled,
      forEachRankTwoFace: failIfCalled,
      forEachRankTwoCell: failIfCalled,
      geometricEdge: failIfCalled,
      wallForGeometricEdge: failIfCalled,
      wallIdForEdge: failIfCalled,
      wallBinding: failIfCalled,
    };
    const forgedOptions: DirectCellwiseAffineOptions = {
      ...fixture.options,
      oracle: forgedOracle,
      evaluation: forgedEvaluation,
    };
    const rebuilt = buildDirectCellwiseAffineCertificate(forgedOptions);

    expect(rebuilt).toEqual(genuine);
    expect(
      replayDirectCellwiseAffineCertificate(forgedOptions, genuine).status,
    ).toBe("passed");
  });

  it("rejects rehashed generalized-compression fiber and face tampering", () => {
    const fixture = directFixture(A1_CUBED_SYSTEM, cubeRegularAction());
    const mutations: Array<
      (compression: GeneralizedCompressionCertificate) => void
    > = [
      (compression) => {
        compression.sphericalTypes[1].fiberPartitionHash = "1".repeat(64);
      },
      (compression) => {
        compression.faceCompatibility[0].transcriptHash = "2".repeat(64);
      },
    ];

    for (const mutate of mutations) {
      const generalizedCompression = structuredClone(fixture.compression);
      mutate(generalizedCompression);
      generalizedCompression.archiveHash =
        computeGeneralizedCompressionArchiveHash(generalizedCompression);
      const options = { ...fixture.options, generalizedCompression };
      const malicious = buildDirectCellwiseAffineCertificate(options);
      expect(malicious.status).toBe("failed");
      expect(
        replayDirectCellwiseAffineCertificate(options, malicious).status,
      ).toBe("failed");
      expect(malicious.errors.join(" ")).toMatch(
        /generalized.compression.*replay|fiber|face/i,
      );
    }
  });

  it("replays exactly and rejects rehashed affine and polyhedral-link tampering", () => {
    const fixture = directFixture(A1_CUBED_SYSTEM, cubeRegularAction());
    const certificate = buildDirectCellwiseAffineCertificate(fixture.options);
    expect(
      replayDirectCellwiseAffineCertificate(fixture.options, certificate),
    ).toMatchObject({
      status: "passed",
      checks: {
        storedArtifactHashValid: true,
        sourceHashesMatch: true,
        actionRootedReconstructionMatches: true,
      },
    });

    const changedWeight = structuredClone(certificate);
    const inverseZoneScales = changedWeight.feasibility
      .retainedWallComponentInverseZoneScales.inverseZoneScales as Record<
      string,
      string
    >;
    const [firstWallId] = Object.keys(inverseZoneScales);
    inverseZoneScales[firstWallId] = "2";
    changedWeight.artifactHash =
      computeDirectCellwiseAffineArtifactHash(changedWeight);
    expect(
      replayDirectCellwiseAffineCertificate(fixture.options, changedWeight),
    ).toMatchObject({
      status: "failed",
      checks: {
        storedArtifactHashValid: true,
        actionRootedReconstructionMatches: false,
      },
    });

    const changedLink = structuredClone(certificate);
    changedLink.directedLinks.vertexSummaries[0].ascendingComponentCount += 1;
    changedLink.artifactHash =
      computeDirectCellwiseAffineArtifactHash(changedLink);
    expect(
      replayDirectCellwiseAffineCertificate(fixture.options, changedLink),
    ).toMatchObject({
      status: "failed",
      checks: {
        storedArtifactHashValid: true,
        actionRootedReconstructionMatches: false,
      },
    });

    const changedHigherCellEvidence = structuredClone(certificate);
    changedHigherCellEvidence.feasibility.higherCellExtension.evidenceDigest =
      "3".repeat(64);
    changedHigherCellEvidence.artifactHash =
      computeDirectCellwiseAffineArtifactHash(changedHigherCellEvidence);
    expect(
      replayDirectCellwiseAffineCertificate(
        fixture.options,
        changedHigherCellEvidence,
      ),
    ).toMatchObject({
      status: "failed",
      checks: {
        storedArtifactHashValid: true,
        actionRootedReconstructionMatches: false,
      },
    });

    const changedRetainedComponents = structuredClone(certificate);
    changedRetainedComponents.feasibility.retainedZoneComponents.componentDigest =
      "4".repeat(64);
    changedRetainedComponents.artifactHash =
      computeDirectCellwiseAffineArtifactHash(changedRetainedComponents);
    expect(
      replayDirectCellwiseAffineCertificate(
        fixture.options,
        changedRetainedComponents,
      ),
    ).toMatchObject({
      status: "failed",
      checks: {
        storedArtifactHashValid: true,
        actionRootedReconstructionMatches: false,
      },
    });
  });
});
