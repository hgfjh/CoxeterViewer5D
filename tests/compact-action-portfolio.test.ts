import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import i25 from "../public/examples/I2_5.json";
import p0 from "../public/examples/compact_5_prism_makarov.json";
import p1 from "../public/examples/compact_5_polytope_p1_double_makarov.json";
import tumarkin04 from "../public/examples/tumarkin_5d_8facet_g11411_04.json";
import tumarkin15 from "../public/examples/tumarkin_5d_8facet_g11411_15.json";
import {
  actionFromCompactDiscoveryArtifact,
  auditCompactExpensiveStageCapacity,
  buildCompactActionPortfolio,
  buildCompactPostActionEvidence,
  compactDiscoveryPortableSha256,
  COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS,
  COMPACT_TARGET_DEFINITIONS,
  nonPassedCompactDiscoveryEvidence,
  replayCompactActionPortfolio,
  replayCompactPostActionEvidence,
  restrictP0ActionToP1,
  type CompactTargetId,
  type CompactTargetEvidence,
  type CompactTargetSourceInput,
} from "../src/fibering/compactActionPortfolio";
import { computeGenericActionH1CertificateDigest } from "../src/fibering/genericActionH1";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeCandidateResult,
} from "../src/torsionFree";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const SOURCES: CompactTargetSourceInput[] = [
  {
    id: "makarov-p0",
    path: "public/examples/compact_5_prism_makarov.json",
    bytesSha256:
      "6cb5c7bd535e654e83dc87d383fd9aba5db61fa491edaeff634f792aea5bc221",
    input: p0,
  },
  {
    id: "makarov-p1",
    path: "public/examples/compact_5_polytope_p1_double_makarov.json",
    bytesSha256:
      "2f5acbaef9bfa5423a38e6052eb1bd25929b41b9c8430c179e49e0993bdcaf31",
    input: p1,
  },
  {
    id: "tumarkin-g11411-15",
    path: "public/examples/tumarkin_5d_8facet_g11411_15.json",
    bytesSha256:
      "8955e1c37c4993b9af271d84a796b0551e3e21aedfeed8341319f304cce7bdac",
    input: tumarkin15,
  },
  {
    id: "tumarkin-g11411-04",
    path: "public/examples/tumarkin_5d_8facet_g11411_04.json",
    bytesSha256:
      "8329d612e98ac0020ffb93bf9ba3d8ee988cd66330a617a0992893812d1cc750",
    input: tumarkin04,
  },
];

function certify(
  system: unknown,
  candidate: TorsionFreeActionCandidate,
): TorsionFreeCandidateResult {
  const plan = planSphericalSpecialSubgroups(system as never);
  const certificate = certifyTorsionFreeAction(
    system as never,
    candidate,
    plan,
  );
  expect(certificate.status).toBe("passed");
  return { candidate, certificate };
}

