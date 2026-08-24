import { describe, expect, it } from "vitest";

import { buildFullDavisQuotientCellPoset } from "../src/davis/fullQuotient";
import {
  certifyFullDavisVirtualAlgebraicFibration,
  exactRational,
  addRationals,
  compareRationals,
  computePrimitiveMorseHeightHash,
  buildCompatiblePullingTriangulation,
  searchFullDavisWallCoorientations,
  verifyFullDavisVirtualFiberingCertificate,
} from "../src/fibering";
import {
  acceptedActionToQuotientComplex,
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const PRODUCT_SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "D_infinity x A1 certificate fixture",
  rank: 3,
  generators: [
    { id: "s0", label: "s0" },
    { id: "s1", label: "s1" },
    { id: "s2", label: "s2" },
  ],
  coxeterMatrix: [
    [1, "inf", 2],
    ["inf", 1, 2],
    [2, 2, 1],
  ],
  notes: [
    "The translation subgroup of D_infinity is torsion-free and has index four after the A1 factor is included.",
  ],
};

const RANK_THREE_PRODUCT_SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "D_infinity x A2 rank-three certificate fixture",
  rank: 4,
  generators: [
    { id: "s0", label: "s0" },
    { id: "s1", label: "s1" },
    { id: "s2", label: "s2" },
    { id: "s3", label: "s3" },
  ],
  coxeterMatrix: [
    [1, "inf", 2, 2],
    ["inf", 1, 2, 2],
    [2, 2, 1, 3],
    [2, 2, 3, 1],
  ],
};

function productAction(): TorsionFreeActionCandidate {
  return {
    id: "d-infinity-times-a1-index-four",
    name: "translation subgroup",
    index: 4,
    generatorImages: [
      [1, 0, 3, 2],
      [1, 0, 3, 2],
      [2, 3, 0, 1],
    ],
    pointLabels: ["q0", "q1", "q2", "q3"],
    backend: "exact-test-fixture",
  };
}

function acceptedProductAction(): TorsionFreeCandidateResult {
  const candidate = productAction();
  const certificate = certifyTorsionFreeAction(
    PRODUCT_SYSTEM,
    candidate,
    planSphericalSpecialSubgroups(PRODUCT_SYSTEM),
  );
  expect(certificate.status).toBe("passed");
  return { candidate, certificate };
}

function alternativeProductAction(): TorsionFreeActionCandidate {
  return {
    id: "d-infinity-times-a1-alternative-index-four",
    name: "alternative translation subgroup action",
    index: 4,
    generatorImages: [
      [1, 0, 3, 2],
      [3, 2, 1, 0],
      [2, 3, 0, 1],
    ],
    pointLabels: ["q0", "q1", "q2", "q3"],
    backend: "exact-test-fixture",
  };
}

function rankThreeProductAction(): TorsionFreeActionCandidate {
  const elements = permutations([0, 1, 2]);
  const indexByKey = new Map(
    elements.map((element, index) => [element.join(","), index]),
  );
  const finiteGenerators = [
    [1, 0, 2],
    [0, 2, 1],
  ];
  const encode = (permutation: number, parity: number): number =>
    2 * permutation + parity;
  const degree = 2 * elements.length;
  return {
    id: "d-infinity-times-a2-index-twelve",
    name: "translation kernel times the trivial A2 subgroup",
    index: degree,
    generatorImages: [
      Array.from({ length: degree }, (_unused, point) =>
        encode(Math.floor(point / 2), 1 - (point % 2)),
      ),
      Array.from({ length: degree }, (_unused, point) =>
        encode(Math.floor(point / 2), 1 - (point % 2)),
      ),
      ...finiteGenerators.map((generator) =>
        Array.from({ length: degree }, (_unused, point) => {
          const permutation = Math.floor(point / 2);
          const image = indexByKey.get(
            generator.map((value) => elements[permutation][value]).join(","),
          );
          if (image === undefined) throw new Error("Incomplete S3 action.");
          return encode(image, point % 2);
        }),
      ),
    ],
    backend: "exact-test-fixture",
  };
}

function permutations(values: number[]): number[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(
      values.filter((_entry, entryIndex) => entryIndex !== index),
    ).map((tail) => [value, ...tail]),
  );
}

function acceptedRankThreeProductAction(): TorsionFreeCandidateResult {
  const candidate = rankThreeProductAction();
  const certificate = certifyTorsionFreeAction(
    RANK_THREE_PRODUCT_SYSTEM,
    candidate,
    planSphericalSpecialSubgroups(RANK_THREE_PRODUCT_SYSTEM),
  );
  expect(certificate.status).toBe("passed");
  return { candidate, certificate };
}

