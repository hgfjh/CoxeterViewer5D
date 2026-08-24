import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import I2_5 from "../public/examples/I2_5.json";
import I2_5_IDENTITY_QUOTIENT from "../src/examples/I2_5_identity_quotient.json";
import A3_SAGE_DISCOVERY_ARTIFACT from "./fixtures/torsion-free-discovery/a3.sage.passed.json";
import I2_5_COMPOSITE_DISCOVERY_ARTIFACT from "./fixtures/torsion-free-discovery/i2_5.composite.passed.json";
import I2_5_DISCOVERY_ARTIFACT from "./fixtures/torsion-free-discovery/i2_5.passed.json";
import I2_5_SAGE_DISCOVERY_ARTIFACT from "./fixtures/torsion-free-discovery/i2_5.sage.passed.json";
import {
  buildAutomaticCoverSearchPlan,
  certifyAutomaticCoverArtifact,
  parseAutomaticCoverSearchArtifact,
  parseAutomaticKernelCoverCertificate,
  summarizeAutomaticCoverAvailability,
  summarizeAutomaticSymbolicKernel,
  type AutomaticCoverSearchArtifact,
} from "../src/app/torsionFreeCoverDiscovery";
import { CoversWallsPanel } from "../src/app/CoversWallsPanel";
import { parseCoxeterSystemInput } from "../src/coxeter";
import { parseQuotientComplex } from "../src/quotient";

function passingArtifact(): AutomaticCoverSearchArtifact {
  const system = parseCoxeterSystemInput(I2_5);
  const quotient = parseQuotientComplex(I2_5_IDENTITY_QUOTIENT);
  const vertices = quotient.vertices.map((vertex) => ({
    id: vertex.id,
    representativeWord: vertex.representativeWord,
  }));
  return {
    schemaVersion: 1,
    artifactType: "coxeter-torsion-free-discovery",
    status: "passed",
    ok: true,
    sourceSystem: system,
    bounds: {
      backend: "gap",
      maxIndex: 32,
      maxCandidates: 8,
      maxWitnesses: 128,
      maxSphericalOrder: 1000,
      maxSubsets: 1024,
      timeoutSeconds: 30,
    },
    sphericalCatalogue: { complete: true, maximalSubgroups: [] },
    search: {
      method: "LowIndexSubgroupsFpGroupIterator",
      maxIndex: 32,
      maxCandidates: 8,
      candidatesChecked: 1,
      iteratorComplete: false,
      reason: "certified-candidate",
    },
    finiteAction: {
      degree: vertices.length,
      vertices,
      generatorActions: (quotient.permutationAction ?? []).map((action) => ({
        generator: action.generator,
        images: quotient.vertices.map((vertex) => action.images[vertex.id]),
      })),
      subgroupGenerators: [],
    },
    certificate: {
      status: "passed",
      criterion: "tits-prime-order-fixed-point",
      completeTorsionWitnessCatalogue: true,
      claims: ["finite-index", "torsion-free"],
      nonClaims: ["minimal index"],
    },
    provenance: {
      backend: "gap-low-index-torsion-free",
      backendVersion: "1.0.0",
      gapVersion: "test",
      artifactHash: "sha256:test",
    },
    warnings: [],
    errors: [],
  };
}

function kernelOnlyArtifact(): AutomaticCoverSearchArtifact {
  const artifact = passingArtifact();
  artifact.status = "exhausted";
  artifact.ok = true;
  delete artifact.finiteAction;
  artifact.search = {
    ...artifact.search,
    iteratorComplete: true,
    reason: "no-manageable-action-within-bounds",
  };
  artifact.kernelCover = {
    status: "passed",
    kind: "normal-congruence-kernel",
    normal: true,
    torsionFree: true,
    certificateLevel: "exact-index-kernel",
    indexStatus: "exact",
    index: "10",
    finiteImage: {
      candidateId: "i2-5-mod-5",
      order: "10",
      characteristic: 5,
      residueFieldOrder: "5",
      representationDimension: 2,
      finiteTargetCertified: true,
      orderStatus: "exact",
    },
    criterion: "tits-spherical-image-order",
    completeSphericalRestrictionChecks: true,
    sphericalImageChecks: [
      {
        subset: [0, 1],
        expectedOrder: "10",
        imageOrder: "10",
        passed: true,
      },
    ],
    materialization: {
      status: "not-materialized",
      reason: "No finite permutation rows were written for this kernel.",
      maximumMaterializedDegree: 8,
    },
    claims: ["finite-index", "normal", "torsion-free"],
    nonClaims: ["materialized quotient", "virtual fibering"],
  };
  return artifact;
}