function universalDihedralAction(): {
  system: unknown;
  accepted: TorsionFreeCandidateResult;
} {
  const system = {
    schemaVersion: 1,
    name: "Universal dihedral portfolio fixture",
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
  const candidate: TorsionFreeActionCandidate = {
    id: "universal-dihedral-index-two",
    index: 2,
    generatorImages: [
      [1, 0],
      [1, 0],
    ],
  };
  return { system, accepted: certify(system, candidate) };
}

function finiteDihedralRegularAction(m: number): TorsionFreeActionCandidate {
  const point = (rotation: number, reflected: number) =>
    ((2 * ((rotation % m) + m)) % (2 * m)) + reflected;
  const generatorImages = [0, 1].map((generator) =>
    Array.from({ length: 2 * m }, (_unused, state) => {
      const rotation = Math.floor(state / 2);
      const reflected = state % 2;
      return generator === 0
        ? point(rotation, reflected ^ 1)
        : point(rotation + (reflected === 0 ? 1 : -1), reflected ^ 1);
    }),
  );
  return {
    id: `i2-${m}-right-regular`,
    index: 2 * m,
    generatorImages,
  };
}

function nonPassedDiscoveryArtifact(
  targetId: CompactTargetId,
  status: "failed" | "timeout" | "exhausted",
): unknown {
  const source = SOURCES.find((candidate) => candidate.id === targetId);
  const definition = COMPACT_TARGET_DEFINITIONS.find(
    (candidate) => candidate.id === targetId,
  );
  if (source === undefined || definition === undefined) {
    throw new Error(`Missing test target ${targetId}.`);
  }
  const withoutProducerHash = {
    schemaVersion: 1,
    artifactType: "coxeter-torsion-free-discovery",
    status,
    ok: status === "exhausted",
    sourceSystem: source.input,
    inputHash: source.bytesSha256,
    bounds: {
      maxIndex: definition.discovery.maxIndex,
      maxCandidates: definition.discovery.maxCandidates,
      maxModuleCandidates: definition.discovery.maxModuleCandidates,
      maxCompositeModules: definition.discovery.maxCompositeModules,
      maxCompositeCombinations: definition.discovery.maxCompositeCombinations,
      maxCongruencePrime: definition.discovery.maxCongruencePrime,
      maxCongruenceImageOrder: definition.discovery.maxCongruenceImageOrder,
      maxWitnesses: definition.discovery.maxWitnesses,
      maxSphericalOrder: definition.discovery.maxSphericalOrder,
      maxSubsets: definition.discovery.maxSubsets,
      timeoutSeconds: definition.discovery.timeoutSeconds,
      maxLowIndexFallback: 512,
      maxMemoryBytes: 12 * 1024 * 1024 * 1024,
      lightWorkers: 4,
      heavyWorkers: 1,
    },
    strategyAttempts: [],
    warnings: [],
    errors: status === "failed" ? ["synthetic bounded failure"] : [],
    provenance: {
      backend: "automatic-torsion-free-cover",
      backendVersion: "3.4.1",
      runtime: "strategy-ladder",
      command: "python scripts/torsion_free_discovery.py --input <request>",
      inputHash: source.bytesSha256,
    },
  };
  const withProducerHash = {
    ...withoutProducerHash,
    provenance: {
      ...withoutProducerHash.provenance,
      artifactHash: canonicalSha256(withoutProducerHash),
    },
  };
  return {
    ...withProducerHash,
    provenance: {
      ...withProducerHash.provenance,
      portableArtifactHash: compactDiscoveryPortableSha256(withProducerHash),
    },
  };
}

function resealDiscoveryArtifact(artifact: {
  provenance: Record<string, unknown>;
}): void {
  delete artifact.provenance.artifactHash;
  delete artifact.provenance.portableArtifactHash;
  artifact.provenance.artifactHash = canonicalSha256(artifact);
  artifact.provenance.portableArtifactHash =
    compactDiscoveryPortableSha256(artifact);
}

describe("compact H5 action portfolio", () => {
  it("keeps every configured maximum action within the expensive-stage capacity plan", () => {
    const audits = SOURCES.map((source) =>
      auditCompactExpensiveStageCapacity(source.input, source.id),
    );
    expect(audits.every((audit) => audit.status === "passed")).toBe(true);
    expect(audits[0].workload).toMatchObject({
      sphericalTypeCountIncludingEmpty: 93,
      strictFaceTypeRelationCount: 962,
      maximumRootedSourceCells: 10_713_600,
      maximumRootedFaceRecords: 110_822_400,
      maximumTemplates: 115_200,
      cubeScaledGermCalibration: 14_890_560,
    });

    const undersized = auditCompactExpensiveStageCapacity(
      SOURCES[0].input,
      SOURCES[0].id,
      {
        ...COMPACT_GENERIC_EXPENSIVE_STAGE_BOUNDS,
        maxTemplates: 4_096,
      },
    );
    expect(undersized).toMatchObject({ status: "failed" });
    expect(undersized.errors.join(" ")).toMatch(/maxTemplates=4096/u);
  });

  it("matches the Python producer seal on exponent floats and Unicode", () => {
    const pythonProducedPayload = {
      schemaVersion: 1,
      numbers: [1e-8, 1.1e-12, 1e20, 1.0, -0.0],
      unicode: "Makarov λ",
    };
    expect(compactDiscoveryPortableSha256(pythonProducedPayload)).toBe(
      "2bd4d8af43d0b0d1f93927c1657f6ae4268c23b20fcb2471e4a57cfec65a4c78",
    );
  });

  it("recomputes the exact target ordering and spherical workload", () => {
    const artifact = buildCompactActionPortfolio(SOURCES, {
      generatedAt: "2026-08-22T00:00:00.000Z",
    });
    expect(artifact.status).toBe("passed");
    expect(artifact.targets.map((target) => target.id)).toEqual([
      "makarov-p0",
      "makarov-p1",
      "tumarkin-g11411-15",
      "tumarkin-g11411-04",
    ]);
    expect(artifact.policy.excludedTarget).toBe("tumarkin-g12221");

    const summaries = artifact.targets.map((target) => ({
      id: target.id,
      types: target.sphericalPlan.nonemptyTypeCount,
      divisor: target.sphericalPlan.torsionFreeDegreeDivisor,
      cells: target.sphericalPlan.conditionalMinimumQuotientCellCount,
      oddComponents: target.oddCoxeterGraph.componentCount,
    }));
    expect(summaries).toEqual([
      {
        id: "makarov-p0",
        types: 92,
        divisor: "28800",
        cells: "352484",
        oddComponents: 2,
      },
      {
        id: "makarov-p1",
        types: 92,
        divisor: "28800",
        cells: "342084",
        oddComponents: 1,
      },
      {
        id: "tumarkin-g11411-15",
        types: 122,
        divisor: "28800",
        cells: "443348",
        oddComponents: 3,
      },
      {
        id: "tumarkin-g11411-04",
        types: 122,
        divisor: "28800",
        cells: "414184",
        oddComponents: 1,
      },
    ]);
    expect(
      artifact.targets.every(
        (target) => target.disposition === "ready-for-torsion-free-search",
      ),
    ).toBe(true);
    expect(
      artifact.targets[0].cheapScreenPlan.plannedConfigurationFamilyCount,
    ).toBe(24);
    expect(artifact.targets[0].cheapScreenPlan.plannedDirectedRunCount).toBe(
      48,
    );
    expect(artifact.targets[0].cheapScreenPlan.executorStatus).toBe(
      "registered-exact-bounded-post-action",
    );
  });

  it("backward-replays the historical actionless preflight", () => {
    const stored = JSON.parse(
      readFileSync(
        "tests/fixtures/compact-action-portfolio/compact_h5_action_portfolio_historical.json",
        "utf8",
      ),
    ) as ReturnType<typeof buildCompactActionPortfolio>;
    const rebuilt = buildCompactActionPortfolio(SOURCES, {
      generatedAt: stored.generatedAt,
    });
    expect(stored.artifactHash).toBe(
      "3ec5c9ed1dd06b6cc3fa32e53a8a1d35407783a04e2e87e2a9c14ba9ba98e667",
    );
    expect(rebuilt.artifactHash).toBe(
      "c62806047a32f76e2c4ffd1bb328744988219a642c68f10826d54cf08b67049a",
    );
    expect(canonicalSha256(rebuilt)).not.toBe(canonicalSha256(stored));
    expect(replayCompactActionPortfolio(stored, SOURCES).status).toBe("passed");
    expect(replayCompactActionPortfolio(rebuilt, SOURCES).status).toBe(
      "passed",
    );
  });

  it("certifies the explicit P1 index-two kernel description", () => {
    const artifact = buildCompactActionPortfolio(SOURCES, {
      generatedAt: "2026-08-22T00:00:00.000Z",
    });
    expect(artifact.p0P1Double.kernelIndex).toBe(2);
    expect(artifact.p0P1Double.p0OddCharacter).toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(artifact.p0P1Double.p1GeneratorWordsInP0).toEqual([
      [0],
      [1],
      [2],
      [3],
      [4],
      [5],
      [6, 5, 6],
    ]);
    expect(artifact.p0P1Double.checks.every((check) => check.passed)).toBe(
      true,
    );
  });

  it("materializes and restricts a P0 action into its one or two P1 orbits", () => {
    const identity = [0, 1];
    const swap = [1, 0];
    const parent: TorsionFreeActionCandidate = {
      id: "parity-demo",
      index: 2,
      generatorImages: [
        identity,
        identity,
        identity,
        identity,
        identity,
        identity,
        swap,
      ],
    };
    const restricted = restrictP0ActionToP1(parent);
    expect(restricted).toHaveLength(2);
    expect(restricted.map((candidate) => candidate.index)).toEqual([1, 1]);
    expect(
      restricted.every((candidate) =>
        candidate.generatorImages.every((row) => row[0] === 0),
      ),
    ).toBe(true);

    const materialized = actionFromCompactDiscoveryArtifact(
      {
        status: "passed",
        artifactHash: "a".repeat(64),
        certificate: { status: "passed" },
        finiteAction: {
          degree: 2,
          vertices: [
            { id: "q0", representativeWord: [] },
            { id: "q1", representativeWord: [0] },
          ],
          generatorActions: [
            { generator: 0, images: ["q1", "q0"] },
            { generator: 1, images: ["q1", "q0"] },
          ],
        },
      },
      "materialized",
    );
    expect(materialized.generatorImages).toEqual([
      [1, 0],
      [1, 0],
    ]);
  });

  it("runs and action-rootedly replays exact H1 followed by the bounded screen", () => {
    const input = universalDihedralAction();
    const evidence = buildCompactPostActionEvidence(
      input.system,
      input.accepted,
    );
    expect(evidence.h1Wall).toMatchObject({
      status: "passed",
      fullIntegralLatticeCertified: true,
      h1Rank: 1,
      wallRank: 1,
      wallSaturationIndex: "1",
    });
    expect(evidence.cheapScreen).toMatchObject({
      status: "passed",
      report: {
        status: "completed",
        declaredPortfolio: { requestedTiePolarities: [-1, 1] },
      },
    });
    expect(evidence.generalizedCompression).toMatchObject({
      status: "passed",
      h1CertificateDigest: evidence.h1Wall?.certificateDigest,
      screenCertificateDigest: evidence.cheapScreen?.certificateDigest,
      replayPassed: true,
      stageCertificate: {
        status: "completed",
        outcome: "exact-arrangement-complete",
        upstream: {
          survivor: {
            subdivisionFamily: "pulling",
            compatibility: { existingTemplateApiCompatible: true },
          },
        },
      },
    });
    const firstPassingTrial = evidence.cheapScreen?.report.trials.find(
      (trial) =>
        trial.trialId === evidence.cheapScreen?.report.passingTrialIds[0],
    );
    expect(firstPassingTrial).toBeDefined();
    expect(evidence.generalizedCompression?.survivorTrialId).not.toBe(
      firstPassingTrial?.trialId,
    );
    expect(evidence.exactArrangement).toMatchObject({
      status: "passed",
      replayPassed: true,
    });
    expect(
      replayCompactPostActionEvidence(input.system, input.accepted, evidence),
    ).toMatchObject({
      status: "passed",
      checks: { exactExpensiveStageRebuilt: true },
    });

    const b1ZeroAccepted = certify(i25, finiteDihedralRegularAction(5));
    const b1Zero = buildCompactPostActionEvidence(i25, b1ZeroAccepted);
    expect(b1Zero.h1Wall).toMatchObject({ status: "passed", h1Rank: 0 });
    expect(b1Zero.cheapScreen).toBeUndefined();
  });

  it("rejects copied action pass flags without a materialized action", () => {
    expect(() =>
      buildCompactActionPortfolio(SOURCES, {
        generatedAt: "2026-08-22T00:00:00.000Z",
        evidence: {
          "makarov-p0": {
            torsionFree: {
              status: "passed",
              actionDigest: "bad",
              degree: 28_801,
              certificateDigest: "bad-certificate",
            },
          },
        },
      }),
    ).toThrow(/materialized action and exact certificate/);
  });

  it("binds exact reviewed source snapshots and rejects copied pass flags", () => {
    const mutated = structuredClone(SOURCES);
    const source = mutated[2];
    const input = structuredClone(source.input) as {
      name: string;
      certificate: { status: string };
    };
    input.name = `${input.name} tampered`;
    input.certificate.status = "passed";
    source.input = input;
    expect(() =>
      buildCompactActionPortfolio(mutated, {
        generatedAt: "2026-08-22T00:00:00.000Z",
      }),
    ).toThrow(/reviewed source snapshot/);
  });

  it("rejects self-resealed stage promotion without exact sidecar replay", () => {
    const artifact = buildCompactActionPortfolio(SOURCES, {
      generatedAt: "2026-08-22T00:00:00.000Z",
    });
    const tampered = structuredClone(artifact);
    tampered.targets[0].stages[2].status = "passed";
    tampered.targets[0].disposition = "exact-arrangement-survivor";
    const withoutHash = { ...tampered, artifactHash: undefined } as Record<
      string,
      unknown
    >;
    delete withoutHash.artifactHash;
    tampered.artifactHash = canonicalSha256(withoutHash);
    const replay = replayCompactActionPortfolio(tampered, SOURCES);
    expect(replay.status).toBe("failed");
    expect(replay.checks.artifactHashValid).toBe(true);
    expect(replay.checks.stageOrderValid).toBe(false);
  });

  it("archives and exactly replays failed, timed-out, and incomplete discovery outcomes", () => {
    const cases = [
      {
        rawStatus: "failed" as const,
        stageStatus: "failed",
        disposition: "stage-failed",
      },
      {
        rawStatus: "timeout" as const,
        stageStatus: "timed-out",
        disposition: "stage-timed-out",
      },
      {
        rawStatus: "exhausted" as const,
        stageStatus: "incomplete",
        disposition: "stage-incomplete",
      },
    ];
    for (const entry of cases) {
      const evidence = nonPassedCompactDiscoveryEvidence(
        "makarov-p0",
        SOURCES[0],
        nonPassedDiscoveryArtifact("makarov-p0", entry.rawStatus),
      );
      const artifact = buildCompactActionPortfolio(SOURCES, {
        generatedAt: "2026-08-22T00:00:00.000Z",
        evidence: { "makarov-p0": evidence },
      });
      const target = artifact.targets[0];
      expect(target.disposition).toBe(entry.disposition);
      expect(target.stages[2].status).toBe(entry.stageStatus);
      expect(
        target.stages.slice(3).every((stage) => stage.status === "blocked"),
      ).toBe(true);
      expect(target.evidence?.torsionFree?.replayPassed).toBe(false);
      expect(target.evidence?.torsionFree?.candidate).toBeUndefined();
      expect(
        target.evidence?.torsionFree?.discoveryOutcome
          ?.materializedTorsionFreeActionCertified,
      ).toBe(false);
      expect(replayCompactActionPortfolio(artifact, SOURCES).status).toBe(
        "passed",
      );
    }
  });

  it("rejects forged, target-swapped, or promoted non-passed discovery evidence", () => {
    const evidence = nonPassedCompactDiscoveryEvidence(
      "makarov-p0",
      SOURCES[0],
      nonPassedDiscoveryArtifact("makarov-p0", "failed"),
    );
    expect(() =>
      buildCompactActionPortfolio(SOURCES, {
        evidence: {
          "makarov-p0": {
            torsionFree: { status: "failed", note: "unbound failure" },
          },
        },
      }),
    ).toThrow(/raw source-bound outcome/);
    expect(() =>
      nonPassedCompactDiscoveryEvidence(
        "makarov-p1",
        SOURCES[1],
        nonPassedDiscoveryArtifact("makarov-p0", "failed"),
      ),
    ).toThrow(/exact source bytes/);

    const alteredBeforeArchival = nonPassedDiscoveryArtifact(
      "makarov-p0",
      "failed",
    ) as { warnings: string[] };
    alteredBeforeArchival.warnings.push("unsealed mutation");
    expect(() =>
      nonPassedCompactDiscoveryEvidence(
        "makarov-p0",
        SOURCES[0],
        alteredBeforeArchival,
      ),
    ).toThrow(/producer SHA-256 seal/);

    for (const missingField of [
      "backend",
      "backendVersion",
      "runtime",
      "command",
      "inputHash",
    ]) {
      const missingProvenance = structuredClone(
        nonPassedDiscoveryArtifact("makarov-p0", "failed"),
      ) as { provenance: Record<string, unknown> };
      delete missingProvenance.provenance[missingField];
      resealDiscoveryArtifact(missingProvenance);
      expect(() =>
        nonPassedCompactDiscoveryEvidence(
          "makarov-p0",
          SOURCES[0],
          missingProvenance,
        ),
      ).toThrow(/discovery provenance/);
    }

    const smallerRun = nonPassedDiscoveryArtifact("makarov-p0", "failed") as {
      bounds: { lightWorkers: number };
      provenance: Record<string, unknown>;
    };
    smallerRun.bounds.lightWorkers = 1;
    resealDiscoveryArtifact(smallerRun);
    expect(() =>
      nonPassedCompactDiscoveryEvidence("makarov-p0", SOURCES[0], smallerRun),
    ).toThrow(/changed configured bound lightWorkers/);
    expect(() =>
      buildCompactActionPortfolio(SOURCES, {
        evidence: {
          "makarov-p0": {
            ...evidence,
            h1Wall: {
              status: "passed",
              actionDigest: "forged",
              certificateDigest: "forged",
              fullIntegralLatticeCertified: true,
            },
          } as unknown as CompactTargetEvidence,
        },
      }),
    ).toThrow(/post-action evidence/);

    const artifact = buildCompactActionPortfolio(SOURCES, {
      generatedAt: "2026-08-22T00:00:00.000Z",
      evidence: { "makarov-p0": evidence },
    });
    const tampered = structuredClone(artifact);
    const raw = tampered.targets[0].evidence?.torsionFree?.discoveryOutcome
      ?.rawArtifact as { warnings: string[] };
    raw.warnings.push("tampered after the bounded run");
    const withoutHash = { ...tampered } as Record<string, unknown>;
    delete withoutHash.artifactHash;
    tampered.artifactHash = canonicalSha256(withoutHash);
    const replay = replayCompactActionPortfolio(tampered, SOURCES);
    expect(replay.checks.artifactHashValid).toBe(true);
    expect(replay.checks.stageOrderValid).toBe(false);
    expect(replay.status).toBe("failed");

    expect(() =>
      nonPassedCompactDiscoveryEvidence("makarov-p0", SOURCES[0], {
        ...(nonPassedDiscoveryArtifact("makarov-p0", "failed") as object),
        status: "passed",
      }),
    ).toThrow(/not a recognized non-passed outcome/);
  });

  it("rejects self-resealed H1/screen/stage tampering and unregistered later stages", () => {
    const input = universalDihedralAction();
    const evidence = buildCompactPostActionEvidence(
      input.system,
      input.accepted,
    );

    const h1Tampered = structuredClone(evidence);
    h1Tampered.h1Wall!.certificate.warnings.push("self-resealed mutation");
    h1Tampered.h1Wall!.certificate.certificateDigest =
      computeGenericActionH1CertificateDigest(h1Tampered.h1Wall!.certificate);
    h1Tampered.h1Wall!.certificateDigest =
      h1Tampered.h1Wall!.certificate.certificateDigest;
    expect(
      replayCompactPostActionEvidence(input.system, input.accepted, h1Tampered)
        .status,
    ).toBe("failed");

    expect(
      replayCompactPostActionEvidence(input.system, input.accepted, {
        h1Wall: evidence.h1Wall,
      }).status,
    ).toBe("failed");

    const screenTampered = structuredClone(evidence);
    expect(screenTampered.cheapScreen).toBeDefined();
    screenTampered.cheapScreen!.report.nonClaims.push("self-resealed mutation");
    const { reportDigest: _oldDigest, ...reportPayload } =
      screenTampered.cheapScreen!.report;
    void _oldDigest;
    screenTampered.cheapScreen!.report.reportDigest =
      canonicalSha256(reportPayload);
    screenTampered.cheapScreen!.certificateDigest =
      screenTampered.cheapScreen!.report.reportDigest;
    expect(
      replayCompactPostActionEvidence(
        input.system,
        input.accepted,
        screenTampered,
      ).status,
    ).toBe("failed");

    const stageTampered = structuredClone(evidence);
    stageTampered.generalizedCompression!.stageCertificate.nonClaims.push(
      "self-resealed mutation",
    );
    const { certificateDigest: _stageDigest, ...stagePayload } =
      stageTampered.generalizedCompression!.stageCertificate;
    void _stageDigest;
    stageTampered.generalizedCompression!.stageCertificate.certificateDigest =
      canonicalSha256(stagePayload);
    stageTampered.generalizedCompression!.certificateDigest =
      stageTampered.generalizedCompression!.stageCertificate.certificateDigest;
    stageTampered.exactArrangement!.compressionCertificateDigest =
      stageTampered.generalizedCompression!.certificateDigest;
    stageTampered.exactArrangement!.certificateDigest =
      stageTampered.generalizedCompression!.certificateDigest;
    expect(
      replayCompactPostActionEvidence(
        input.system,
        input.accepted,
        stageTampered,
      ).status,
    ).toBe("failed");

    const rebound = structuredClone(evidence);
    rebound.generalizedCompression!.stageCertificate.budgets.maxTemplates += 1;
    const { certificateDigest: _reboundDigest, ...reboundPayload } =
      rebound.generalizedCompression!.stageCertificate;
    void _reboundDigest;
    rebound.generalizedCompression!.stageCertificate.certificateDigest =
      canonicalSha256(reboundPayload);
    rebound.generalizedCompression!.certificateDigest =
      rebound.generalizedCompression!.stageCertificate.certificateDigest;
    rebound.exactArrangement!.compressionCertificateDigest =
      rebound.generalizedCompression!.certificateDigest;
    rebound.exactArrangement!.certificateDigest =
      rebound.generalizedCompression!.certificateDigest;
    expect(
      replayCompactPostActionEvidence(input.system, input.accepted, rebound),
    ).toMatchObject({
      status: "failed",
      checks: { expensiveStageBudgetsMatchPortfolio: false },
    });

    const unregistered = {
      torsionFree: { status: "passed" },
      generalizedCompression: {
        status: "passed",
        actionDigest: "forged",
        screenCertificateDigest: "forged",
        certificateDigest: "forged",
        replayPassed: true,
      },
    } as unknown as CompactTargetEvidence;
    expect(() =>
      buildCompactActionPortfolio(SOURCES, {
        evidence: { "makarov-p0": unregistered },
      }),
    ).toThrow(/without a registered exact artifact replayer/);
  });
});
