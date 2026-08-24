import { describe, expect, it } from "vitest";

import jnw from "../public/examples/jnw_cube_graph.json";
import {
  buildExactCheapScreenPeriodicPotential,
  buildExactCheapScreenPullingOrder,
  computeExactCheapScreenActionBindingDigest,
  runExactCompactActionCheapScreen,
  type ExactCheapScreenActionBinding,
  type ExactCompactActionCheapScreenOptions,
} from "../src/fibering/exactCompactActionCheapScreen";
import {
  buildGenericCompactExpensiveStage,
  computeGenericCompactExpensiveStageDigest,
  replayGenericCompactExpensiveStage,
  type GenericCompactExpensiveStageCertificate,
} from "../src/fibering/genericCompactExpensiveStage";
import { buildGenericActionH1Certificate } from "../src/fibering/genericActionH1";
import { buildJnwCubePositiveControlCertificate } from "../src/fibering/jnwCubePositiveControl";
import { buildStreamedLawfulDavisOracle } from "../src/fibering/streamedLawfulDavis";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "Universal dihedral expensive-stage fixture",
  rank: 2,
  generators: [
    { id: "a", label: "a" },
    { id: "b", label: "b" },
  ],
  coxeterMatrix: [
    [1, "inf"],
    ["inf", 1],
  ],
  dataStatus: "toy",
};

const ACTION: TorsionFreeActionCandidate = {
  id: "universal-dihedral-index-two-expensive-stage",
  index: 2,
  generatorImages: [
    [1, 0],
    [1, 0],
  ],
};

const PRODUCT_SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "Product of two universal dihedral groups",
  rank: 4,
  generators: Array.from({ length: 4 }, (_unused, index) => ({
    id: `s${index}`,
    label: `s${index}`,
  })),
  coxeterMatrix: [
    [1, "inf", 2, 2],
    ["inf", 1, 2, 2],
    [2, 2, 1, "inf"],
    [2, 2, "inf", 1],
  ],
  dataStatus: "toy",
};

const PRODUCT_ACTION: TorsionFreeActionCandidate = {
  id: "product-universal-dihedral-index-four",
  index: 4,
  generatorImages: Array.from({ length: 4 }, (_unused, generator) =>
    Array.from(
      { length: 4 },
      (_entry, point) => point ^ (generator < 2 ? 1 : 2),
    ),
  ),
};

function acceptedAction(): TorsionFreeCandidateResult {
  const certificate = certifyTorsionFreeAction(
    SYSTEM,
    ACTION,
    planSphericalSpecialSubgroups(SYSTEM),
  );
  expect(certificate.status).toBe("passed");
  return { candidate: ACTION, certificate };
}