describe("full Davis virtual-fibering certification", () => {
  it("uses reduced exact rationals for normalized heights", () => {
    expect(exactRational(2, 4)).toEqual({ numerator: "1", denominator: "2" });
    expect(addRationals(exactRational(1, 3), exactRational(1, 6))).toEqual({
      numerator: "1",
      denominator: "2",
    });
    expect(compareRationals(exactRational(-1, 7), exactRational(0))).toBe(-1);
  });

  it("pulls every cell from one global order and agrees on shared faces", () => {
    const accepted = acceptedProductAction();
    const poset = buildFullDavisQuotientCellPoset(PRODUCT_SYSTEM, accepted, {
      sourceQuotientVertexIds: ["q0", "q1", "q2", "q3"],
    });
    const triangulation = buildCompatiblePullingTriangulation(poset);

    expect(poset.dimension).toBe(2);
    expect(triangulation.status).toBe("passed");
    expect(triangulation.maximalCellIds).toHaveLength(2);
    expect(triangulation.maximalSimplices).toHaveLength(4);
    expect(triangulation.checks.sharedFacesCompatible).toBe(true);
    expect(
      triangulation.faceCompatibilityChecks.every((check) => check.passed),
    ).toBe(true);
    expect(triangulation.triangulationHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("exports the complete staged evidence and never upgrades collapsibility into an unsupported bundle claim", () => {
    const accepted = acceptedProductAction();
    const quotient = acceptedActionToQuotientComplex(PRODUCT_SYSTEM, accepted, {
      subgroupName: "H_translation",
    });
    const search = searchFullDavisWallCoorientations({
      quotient,
      acceptedAction: accepted,
      sourceQuotientVertexIds: ["q0", "q1", "q2", "q3"],
      options: {
        exactWallLimit: 8,
        maxCandidates: 16,
        timeBudgetMs: 10_000,
        collapsibilityOptions: {
          maxStates: 20_000,
          maxTransitions: 100_000,
          maxMilliseconds: 2_000,
        },
      },
    });
    const certificate = search.certificate!;

    expect(search.status).toBe("found");
    expect(certificate.subgroupAction?.certificate.status).toBe("passed");
    expect(certificate.fullCellPoset?.certificate.status).toBe("passed");
    expect(certificate.triangulation?.status).toBe("passed");
    expect(certificate.heightFunction).toBeDefined();
    expect(certificate.directedLinks).toBeDefined();
    expect(
      certificate.directedLinks?.vertices.every((vertex) =>
        [
          ...vertex.ascending.faceOccurrences,
          ...vertex.descending.faceOccurrences,
        ].every((face) => face.supportCellId.startsWith("fdq:")),
      ),
    ).toBe(true);
    expect(
      certificate.status,
      JSON.stringify(
        {
          stages: certificate.stages,
          errors: certificate.errors,
          linkChecks: certificate.directedLinks?.checks,
        },
        null,
        2,
      ),
    ).toBe("passed");
    expect(certificate.result.virtualAlgebraicFibration).toBe(true);
    expect(certificate.result.wallCocycleExtendsAcrossEveryCoxeterCell).toBe(
      true,
    );
    expect(certificate.result.finitelyGeneratedKernel).toBe(true);
    expect(certificate.hashes.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(
      verifyFullDavisVirtualFiberingCertificate(certificate),
    ).toMatchObject({ valid: true });
    expect(certificate.result.imm23TopologicalFibrationCertified).toBe(false);
    expect(certificate.nonClaims.join(" ")).toContain(
      "not automatically a locally trivial topological bundle",
    );
    expect(certificate.stages.map((entry) => entry.id)).toEqual([
      "torsion-free-action",
      "cover-and-compression",
      "complete-cell-poset",
      "two-sided-walls",
      "closed-wall-cocycle",
      "primitive-schreier-character",
      "compatible-pulling-triangulation",
      "primitive-pl-height",
      "full-cell-cocycle-extension",
      "full-directed-links",
      "link-collapsibility",
    ]);
  });

  it("fails closed on legacy caller-supplied IMM23 booleans", () => {
    const accepted = acceptedProductAction();
    const quotient = acceptedActionToQuotientComplex(PRODUCT_SYSTEM, accepted, {
      subgroupName: "H_translation",
    });
    const certificate = certifyFullDavisVirtualAlgebraicFibration({
      quotient,
      acceptedAction: accepted,
      imm23Hypotheses: {
        compactSmoothManifoldCertified: true,
        dimensionAtMostFiveCertified: true,
        compatibleAffinePlStructureCertified: true,
        circleValuedMorseMapCertified: true,
        smoothingCompatibilityCertified: true,
        certificateHashes: ["f".repeat(64)],
      },
    });

    expect(certificate.result.imm23TopologicalFibrationCertified).toBe(false);
    expect(certificate.imm23Hypotheses).toBeUndefined();
    expect(certificate.warnings.join(" ")).toContain("ignored");
    expect(certificate.nonClaims.join(" ")).toContain(
      "No smooth fibration is certified",
    );
  });

  it("rejects tampered incidence and cocycle evidence", () => {
    const accepted = acceptedProductAction();
    const quotient = acceptedActionToQuotientComplex(PRODUCT_SYSTEM, accepted, {
      subgroupName: "H_translation",
    });
    const certificate = searchFullDavisWallCoorientations({
      quotient,
      options: {
        exactWallLimit: 8,
        maxCandidates: 16,
        timeBudgetMs: 10_000,
      },
    }).certificate!;

    const incidenceTamper = structuredClone(certificate);
    incidenceTamper.fullCellPoset!.cells[0].properCofaceCellIds.push(
      "invented-cell",
    );
    expect(
      verifyFullDavisVirtualFiberingCertificate(incidenceTamper),
    ).toMatchObject({ valid: false });

    const equationTamper = structuredClone(certificate);
    equationTamper.wallHomomorphism!.cocycle.relationChecks[0].boundarySum = 7;
    expect(
      verifyFullDavisVirtualFiberingCertificate(equationTamper),
    ).toMatchObject({ valid: false });

    const extensionTamper = structuredClone(certificate);
    extensionTamper.heightFunction!.cellCharts[0].vertexHeights[0].rawHeight += 1;
    extensionTamper.heightFunction!.heightHash =
      computePrimitiveMorseHeightHash(extensionTamper.heightFunction!);
    expect(
      verifyFullDavisVirtualFiberingCertificate(extensionTamper),
    ).toMatchObject({ valid: false });
  });

  it("rebuilds a genuine rank-three quotient and rejects higher-cell overlap tampering", () => {
    const accepted = acceptedRankThreeProductAction();
    const quotient = acceptedActionToQuotientComplex(
      RANK_THREE_PRODUCT_SYSTEM,
      accepted,
      { subgroupName: "H_rank_three_translation" },
    );
    const certificate = searchFullDavisWallCoorientations({
      quotient,
      acceptedAction: accepted,
      sourceQuotientVertexIds: Array.from(
        { length: accepted.candidate.index },
        (_unused, point) => `q${point}`,
      ),
      options: {
        exactWallLimit: 12,
        maxCandidates: 256,
        deterministicCandidateBudgetOnly: true,
        collapsibilityOptions: {
          maxStates: 20_000,
          maxTransitions: 100_000,
          deterministicStateBudgetOnly: true,
        },
      },
    }).certificate!;

    expect(certificate.fullCellPoset?.dimension).toBe(3);
    expect(
      certificate.fullCellPoset?.cells.some((cell) => cell.dimension === 3),
    ).toBe(true);
    expect(certificate.heightFunction?.checks.everyCellIntegrated).toBe(true);
    expect(certificate.heightFunction?.checks.overlapDifferencesConstant).toBe(
      true,
    );
    expect(
      verifyFullDavisVirtualFiberingCertificate(certificate),
    ).toMatchObject({ valid: true });

    const higherCellTamper = structuredClone(certificate);
    const topCell = higherCellTamper.fullCellPoset!.cells.find(
      (cell) => cell.dimension === 3,
    )!;
    topCell.properFaceCellIds = topCell.properFaceCellIds.slice(1);
    expect(
      verifyFullDavisVirtualFiberingCertificate(higherCellTamper).errors.join(
        " ",
      ),
    ).toContain("cell poset");

    const overlapTamper = structuredClone(certificate);
    const overlap = overlapTamper.heightFunction!.overlapChecks.find(
      (check) => check.cofaceCellId === topCell.id,
    )!;
    overlap.additiveConstant = { numerator: "17", denominator: "1" };
    overlapTamper.heightFunction!.heightHash = computePrimitiveMorseHeightHash(
      overlapTamper.heightFunction!,
    );
    expect(
      verifyFullDavisVirtualFiberingCertificate(overlapTamper).errors.join(" "),
    ).toContain("action-rooted reconstruction");
  });

  it("rejects cover evidence that belongs to a different certified action", () => {
    const accepted = acceptedProductAction();
    const quotient = acceptedActionToQuotientComplex(PRODUCT_SYSTEM, accepted, {
      subgroupName: "H_translation",
    });
    const certificate = searchFullDavisWallCoorientations({
      quotient,
      options: { exactWallLimit: 8, maxCandidates: 16 },
    }).certificate!;
    const unrelatedCandidate = alternativeProductAction();
    const unrelatedActionCertificate = certifyTorsionFreeAction(
      PRODUCT_SYSTEM,
      unrelatedCandidate,
      planSphericalSpecialSubgroups(PRODUCT_SYSTEM),
    );
    expect(unrelatedActionCertificate.status).toBe("passed");
    const unrelated = structuredClone(certificate);
    unrelated.subgroupAction!.candidate = unrelatedCandidate;
    unrelated.subgroupAction!.certificate = unrelatedActionCertificate;
    const sourceQuotientVertexIds = ["q0", "q1", "q2", "q3"];
    const actionHash = canonicalSha256({
      system: PRODUCT_SYSTEM,
      sourceQuotientVertexIds,
      generatorImages: unrelatedCandidate.generatorImages,
      certificate: unrelatedActionCertificate,
    });
    unrelated.subgroupAction!.sourceQuotientVertexIds = sourceQuotientVertexIds;
    unrelated.subgroupAction!.actionHash = actionHash;
    unrelated.hashes.actionSha256 = actionHash;

    const replay = verifyFullDavisVirtualFiberingCertificate(unrelated);
    expect(replay.valid).toBe(false);
    expect(replay.errors.join(" ")).toMatch(
      /cover-compression.*action-rooted reconstruction/i,
    );
  });

  it("requires every mandatory stage before preserving a theorem-facing status", () => {
    const accepted = acceptedProductAction();
    const quotient = acceptedActionToQuotientComplex(PRODUCT_SYSTEM, accepted, {
      subgroupName: "H_translation",
    });
    const certificate = searchFullDavisWallCoorientations({
      quotient,
      options: { exactWallLimit: 8, maxCandidates: 16 },
    }).certificate!;
    const missingStage = structuredClone(certificate);
    missingStage.stages = missingStage.stages.filter(
      (entry) => entry.id !== "two-sided-walls",
    );
    const replay = verifyFullDavisVirtualFiberingCertificate(missingStage);
    expect(replay.valid).toBe(false);
    expect(replay.mandatoryStagesPassed).toBe(false);
    expect(replay.errors.join(" ")).toContain(
      "Mandatory stage two-sided-walls",
    );
  });

  it("classifies unexpected runtime failures as incomplete, not rejection", () => {
    const accepted = acceptedProductAction();
    const quotient = acceptedActionToQuotientComplex(PRODUCT_SYSTEM, accepted);
    const runtimeFailure = new Proxy(quotient, {
      get(target, property, receiver) {
        if (property === "sourceSystem") {
          throw new RangeError("simulated allocation failure");
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const result = searchFullDavisWallCoorientations({
      quotient: runtimeFailure,
    });
    expect(result.status).toBe("incomplete");
    expect(result.terminationReason).toBe("runtime-error");
    expect(result.warnings.join(" ")).toContain("inconclusive");
  });

  it("does not trust a supplied action that disagrees with the quotient", () => {
    const accepted = acceptedProductAction();
    const quotient = acceptedActionToQuotientComplex(PRODUCT_SYSTEM, accepted, {
      subgroupName: "H_translation",
    });
    const mismatched = structuredClone(accepted);
    mismatched.candidate.generatorImages[0] =
      mismatched.candidate.generatorImages[2];
    const certificate = certifyFullDavisVirtualAlgebraicFibration({
      quotient,
      acceptedAction: mismatched,
    });

    expect(certificate.status).toBe("incomplete");
    expect(certificate.errors.join(" ")).toContain(
      "does not match the quotient permutation action",
    );
  });

  it("reports missing finite permutation data as incomplete instead of inventing a subgroup", () => {
    const certificate = certifyFullDavisVirtualAlgebraicFibration({
      quotient: {
        schemaVersion: 1,
        name: "missing action",
        sourceSystem: PRODUCT_SYSTEM,
        vertices: [{ id: "q0" }],
        edges: [],
        twoCells: [],
      },
    });

    expect(certificate.status).toBe("incomplete");
    expect(certificate.result.virtualAlgebraicFibration).toBe(false);
    expect(certificate.errors.join(" ")).toContain(
      "no complete permutation action",
    );
  });
});