function unknownIndexKernelOnlyArtifact(): AutomaticCoverSearchArtifact {
  const artifact = kernelOnlyArtifact();
  artifact.kernelCover = {
    status: "passed",
    kind: "normal-congruence-kernel",
    normal: true,
    torsionFree: true,
    certificateLevel: "finite-index-kernel",
    indexStatus: "unknown",
    finiteImage: {
      candidateId: "i2-5-mod-7-unrecognized-image",
      characteristic: 7,
      residueFieldOrder: "7",
      representationDimension: 2,
      finiteTargetCertified: true,
      orderStatus: "unknown",
    },
    criterion: "tits-maximal-spherical-injective-reduction",
    completeSphericalRestrictionChecks: true,
    sphericalImageChecks: [
      {
        subset: [0, 1],
        expectedOrder: "10",
        imageOrder: "10",
        passed: true,
      },
    ],
    materialization: {
      status: "not-materialized",
      reason: "The finite image order has not yet been certified.",
      maximumMaterializedDegree: 576_000,
    },
    claims: ["finite-index", "normal", "torsion-free"],
    nonClaims: ["exact index", "materialized quotient", "virtual fibering"],
  };
  return artifact;
}

describe("automatic cover discovery UI boundary", () => {
  it("shows the exact necessary index divisor before search", () => {
    const plan = buildAutomaticCoverSearchPlan(I2_5);
    expect(plan.sphericalPlan.status).toBe("complete");
    expect(plan.indexLowerBound.value.decimal).toBe("10");
    expect(plan.request.sourceSystem.name).toBe("I2(5)");
    expect(plan.request.search).toMatchObject({
      backend: "auto",
      maxModuleCandidates: 96,
      maxCompositeModules: 4,
      maxCongruencePrime: 31,
    });
  });

  it("independently certifies a GAP action before constructing the cover", () => {
    const system = parseCoxeterSystemInput(I2_5);
    const certified = certifyAutomaticCoverArtifact(passingArtifact(), system);
    expect(certified.result.status).toBe("found");
    expect(certified.result.quotient?.vertices).toHaveLength(10);
    expect(certified.result.quotient?.torsionFreeCertificate).toMatchObject({
      status: "passed",
      method: "external-gap-kbmag",
    });
    expect(
      certified.result.quotient?.subgroup?.torsionFreeVerification?.verified,
    ).toBe(true);
  });

  it("accepts maximal-spherical regularity without inventing subgroup words", () => {
    const artifact = passingArtifact();
    delete artifact.finiteAction?.subgroupGenerators;
    artifact.certificate = {
      ...artifact.certificate,
      criterion: "tits-maximal-spherical-regular-orbits",
      completeTorsionWitnessCatalogue: undefined,
      completeSphericalRestrictionChecks: true,
    };
    const certified = certifyAutomaticCoverArtifact(
      artifact,
      parseCoxeterSystemInput(I2_5),
    );
    expect(certified.result.status).toBe("found");
    expect(certified.result.quotient?.subgroup?.generators).toBeUndefined();
  });

  it("accepts the deterministic artifact emitted by the real GAP backend", () => {
    const certified = certifyAutomaticCoverArtifact(
      I2_5_DISCOVERY_ARTIFACT,
      parseCoxeterSystemInput(I2_5),
    );
    expect(certified.result.quotient?.vertices).toHaveLength(10);
    expect(certified.artifact.provenance?.gapVersion).toBe("4.14.0");
  });

  it("keeps Sage congruence provenance distinct after the independent check", () => {
    const artifact = passingArtifact();
    artifact.search = {
      ...artifact.search,
      selectedStrategy: "sage-congruence-kernel",
    };
    artifact.provenance = {
      ...artifact.provenance,
      backend: "sage-congruence-torsion-free",
      runtime: "sage",
    };
    const certified = certifyAutomaticCoverArtifact(
      artifact,
      parseCoxeterSystemInput(I2_5),
    );

    expect(certified.result.quotient?.torsionFreeCertificate?.method).toBe(
      "external-sage",
    );
    expect(
      certified.result.quotient?.subgroup?.torsionFreeVerification?.method,
    ).toBe("external-sage");
  });

  it("accepts stored exact Sage congruence artifacts after independent checks", () => {
    const i2 = certifyAutomaticCoverArtifact(
      I2_5_SAGE_DISCOVERY_ARTIFACT,
      parseCoxeterSystemInput(I2_5),
    );
    const a3 = certifyAutomaticCoverArtifact(
      A3_SAGE_DISCOVERY_ARTIFACT,
      parseCoxeterSystemInput(A3_SAGE_DISCOVERY_ARTIFACT.sourceSystem),
    );

    expect(i2.result.quotient?.vertices).toHaveLength(10);
    expect(i2.result.quotient?.torsionFreeCertificate?.method).toBe(
      "external-sage",
    );
    expect(i2.artifact.congruence).toMatchObject({
      rationalPrime: 3,
      imageOrder: 10,
    });
    expect(a3.result.quotient?.vertices).toHaveLength(24);
    expect(
      a3.artifact.congruence?.sphericalImageChecks?.every(
        (check) => check.passed,
      ),
    ).toBe(true);
  });

  it("accepts the stored Everitt-style diagonal action after independent checks", () => {
    const certified = certifyAutomaticCoverArtifact(
      I2_5_COMPOSITE_DISCOVERY_ARTIFACT,
      parseCoxeterSystemInput(I2_5),
    );

    expect(certified.result.quotient?.vertices).toHaveLength(10);
    expect(certified.artifact.search?.selectedStrategy).toBe(
      "everitt-composite",
    );
    expect(certified.artifact.composite).toMatchObject({
      moduleDegrees: [2, 5],
      orbitDegree: 10,
    });
  });

  it("parses an exact kernel certificate without treating it as an action", () => {
    const artifact = parseAutomaticCoverSearchArtifact(kernelOnlyArtifact());

    expect(artifact.kernelCover).toMatchObject({
      status: "passed",
      kind: "normal-congruence-kernel",
      certificateLevel: "exact-index-kernel",
      indexStatus: "exact",
      index: "10",
      normal: true,
      torsionFree: true,
      materialization: { status: "not-materialized" },
    });
    expect(artifact.finiteAction).toBeUndefined();
  });

  it("certifies finite index before the finite image order is known", () => {
    const artifact = parseAutomaticCoverSearchArtifact(
      unknownIndexKernelOnlyArtifact(),
    );
    const availability = summarizeAutomaticCoverAvailability(
      artifact,
      undefined,
    );

    expect(artifact.kernelCover).toMatchObject({
      certificateLevel: "finite-index-kernel",
      indexStatus: "unknown",
      finiteImage: {
        finiteTargetCertified: true,
        orderStatus: "unknown",
        representationDimension: 2,
      },
    });
    expect(artifact.kernelCover).not.toHaveProperty("index");
    expect(availability.torsionFreeCoverCertified).toBe(true);
    expect(availability.exactIndexCertified).toBe(false);
    expect(availability.torsionFreeCoverSummary).toContain(
      "exact index not yet known",
    );
    expect(
      summarizeAutomaticSymbolicKernel(
        artifact,
        buildAutomaticCoverSearchPlan(I2_5).sphericalPlan,
      ),
    ).toBeUndefined();
    expect(() =>
      certifyAutomaticCoverArtifact(artifact, parseCoxeterSystemInput(I2_5)),
    ).toThrow(/finite but not yet exactly determined index.*not materialized/i);
  });

  it("normalizes safe integer orders but rejects inconsistent kernel data", () => {
    const valid = kernelOnlyArtifact().kernelCover!;
    const normalized = parseAutomaticKernelCoverCertificate(
      {
        ...valid,
        index: 10,
        finiteImage: { ...valid.finiteImage, order: 10, residueFieldOrder: 5 },
        sphericalImageChecks: [
          { subset: [0, 1], expectedOrder: 10, imageOrder: 10, passed: true },
        ],
      },
      2,
    );
    expect(normalized.index).toBe("10");
    expect(normalized.finiteImage.residueFieldOrder).toBe("5");

    expect(() =>
      parseAutomaticKernelCoverCertificate(
        {
          ...valid,
          finiteImage: { ...valid.finiteImage, order: "20" },
        },
        2,
      ),
    ).toThrow(/index must equal the order/i);
    expect(() =>
      parseAutomaticKernelCoverCertificate(
        { ...valid, completeSphericalRestrictionChecks: false },
        2,
      ),
    ).toThrow(/mark.*complete/i);
  });

  it("keeps a certified unmaterialized kernel out of quotient construction", () => {
    const artifact = kernelOnlyArtifact();
    const availability = summarizeAutomaticCoverAvailability(
      artifact,
      undefined,
    );

    expect(availability).toMatchObject({
      torsionFreeCoverCertified: true,
      exactIndexCertified: true,
      manageableCoverMaterialized: false,
      downstreamEnabled: false,
    });
    expect(availability.torsionFreeCoverSummary).toContain("index 10");
    expect(availability.manageableCoverSummary).toContain(
      "No manageable cover was materialized",
    );
    expect(() =>
      certifyAutomaticCoverArtifact(artifact, parseCoxeterSystemInput(I2_5)),
    ).toThrow(/not materialized.*finite action.*hat X/i);
  });

  it("reports exact deck-orbit counts without promoting a symbolic kernel", () => {
    const artifact = kernelOnlyArtifact();
    const plan = buildAutomaticCoverSearchPlan(I2_5);
    const symbolic = summarizeAutomaticSymbolicKernel(
      artifact,
      plan.sphericalPlan,
    );

    expect(symbolic).toMatchObject({
      status: "exact-orbit-model",
      deckGroupOrder: "10",
      vertexCount: "10",
      generatorTransitionFamilies: 2,
      unrestrictedWallSearchAvailable: false,
      fiberingPromotionAllowed: false,
    });
    expect(symbolic?.cellCountsByRank).toEqual([
      { rank: 0, sphericalTypeCount: 1, cellCount: "10" },
      { rank: 1, sphericalTypeCount: 2, cellCount: "10" },
      { rank: 2, sphericalTypeCount: 1, cellCount: "1" },
    ]);
  });

  it("keeps unresolved subgroup families visible in the bounded degree ledger", () => {
    const input = kernelOnlyArtifact();
    input.finiteImageReports = [
      {
        sourceArtifactHash: "a".repeat(64),
        residueSource: { candidateId: "GF(2)", rationalPrime: 2 },
        boundedComplete: false,
        degreeLedger: [
          {
            degree: 5_760,
            outcome: "impossible",
            complete: true,
            reason: "Absent from the complete necessary index spectrum.",
          },
          {
            degree: 97_920,
            outcome: "unresolved-family-coverage",
            complete: false,
            reason: "Outer and nonsplit Goursat families remain open.",
          },
        ],
      },
    ];
    const artifact = parseAutomaticCoverSearchArtifact(input);

    expect(artifact.finiteImageReports?.[0]).toMatchObject({
      boundedComplete: false,
      degreeLedger: [
        { degree: 5_760, outcome: "impossible", complete: true },
        {
          degree: 97_920,
          outcome: "unresolved-family-coverage",
          complete: false,
        },
      ],
    });
  });

  it("shows existence and materialization as separate UI states", () => {
    const artifact = kernelOnlyArtifact();
    const plan = buildAutomaticCoverSearchPlan(I2_5);
    const noop = () => undefined;
    const html = renderToStaticMarkup(
      createElement(CoversWallsPanel, {
        selectedRelationFamily: "shared-complex",
        linkLens: "none",
        showWalls: true,
        wallDisplayMode: "all",
        showInducedDirections: true,
        colorEdgesByWall: true,
        showCells: true,
        showDiscardedCells: true,
        searchRunning: false,
        fiberingSearchRunning: false,
        importProgress: {
          stage: "idle",
          phase: "idle",
          completed: 0,
          total: 0,
          progress: 0,
          message: "No import is running.",
        },
        discoveryPlan: plan,
        discoveryOptions: plan.request.search,
        discoveryState: {
          status: "exhausted",
          message: "No manageable action was found within the search bounds.",
          artifact,
        },
        onDiscoveryOptionsChange: noop,
        onDiscoverCover: noop,
        onExportDiscoveryRequest: noop,
        onImportDiscoveryArtifact: noop,
        onImportCover: noop,
        onCancelImport: noop,
        onSelectWall: noop,
        onSelectVertex: noop,
        onRelationFamilyChange: noop,
        onLinkLensChange: noop,
        onFlipWall: noop,
        onOptimize: noop,
        onFindVirtualFibering: noop,
        onFindFullDavisFibering: noop,
        onExportVirtualFibering: noop,
        onShowWallsChange: noop,
        onWallDisplayModeChange: noop,
        onShowInducedDirectionsChange: noop,
        onColorEdgesByWallChange: noop,
        onShowCellsChange: noop,
        onShowDiscardedCellsChange: noop,
      }),
    );

    expect(html).toContain("Torsion-free cover");
    expect(html).toContain("Usable finite cover");
    expect(html).toContain(
      "Certified normal congruence kernel (exact index 10)",
    );
    expect(html).toContain("No manageable cover was materialized");
    expect(html).toContain("Exact symbolic regular cover");
    expect(html).toContain("do not certify an unrestricted wall search");
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Build quotient and walls/,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Run fibering pipeline/);
  });

  it("rejects an artifact for a different Coxeter presentation", () => {
    const artifact = passingArtifact();
    artifact.sourceSystem = {
      ...artifact.sourceSystem!,
      coxeterMatrix: [
        [1, 4],
        [4, 1],
      ],
    };
    expect(() =>
      certifyAutomaticCoverArtifact(artifact, parseCoxeterSystemInput(I2_5)),
    ).toThrow(/different Coxeter presentation/i);
  });
});