function fixture(options?: {
  reverseOrder?: boolean;
  subdivisionFamily?: "pulling" | "maximal-simplex-stellar";
}) {
  const accepted = acceptedAction();
  const oracle = buildStreamedLawfulDavisOracle({
    system: SYSTEM,
    generatorImages: ACTION.generatorImages,
  });
  const h1 = buildGenericActionH1Certificate(SYSTEM, accepted);
  expect(h1.certificate.status).toBe("passed");
  expect(h1.certificate.h1?.rank).toBe(1);
  expect(h1.integralCocycleBasis).not.toBeNull();
  const bindingPayload: Omit<ExactCheapScreenActionBinding, "bindingDigest"> = {
    schemaVersion: 1,
    kind: "exact-finite-coxeter-permutation-action-binding",
    status: "passed",
    upstreamCertificateKind: "tits-spherical-special-subgroup-action",
    upstreamCertificateDigest: canonicalSha256(accepted.certificate),
    degree: oracle.degree,
    generatorCount: oracle.generatorCount,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    checks: {
      exactPermutationActionVerified: true,
      coxeterRelationsVerified: true,
      torsionFreeVerified: true,
    },
  };
  const binding = {
    ...bindingPayload,
    bindingDigest: "",
  } as ExactCheapScreenActionBinding;
  binding.bindingDigest = computeExactCheapScreenActionBindingDigest(binding);
  const pullingOrder = buildExactCheapScreenPullingOrder(oracle.degree, {
    id: options?.reverseOrder ? "reverse" : "canonical",
    multiplier: options?.reverseOrder ? -1 : 1,
    shift: options?.reverseOrder ? oracle.degree - 1 : 0,
  });
  const zeroPotential = buildExactCheapScreenPeriodicPotential(oracle.degree, {
    id: "zero",
    specification: { method: "zero" },
  });
  const cheapScreenOptions: Omit<
    ExactCompactActionCheapScreenOptions,
    "oracle" | "cocycleBasis"
  > = {
    actionBinding: binding,
    characters: [{ id: "eta0-positive", coordinates: ["1"] }],
    pullingOrders: [pullingOrder],
    periodicPotentials: [zeroPotential],
    subdivisionFamilies: [options?.subdivisionFamily ?? "pulling"],
    tiePolarities: [-1, 1],
    samplePoints: [0, 1],
    bounds: {
      maxSamplePoints: 2,
      maxCharacters: 1,
      maxOrders: 1,
      maxPotentials: 1,
      maxSubdivisionFamilies: 1,
      maxTrials: 2,
      maxSourceCellsPerPoint: 32,
      maxPullingSimplicesPerSourceCell: 32,
      maxOriginalLinkVerticesPerPoint: 32,
      maxIntroducedCentersPerTrial: 32,
    },
  };
  const cheapScreenReport = runExactCompactActionCheapScreen({
    ...cheapScreenOptions,
    oracle,
    cocycleBasis: h1.integralCocycleBasis!,
  });
  expect(cheapScreenReport.outcome).toBe("sample-pass-found");
  return {
    accepted,
    oracle,
    h1,
    cheapScreenOptions,
    cheapScreenReport,
  };
}

function rankTwoFixture() {
  const certificate = certifyTorsionFreeAction(
    PRODUCT_SYSTEM,
    PRODUCT_ACTION,
    planSphericalSpecialSubgroups(PRODUCT_SYSTEM),
  );
  expect(certificate.status).toBe("passed");
  const accepted = { candidate: PRODUCT_ACTION, certificate };
  const oracle = buildStreamedLawfulDavisOracle({
    system: PRODUCT_SYSTEM,
    generatorImages: PRODUCT_ACTION.generatorImages,
  });
  const h1 = buildGenericActionH1Certificate(PRODUCT_SYSTEM, accepted);
  expect(h1.certificate.h1?.rank).toBe(2);
  const bindingPayload: Omit<ExactCheapScreenActionBinding, "bindingDigest"> = {
    schemaVersion: 1,
    kind: "exact-finite-coxeter-permutation-action-binding",
    status: "passed",
    upstreamCertificateKind: "tits-spherical-special-subgroup-action",
    upstreamCertificateDigest: canonicalSha256(certificate),
    degree: oracle.degree,
    generatorCount: oracle.generatorCount,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    checks: {
      exactPermutationActionVerified: true,
      coxeterRelationsVerified: true,
      torsionFreeVerified: true,
    },
  };
  const binding = {
    ...bindingPayload,
    bindingDigest: "",
  } as ExactCheapScreenActionBinding;
  binding.bindingDigest = computeExactCheapScreenActionBindingDigest(binding);
  const cheapScreenOptions: Omit<
    ExactCompactActionCheapScreenOptions,
    "oracle" | "cocycleBasis"
  > = {
    actionBinding: binding,
    characters: [{ id: "mixed-product-character", coordinates: ["-1", "1"] }],
    pullingOrders: [
      buildExactCheapScreenPullingOrder(oracle.degree, {
        id: "canonical",
        multiplier: 1,
      }),
    ],
    periodicPotentials: [
      buildExactCheapScreenPeriodicPotential(oracle.degree, {
        id: "zero",
        specification: { method: "zero" },
      }),
    ],
    subdivisionFamilies: ["pulling"],
    tiePolarities: [-1, 1],
    samplePoints: [0, 1, 2, 3],
    bounds: {
      maxSamplePoints: 4,
      maxCharacters: 1,
      maxOrders: 1,
      maxPotentials: 1,
      maxSubdivisionFamilies: 1,
      maxTrials: 2,
      maxSourceCellsPerPoint: 128,
      maxPullingSimplicesPerSourceCell: 128,
      maxOriginalLinkVerticesPerPoint: 128,
      maxIntroducedCentersPerTrial: 128,
    },
  };
  const cheapScreenReport = runExactCompactActionCheapScreen({
    ...cheapScreenOptions,
    oracle,
    cocycleBasis: h1.integralCocycleBasis!,
  });
  expect(cheapScreenReport.outcome).toBe("sample-pass-found");
  return {
    accepted,
    oracle,
    h1,
    cheapScreenOptions,
    cheapScreenReport,
  };
}

function rankSixJnwFixture() {
  const positiveControl = buildJnwCubePositiveControlCertificate(jnw);
  const accepted = {
    candidate: positiveControl.finiteAction.candidate,
    certificate: positiveControl.finiteAction.certificate,
  };
  const oracle = buildStreamedLawfulDavisOracle({
    system: jnw,
    generatorImages: accepted.candidate.generatorImages,
  });
  const h1 = buildGenericActionH1Certificate(jnw, accepted);
  expect(h1.certificate.h1?.rank).toBe(6);
  const bindingPayload: Omit<ExactCheapScreenActionBinding, "bindingDigest"> = {
    schemaVersion: 1,
    kind: "exact-finite-coxeter-permutation-action-binding",
    status: "passed",
    upstreamCertificateKind: "tits-spherical-special-subgroup-action",
    upstreamCertificateDigest: canonicalSha256(accepted.certificate),
    degree: oracle.degree,
    generatorCount: oracle.generatorCount,
    actionRowsCanonicalSha256: oracle.actionRowsCanonicalSha256,
    checks: {
      exactPermutationActionVerified: true,
      coxeterRelationsVerified: true,
      torsionFreeVerified: true,
    },
  };
  const binding = {
    ...bindingPayload,
    bindingDigest: "",
  } as ExactCheapScreenActionBinding;
  binding.bindingDigest = computeExactCheapScreenActionBindingDigest(binding);
  const cheapScreenOptions: Omit<
    ExactCompactActionCheapScreenOptions,
    "oracle" | "cocycleBasis"
  > = {
    actionBinding: binding,
    characters: [
      {
        id: "jnw-generic-h1-legal-character",
        coordinates: ["1", "-1", "1", "1", "1", "-1"],
      },
    ],
    pullingOrders: [
      buildExactCheapScreenPullingOrder(oracle.degree, {
        id: "canonical",
        multiplier: 1,
      }),
    ],
    periodicPotentials: [
      buildExactCheapScreenPeriodicPotential(oracle.degree, {
        id: "zero",
        specification: { method: "zero" },
      }),
    ],
    subdivisionFamilies: ["pulling"],
    tiePolarities: [-1],
    samplePoints: [0, 1, 2, 3],
    bounds: {
      maxSamplePoints: 4,
      maxCharacters: 1,
      maxOrders: 1,
      maxPotentials: 1,
      maxSubdivisionFamilies: 1,
      maxTrials: 1,
      maxSourceCellsPerPoint: 512,
      maxPullingSimplicesPerSourceCell: 512,
      maxOriginalLinkVerticesPerPoint: 512,
      maxIntroducedCentersPerTrial: 512,
    },
  };
  const cheapScreenReport = runExactCompactActionCheapScreen({
    ...cheapScreenOptions,
    oracle,
    cocycleBasis: h1.integralCocycleBasis!,
  });
  expect(cheapScreenReport.outcome).toBe("sample-pass-found");
  return {
    accepted,
    oracle,
    h1,
    cheapScreenOptions,
    cheapScreenReport,
  };
}

describe("generic compact expensive stage", () => {
  it("replays compression and exhausts the full rank-one arrangement with both tie polarities", () => {
    const data = fixture();
    const survivorTrialId = data.cheapScreenReport.passingTrialIds[0];
    const options = {
      oracle: data.oracle,
      h1: data.h1,
      cheapScreenOptions: data.cheapScreenOptions,
      cheapScreenReport: data.cheapScreenReport,
      survivorTrialId,
    };
    const certificate = buildGenericCompactExpensiveStage(
      SYSTEM,
      data.accepted,
      options,
    );

    expect(certificate).toMatchObject({
      status: "completed",
      outcome: "exact-arrangement-complete",
      checks: {
        oracleExactlyBoundToAcceptedAction: true,
        h1CertificateReplayed: true,
        fullIntegralH1BasisBound: true,
        cheapScreenReplayed: true,
        selectedCheapScreenTrialPassed: true,
        generalizedCompressionReplayed: true,
        templateRuleMatchesSelectedSurvivor: true,
        exactArrangementReplayed: true,
        allClaimedChecksPassed: true,
      },
      arrangement: {
        rank: 1,
        templateCount: 2,
        checks: {
          everyRealizableNonzeroFaceRepresented: true,
          lowerDimensionalZeroSignFacesIncluded: true,
          bothOffsetPolaritiesEvaluated: true,
          zeroCharacterSeparated: true,
        },
        census: {
          arrangementFaceCount: 2,
          fullDimensionalChamberCount: 2,
          lowerDimensionalFaceCount: 0,
          zeroCharacterLeafCount: 1,
        },
      },
      templateCompatibility: {
        characterId: "eta0-positive",
        sigma: -1,
        sampledPointIds: [0, 1],
        checks: {
          everySampledPointMatched: true,
          germSetsMatched: true,
          adjacencyMatched: true,
          exactDirectionsMatched: true,
          directedComponentsMatched: true,
          failureSetsMatched: true,
          sampledLinksPassed: true,
        },
      },
    });
    expect(certificate.generalizedCompression?.certificate).toMatchObject({
      status: "passed",
      rootedSourceCellCount: 6,
      compressedCellCount: 4,
      rootedFaceRecordCount: 4,
    });
    expect(certificate.arrangement?.faceCatalogue).toHaveLength(2);
    expect(
      certificate.arrangement?.faceCatalogue.every(
        (face) =>
          face.primitiveRepresentative.length === 1 &&
          face.polarities.map((entry) => entry.sigma).join(",") === "-1,1",
      ),
    ).toBe(true);
    expect(
      replayGenericCompactExpensiveStage(
        SYSTEM,
        data.accepted,
        options,
        certificate,
      ),
    ).toMatchObject({
      status: "passed",
      checks: {
        envelopeRecognized: true,
        storedCertificateDigestValid: true,
        exactActionRootedRebuildMatches: true,
      },
    });
  });

  it("keeps a complete compression sidecar when the survivor rule cannot be promoted", () => {
    const data = fixture({ reverseOrder: true });
    const options = {
      oracle: data.oracle,
      h1: data.h1,
      cheapScreenOptions: data.cheapScreenOptions,
      cheapScreenReport: data.cheapScreenReport,
      survivorTrialId: data.cheapScreenReport.passingTrialIds[0],
    };
    const certificate = buildGenericCompactExpensiveStage(
      SYSTEM,
      data.accepted,
      options,
    );

    expect(certificate).toMatchObject({
      status: "incomplete",
      outcome: "compression-sidecar-only",
      generalizedCompression: {
        certificate: { status: "passed" },
        replay: { valid: true },
      },
      nonpromotableGap: {
        code: "cheap-survivor-rule-not-supported-by-full-template-api",
        preservedResult: "replayed-full-generalized-compression-sidecar",
      },
      upstream: {
        survivor: {
          compatibility: {
            pullingSubdivision: true,
            canonicalPointOrder: false,
            zeroPeriodicPotential: true,
            existingTemplateApiCompatible: false,
          },
        },
      },
    });
    expect(certificate.arrangement).toBeUndefined();
    expect(
      replayGenericCompactExpensiveStage(
        SYSTEM,
        data.accepted,
        options,
        certificate,
      ).status,
    ).toBe("passed");
  });

  it("retains realizable lower-dimensional zero-sign faces and applies both ties", () => {
    const data = rankTwoFixture();
    const options = {
      oracle: data.oracle,
      h1: data.h1,
      cheapScreenOptions: data.cheapScreenOptions,
      cheapScreenReport: data.cheapScreenReport,
      survivorTrialId: data.cheapScreenReport.passingTrialIds[0],
    };
    const certificate = buildGenericCompactExpensiveStage(
      PRODUCT_SYSTEM,
      data.accepted,
      options,
    );
    expect(certificate.status).toBe("completed");
    expect(certificate.arrangement?.rank).toBe(2);
    expect(
      certificate.arrangement?.census.lowerDimensionalFaceCount,
    ).toBeGreaterThan(0);
    expect(
      certificate.arrangement?.census.tieSensitiveFaceCount,
    ).toBeGreaterThan(0);
    const zeroSignFaces =
      certificate.arrangement?.faceCatalogue.filter((face) =>
        face.signs.includes(0),
      ) ?? [];
    expect(zeroSignFaces.length).toBeGreaterThan(0);
    expect(
      zeroSignFaces.every(
        (face) =>
          face.lowerDimensional &&
          face.dimension === 1 &&
          face.polarities[0].sigma === -1 &&
          face.polarities[1].sigma === 1 &&
          face.polarities[0].tieGermCount > 0 &&
          face.polarities[1].tieGermCount > 0,
      ),
    ).toBe(true);
    expect(
      replayGenericCompactExpensiveStage(
        PRODUCT_SYSTEM,
        data.accepted,
        options,
        certificate,
      ).status,
    ).toBe("passed");
  });

  it("records and replays a pre-compression resource stop as incomplete", () => {
    const data = fixture();
    const options = {
      oracle: data.oracle,
      h1: data.h1,
      cheapScreenOptions: data.cheapScreenOptions,
      cheapScreenReport: data.cheapScreenReport,
      survivorTrialId: data.cheapScreenReport.passingTrialIds[0],
      bounds: { maxSphericalTypes: 1 },
    };
    const certificate = buildGenericCompactExpensiveStage(
      SYSTEM,
      data.accepted,
      options,
    );
    expect(certificate).toMatchObject({
      status: "incomplete",
      outcome: "incomplete-before-compression",
      stop: {
        stage: "upstream-replay",
        code: "maxSphericalTypes",
      },
    });
    expect(certificate.generalizedCompression).toBeUndefined();
    expect(
      replayGenericCompactExpensiveStage(
        SYSTEM,
        data.accepted,
        options,
        certificate,
      ).status,
    ).toBe("passed");
  });

  it("records post-compression template and cone caps without partial promotion", () => {
    for (const [bounds, expectedStage, expectedCode] of [
      [{ maxTemplates: 1 }, "full-integral-template-stream", "maxTemplates"],
      [
        { maxConeNodes: 1 },
        "exact-height-arrangement",
        "exact-cone-resource-bound",
      ],
    ] as const) {
      const data = fixture();
      const options = {
        oracle: data.oracle,
        h1: data.h1,
        cheapScreenOptions: data.cheapScreenOptions,
        cheapScreenReport: data.cheapScreenReport,
        survivorTrialId: data.cheapScreenReport.passingTrialIds[0],
        bounds,
      };
      const certificate = buildGenericCompactExpensiveStage(
        SYSTEM,
        data.accepted,
        options,
      );
      expect(certificate).toMatchObject({
        status: "incomplete",
        outcome: "compression-sidecar-only",
        generalizedCompression: { replay: { valid: true } },
        stop: { stage: expectedStage, code: expectedCode },
      });
      expect(certificate.arrangement).toBeUndefined();
      expect(
        replayGenericCompactExpensiveStage(
          SYSTEM,
          data.accepted,
          options,
          certificate,
        ).status,
      ).toBe("passed");
    }
  });

  it("rebuilds action-rooted oracle callbacks instead of trusting supplied methods", () => {
    const data = fixture();
    const forgedOracle = {
      ...data.oracle,
      forEachFacet(): never {
        throw new Error("forged forEachFacet callback was invoked");
      },
      cellVertices(): never {
        throw new Error("forged cellVertices callback was invoked");
      },
    } as typeof data.oracle;
    const certificate = buildGenericCompactExpensiveStage(
      SYSTEM,
      data.accepted,
      {
        oracle: forgedOracle,
        h1: data.h1,
        cheapScreenOptions: data.cheapScreenOptions,
        cheapScreenReport: data.cheapScreenReport,
        survivorTrialId: data.cheapScreenReport.passingTrialIds[0],
      },
    );
    expect(certificate.status).toBe("completed");
    expect(certificate.checks.oracleExactlyBoundToAcceptedAction).toBe(true);
  });

  it("preserves compression and refuses to replace rank-six full H1 by a slice", () => {
    const data = rankSixJnwFixture();
    const options = {
      oracle: data.oracle,
      h1: data.h1,
      cheapScreenOptions: data.cheapScreenOptions,
      cheapScreenReport: data.cheapScreenReport,
      survivorTrialId: data.cheapScreenReport.passingTrialIds[0],
    };
    const certificate = buildGenericCompactExpensiveStage(
      jnw,
      data.accepted,
      options,
    );
    expect(certificate).toMatchObject({
      status: "incomplete",
      outcome: "compression-sidecar-only",
      upstream: { h1Rank: 6 },
      generalizedCompression: { replay: { valid: true } },
      nonpromotableGap: {
        code: "full-h1-rank-exceeds-in-process-exact-cone-engine",
        preservedResult: "replayed-full-generalized-compression-sidecar",
      },
      stop: {
        stage: "exact-height-arrangement",
        code: "full-h1-rank-exceeds-in-process-exact-cone-engine",
      },
    });
    expect(certificate.arrangement).toBeUndefined();
    expect(certificate.warnings.join(" ")).toMatch(/No lower-rank slice/u);
    expect(
      replayGenericCompactExpensiveStage(
        jnw,
        data.accepted,
        options,
        certificate,
      ).status,
    ).toBe("passed");
  });

  it("rejects a self-resealed arrangement result", () => {
    const data = fixture();
    const options = {
      oracle: data.oracle,
      h1: data.h1,
      cheapScreenOptions: data.cheapScreenOptions,
      cheapScreenReport: data.cheapScreenReport,
      survivorTrialId: data.cheapScreenReport.passingTrialIds[0],
    };
    const original = buildGenericCompactExpensiveStage(
      SYSTEM,
      data.accepted,
      options,
    );
    const forged = structuredClone(
      original,
    ) as GenericCompactExpensiveStageCertificate;
    const face = forged.arrangement?.faceCatalogue[0];
    if (!face) throw new Error("Missing arrangement face fixture.");
    face.dimension += 1;
    forged.certificateDigest =
      computeGenericCompactExpensiveStageDigest(forged);

    const replay = replayGenericCompactExpensiveStage(
      SYSTEM,
      data.accepted,
      options,
      forged,
    );
    expect(replay).toMatchObject({
      status: "failed",
      checks: {
        storedCertificateDigestValid: true,
        exactActionRootedRebuildMatches: false,
      },
    });
  });

  it("rejects a self-resealed unknown budget key", () => {
    const data = fixture();
    const options = {
      oracle: data.oracle,
      h1: data.h1,
      cheapScreenOptions: data.cheapScreenOptions,
      cheapScreenReport: data.cheapScreenReport,
      survivorTrialId: data.cheapScreenReport.passingTrialIds[0],
    };
    const forged = structuredClone(
      buildGenericCompactExpensiveStage(SYSTEM, data.accepted, options),
    ) as GenericCompactExpensiveStageCertificate & {
      budgets: Record<string, number>;
    };
    forged.budgets.unknownBudget = 1;
    forged.certificateDigest =
      computeGenericCompactExpensiveStageDigest(forged);
    expect(
      replayGenericCompactExpensiveStage(
        SYSTEM,
        data.accepted,
        options,
        forged,
      ),
    ).toMatchObject({
      status: "failed",
      checks: {
        storedCertificateDigestValid: true,
        exactActionRootedRebuildMatches: false,
      },
    });
  });
});
