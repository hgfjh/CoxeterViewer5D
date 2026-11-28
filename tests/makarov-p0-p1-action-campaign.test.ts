import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import type { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runMakarovP0P1ActionCampaignCli } from "../src/fibering/makarovP0P1ActionCampaignRunner";

const spawnMock = vi.fn();

import p0Input from "../src/examples/compact_5_prism_makarov.json";
import p1Input from "../src/examples/compact_5_polytope_p1_double_makarov.json";
import { compactDiscoveryPortableSha256 } from "../src/fibering/compactActionPortfolio";
import {
  acceptedMakarovP0P1ActionPayloads,
  acceptMakarovIndependentActionIngest,
  buildMakarovP0P1ActionCampaign,
  computeMakarovP0P1ActionCampaignDigest,
  MAKAROV_P0_P1_DEFAULT_PRIME_CAP,
  MAKAROV_P0_P1_DEFAULT_TIER,
  MAKAROV_P0_P1_DEFAULT_TIMEOUT_SECONDS,
  MAKAROV_P0_P1_LIVE_DISCOVERY_PRIME_CAP,
  MAKAROV_P0_P1_PRE_SCREEN_EVIDENCE,
  MAKAROV_P0_P1_SOURCE_BYTES_SHA256,
  MAKAROV_P0_P1_SOURCE_PATHS,
  makarovP0P1CampaignConfiguration,
  makeMakarovP0DiscoveryRunnerFailure,
  parseMakarovIndependentActionIngest,
  promoteMakarovIndependentActionIngest,
  replayMakarovP0P1ActionCampaign,
  type MakarovP0P1ActionCampaignArtifact,
} from "../src/fibering/makarovP0P1ActionCampaign";
import {
  MAKAROV_P0_P1_CAMPAIGN_DEFAULT_CHECKPOINT_DIRECTORY,
  MAKAROV_P0_P1_CAMPAIGN_DEFAULT_DISCOVERY,
  MAKAROV_P0_P1_CAMPAIGN_DEFAULT_MAX_INPUT_BYTES,
  MAKAROV_P0_P1_CAMPAIGN_DEFAULT_OUTPUT,
  parseMakarovP0P1CampaignArguments,
} from "../src/fibering/makarovP0P1ActionCampaignCli";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

function sealedNonpassingDiscovery(
  status: "exhausted" | "timeout" = "exhausted",
): Record<string, unknown> {
  const configuration = makarovP0P1CampaignConfiguration();
  const artifact: Record<string, unknown> & {
    provenance: Record<string, unknown>;
  } = {
    schemaVersion: 1,
    artifactType: "coxeter-torsion-free-discovery",
    status,
    ok: status === "exhausted",
    sourceSystem: p0Input,
    inputHash: MAKAROV_P0_P1_SOURCE_BYTES_SHA256.p0,
    bounds: configuration.bounds,
    strategyAttempts: [
      {
        strategy: "sage-congruence-kernel",
        phase: "finite-image-search",
        status,
        candidateDegree: null,
      },
    ],
    warnings: [],
    errors: [],
    provenance: {
      backend: "automatic-torsion-free-cover",
      backendVersion: "3.4.1",
      runtime: "unit-test",
      command: "python scripts/torsion_free_discovery.py",
      inputHash: MAKAROV_P0_P1_SOURCE_BYTES_SHA256.p0,
      artifactHash: "a".repeat(64),
    },
  };
  artifact.provenance.portableArtifactHash =
    compactDiscoveryPortableSha256(artifact);
  return artifact;
}

function sealedSyntheticIndependentP1Ingest(): Record<string, unknown> {
  const degree = 28_800;
  const identity = Array.from({ length: degree }, (_unused, index) => index);
  const candidate = {
    id: "synthetic:direct-p1-route",
    name: "Synthetic direct P1 routing fixture",
    index: degree,
    generatorImages: Array.from({ length: 7 }, () => [...identity]),
    backend: "gap-direct-finite-target",
    backendVersion: "1.1.0",
    source: "h4-times-smallgroup-2-1",
  };
  const body = {
    schemaVersion: 1,
    kind: "makarov-independent-action-ingest",
    targetId: "makarov-p1",
    exampleId: "compact_5_polytope_p1_double_makarov",
    systemBinding: {
      systemId: "p1",
      sourcePath: "public/examples/compact_5_polytope_p1_double_makarov.json",
      sourceBytesSha256: MAKAROV_P0_P1_SOURCE_BYTES_SHA256.p1,
      canonicalSourceSha256:
        "7704ef26a631675e44f37969b0125f7675ad0f5ad9337046d413d0c1621256d7",
      matrixSha256:
        "667adb167fda5d05b50a81a8f18aeb68ff9d7e7c37932bbb01702760d67bc0e1",
      maximalSphericalCatalogueSha256:
        "f5c25f656f8c3f460b6aec9e62889a0ea9ea5094725d74d78f8f1fb73ea9f9b1",
    },
    candidate,
    candidateSha256: canonicalSha256(candidate),
    derivation: {
      method: "direct-finite-target-regular-action",
      finiteTargetId: "h4-times-smallgroup-2-1",
      finiteTargetOrder: degree,
      targetGeneratorTupleSha256: "a".repeat(64),
      regularActionRowsSha256: canonicalSha256(candidate.generatorImages),
      independentSystemAction: true,
      p0ToP1RestrictionApplied: false,
    },
    torsionFreeCertification: {
      status: "passed",
      criterion: "producer claim replayed independently downstream",
      maximalSphericalImageOrders: [],
      checks: {},
    },
    nonClaims: [
      "Synthetic producer claims are not accepted without downstream replay.",
    ],
  };
  return { ...body, payloadSha256: canonicalSha256(body) };
}

const COMMON_NONCLAIMS = [
  "Failure to materialize a P0 action gives no negative conclusion about P1 or virtual fibering.",
  "The pinned characteristic-3, -5, -7, and -11 screens rule out active tiers only inside their named finite images; this campaign does not combine them into a product, subdirect-product, direct-action, or noncongruence obstruction.",
  "Congruence-kernel evidence in the raw receipt is not accepted as a permutation action; the standalone kernel certificate must be replayed separately, and H^1 or Track B still requires exact action rows.",
  "No subgroup search is claimed inside a congruence image above the configured order cap 5000000; in particular, the certified P0 p=5 image of order 457002000000000 was not searched by the default campaign.",
  "No full integral H^1 lattice or wall-saturation certificate is produced.",
  "No direct wall-cocycle, generalized-compression, Track B, algebraic-fibering, or smooth-fibering claim is produced.",
  "Accepted action payloads are inputs for the independent direct-cocycle and scalable-H^1 preparers; they are not proof-job manifests.",
];

const DEFAULT_ACCEPTED_NONCLAIMS = [
  "This run does not prove that P0 has no torsion-free subgroup of index at most 28800.",
  "This run does not prove that no action exists outside the attempted strategy ladder, beyond congruence-prime cap 11, or with a larger timeout than the embedded producer bound of 1800 seconds.",
  "An outer exhausted label is not treated as a complete negative result without target-scoped nested proofs that every relevant iterator and finite-image ledger completed; capped and prefix searches remain incomplete.",
  ...COMMON_NONCLAIMS,
];

const DEFAULT_EXECUTED_NONCLAIMS = [
  "This run does not prove that P0 has no torsion-free subgroup of index at most 28800.",
  "This run does not prove that no action exists outside the attempted strategy ladder, beyond congruence-prime cap 11, or after the configured 1800-second campaign wall-clock bound.",
  "An outer exhausted label is not treated as a complete negative result without target-scoped nested proofs that every relevant iterator and finite-image ledger completed; capped and prefix searches remain incomplete.",
  ...COMMON_NONCLAIMS,
];

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("Makarov P0/P1 action-acquisition campaign", () => {
  it("pins the reviewed pre-screen artifacts by exact bytes and internal seal", async () => {
    for (const binding of MAKAROV_P0_P1_PRE_SCREEN_EVIDENCE) {
      const bytes = await readFile(binding.path);
      const artifact = JSON.parse(bytes.toString("utf8")) as Record<
        string,
        unknown
      >;

      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        binding.bytesSha256,
      );
      expect(artifact).toMatchObject({
        artifactType: binding.artifactType,
        status: "passed",
        certificateSha256: binding.certificateSha256,
      });
    }
  });

  it("builds the reviewed P0-only default discovery configuration", () => {
    const configuration = makarovP0P1CampaignConfiguration();

    expect(configuration).toMatchObject({
      selectedP0DegreeTier: MAKAROV_P0_P1_DEFAULT_TIER,
      maxCongruencePrime: MAKAROV_P0_P1_DEFAULT_PRIME_CAP,
      liveDiscoveryPrimeCap: MAKAROV_P0_P1_LIVE_DISCOVERY_PRIME_CAP,
      preScreenedRationalPrimes: [3, 5, 7, 11],
      preScreenEvidence: MAKAROV_P0_P1_PRE_SCREEN_EVIDENCE,
      timeoutSeconds: MAKAROV_P0_P1_DEFAULT_TIMEOUT_SECONDS,
      allowedP0DegreeTiers: [28_800, 57_600, 86_400, 115_200],
      allowedP1DegreeTiers: [28_800, 57_600, 86_400, 115_200],
      bounds: {
        maxIndex: 28_800,
        maxCandidates: 128,
        maxModuleCandidates: 512,
        maxCompositeModules: 6,
        maxCompositeCombinations: 100_000,
        maxCongruencePrime: 2,
        maxCongruenceImageOrder: 5_000_000,
        maxLowIndexFallback: 512,
        maxMemoryBytes: 12 * 1024 * 1024 * 1024,
        lightWorkers: 4,
        heavyWorkers: 1,
        maxWitnesses: 8_192,
        maxSphericalOrder: 100_000,
        maxSubsets: 65_536,
        timeoutSeconds: 1_800,
      },
    });
    expect(configuration.discoveryCommand.slice(0, 4)).toEqual([
      "python",
      "scripts/torsion_free_discovery.py",
      "--input",
      MAKAROV_P0_P1_SOURCE_PATHS.p0,
    ]);
    expect(configuration.discoveryCommand).not.toContain(
      MAKAROV_P0_P1_SOURCE_PATHS.p1,
    );
    expect(
      configuration.discoveryCommand.filter((entry) => entry === "--input"),
    ).toHaveLength(1);
    expect(configuration.discoveryCommandDigest).toBe(
      canonicalSha256(configuration.discoveryCommand),
    );
    expect(
      configuration.discoveryCommand[
        configuration.discoveryCommand.indexOf("--max-congruence-prime") + 1
      ],
    ).toBe("2");
  });

  it("parses bounded campaign-runner arguments", () => {
    expect(parseMakarovP0P1CampaignArguments([])).toEqual({
      output: MAKAROV_P0_P1_CAMPAIGN_DEFAULT_OUTPUT,
      discovery: MAKAROV_P0_P1_CAMPAIGN_DEFAULT_DISCOVERY,
      checkpointDirectory: MAKAROV_P0_P1_CAMPAIGN_DEFAULT_CHECKPOINT_DIRECTORY,
      execute: false,
      verifyOnly: false,
      reusePassed: true,
      selectedP0DegreeTier: MAKAROV_P0_P1_DEFAULT_TIER,
      maxCongruencePrime: MAKAROV_P0_P1_DEFAULT_PRIME_CAP,
      timeoutSeconds: MAKAROV_P0_P1_DEFAULT_TIMEOUT_SECONDS,
      maxInputBytes: MAKAROV_P0_P1_CAMPAIGN_DEFAULT_MAX_INPUT_BYTES,
    });
    expect(
      parseMakarovP0P1CampaignArguments([
        "--",
        "--output",
        "campaign.json",
        "--discovery",
        "p0.json",
        "--checkpoint-directory",
        "checkpoints",
        "--execute",
        "true",
        "--reuse-passed",
        "false",
        "--tier",
        "57600",
        "--max-congruence-prime",
        "11",
        "--timeout-seconds",
        "900",
        "--max-input-bytes",
        "4096",
      ]),
    ).toEqual({
      output: "campaign.json",
      discovery: "p0.json",
      checkpointDirectory: "checkpoints",
      execute: true,
      verifyOnly: false,
      reusePassed: false,
      selectedP0DegreeTier: 57_600,
      maxCongruencePrime: 11,
      timeoutSeconds: 900,
      maxInputBytes: 4_096,
    });
    expect(() =>
      parseMakarovP0P1CampaignArguments([
        "--execute",
        "true",
        "--verify-only",
        "true",
      ]),
    ).toThrow(/cannot both be true/iu);
    expect(() =>
      parseMakarovP0P1CampaignArguments(["--tier", "28801"]),
    ).toThrow(/not an active capacity-approved tier/iu);
    expect(() =>
      parseMakarovP0P1CampaignArguments(["--unknown", "value"]),
    ).toThrow(/Unknown argument/iu);
    expect(
      parseMakarovP0P1CampaignArguments([
        "--execute",
        "false",
        "--",
        "--discovery",
        "accepted.json",
      ]).discovery,
    ).toBe("accepted.json");
  });

  it("accepts and verifies a bounded receipt atomically without launching discovery", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "coxeter-makarov-p0-p1-"),
    );
    const discoveryPath = join(temporaryDirectory, "p0.discovery.json");
    const outputPath = join(temporaryDirectory, "campaign.json");
    const checkpointDirectory = join(temporaryDirectory, "checkpoints");
    try {
      await writeFile(
        discoveryPath,
        `${JSON.stringify(sealedNonpassingDiscovery(), null, 2)}\n`,
        "utf8",
      );
      const originalDiscovery = await readFile(discoveryPath, "utf8");
      spawnMock.mockClear();

      expect(
        await runMakarovP0P1ActionCampaignCli([
          "--execute",
          "false",
          "--discovery",
          discoveryPath,
          "--output",
          outputPath,
          "--checkpoint-directory",
          checkpointDirectory,
        ]),
      ).toBe(0);
      expect(spawnMock).not.toHaveBeenCalled();

      const stored = JSON.parse(
        await readFile(outputPath, "utf8"),
      ) as MakarovP0P1ActionCampaignArtifact;
      expect(stored).toMatchObject({
        status: "incomplete",
        outcome: "bounded-search-incomplete",
        execution: {
          mode: "accepted-existing-artifact",
          processExitCode: null,
          campaignWallClockTimeoutTriggered: false,
        },
      });
      expect(replayMakarovP0P1ActionCampaign(stored).status).toBe("passed");
      expect(await readFile(discoveryPath, "utf8")).toBe(originalDiscovery);
      expect(await pathExists(checkpointDirectory)).toBe(false);

      const acceptedOutput = await readFile(outputPath, "utf8");
      expect(
        await runMakarovP0P1ActionCampaignCli([
          "--verify-only",
          "true",
          "--output",
          outputPath,
          "--checkpoint-directory",
          checkpointDirectory,
        ]),
      ).toBe(0);
      expect(spawnMock).not.toHaveBeenCalled();
      expect(await readFile(outputPath, "utf8")).toBe(acceptedOutput);
      expect(await pathExists(checkpointDirectory)).toBe(false);
      expect((await readdir(temporaryDirectory)).sort()).toEqual([
        "campaign.json",
        "p0.discovery.json",
      ]);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("returns a replayable timeout receipt when the bounded child never closes", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "coxeter-makarov-timeout-"),
    );
    const discoveryPath = join(temporaryDirectory, "p0.discovery.json");
    const outputPath = join(temporaryDirectory, "campaign.json");
    const checkpointDirectory = join(temporaryDirectory, "checkpoints");
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      kill: vi.fn(() => true),
      unref: vi.fn(),
    });
    spawnMock.mockReset();
    spawnMock.mockReturnValue(child as unknown as ChildProcess);
    try {
      expect(
        await runMakarovP0P1ActionCampaignCli(
          [
            "--execute",
            "true",
            "--reuse-passed",
            "false",
            "--timeout-seconds",
            "1",
            "--discovery",
            discoveryPath,
            "--output",
            outputPath,
            "--checkpoint-directory",
            checkpointDirectory,
          ],
          {
            millisecondsPerSecond: 1,
            hardKillGraceMs: 2,
            terminationGraceMs: 3,
            cleanupGraceMs: 2,
          },
          spawnMock,
        ),
      ).toBe(0);
      expect(spawnMock).toHaveBeenCalledOnce();
      expect(spawnMock.mock.calls[0]?.[2]).toMatchObject({
        env: {
          LOCALAPPDATA: join(process.cwd(), ".cover-search", ".runtime"),
          COXETER_DISCOVERY_CACHE: join(
            process.cwd(),
            ".cover-search",
            ".runtime",
            "packed-composite",
          ),
        },
      });

      const stored = JSON.parse(
        await readFile(outputPath, "utf8"),
      ) as MakarovP0P1ActionCampaignArtifact;
      expect(stored).toMatchObject({
        status: "incomplete",
        outcome: "bounded-search-incomplete",
        execution: {
          mode: "executed-bounded-discovery",
          processExitCode: null,
          campaignWallClockTimeoutTriggered: true,
          hardTerminationRequested: true,
          terminationDeadlineExceeded: true,
        },
        discovery: {
          rawStatus: "timeout",
          rawArtifact: {
            artifactType: "makarov-p0-bounded-discovery-runner-failure",
            status: "timeout",
          },
        },
      });
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
      expect(child.unref).toHaveBeenCalledOnce();
      expect(replayMakarovP0P1ActionCampaign(stored).status).toBe("passed");
      expect(
        (await readdir(temporaryDirectory)).some((entry) =>
          entry.startsWith("p0.discovery.json.cancel-"),
        ),
      ).toBe(true);
    } finally {
      spawnMock.mockReset();
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("keeps an outer exhausted producer receipt incomplete without nested proofs", () => {
    const rawDiscovery = sealedNonpassingDiscovery();
    const artifact = buildMakarovP0P1ActionCampaign({ rawDiscovery });
    const expectedReport = {
      attemptIndex: 0,
      strategy: "sage-congruence-kernel",
      phase: "finite-image-search",
      status: "exhausted",
      candidateDegree: null,
    };

    expect(artifact).toMatchObject({
      schemaVersion: 1,
      kind: "makarov-p0-p1-action-acquisition-certificate",
      status: "incomplete",
      outcome: "bounded-search-incomplete",
      acceptedActionPayloads: [],
      checks: {
        selectedP0TierAllowed: true,
        preScreenEvidencePinned: true,
        liveDiscoveryPrimeCapApplied: true,
        discoverySourceBound: true,
        discoveryBoundsExact: true,
        rawArtifactIntegrityVerified: true,
        materializedP0DegreeAllowed: null,
        p0TorsionFreeReplayPassed: null,
        everyRestrictedP1DegreeAllowed: null,
        everyRestrictedP1OrbitTorsionFreeReplayPassed: null,
      },
      claims: [
        "The embedded exhausted receipt is bound to the configured finite P0 search run.",
        "Pinned image-scoped screens for rational primes 3, 5, 7, 11 were bound to the run and omitted from live discovery.",
      ],
      nonClaims: DEFAULT_ACCEPTED_NONCLAIMS,
    });
    expect(artifact.discovery.producerPortableArtifactHash).toBe(
      (rawDiscovery.provenance as Record<string, unknown>).portableArtifactHash,
    );
    expect(artifact.discovery.producerCertificateDigest).toBeNull();
    expect(artifact.discovery.candidateReports).toEqual([
      {
        ...expectedReport,
        reportDigest: canonicalSha256(expectedReport),
      },
    ]);
    expect(acceptedMakarovP0P1ActionPayloads(artifact)).toEqual([]);
    expect(replayMakarovP0P1ActionCampaign(artifact)).toMatchObject({
      status: "passed",
      checks: {
        envelopeRecognized: true,
        storedArtifactDigestValid: true,
        exactRootedRebuildMatches: true,
      },
    });

    const producerTampered = structuredClone(rawDiscovery);
    (producerTampered.warnings as string[]).push("mutation after sealing");
    expect(() =>
      buildMakarovP0P1ActionCampaign({ rawDiscovery: producerTampered }),
    ).toThrow(/portable producer seal is invalid/iu);
  });

  it("keeps certified kernel-only evidence separate from action payloads", () => {
    const rawDiscovery = sealedNonpassingDiscovery();
    // This is the normalized outer-discovery record produced by
    // collect_kernel_covers for the certified P0 prime-31 direct probe.
    const kernelWithoutHash = {
      status: "passed",
      kind: "normal-congruence-kernel",
      normal: true,
      torsionFree: true,
      certificateLevel: "finite-index-kernel",
      indexStatus: "unknown",
      finiteImage: {
        candidateId: "p31-ideal0-q31",
        characteristic: 31,
        residueFieldOrder: "31",
        finiteTargetCertified: true,
        orderStatus: "unknown",
        representationDimension: 7,
      },
      criterion: "tits-maximal-spherical-injective-reduction",
      completeSphericalRestrictionChecks: true,
      sphericalImageChecks: [
        {
          subset: [0, 1, 2, 3, 5],
          expectedOrder: "28800",
          imageOrder: "28800",
          passed: true,
        },
        {
          subset: [0, 1, 2, 3, 6],
          expectedOrder: "28800",
          imageOrder: "28800",
          passed: true,
        },
        {
          subset: [0, 1, 2, 4, 5],
          expectedOrder: "720",
          imageOrder: "720",
          passed: true,
        },
        {
          subset: [0, 1, 2, 4, 6],
          expectedOrder: "480",
          imageOrder: "480",
          passed: true,
        },
        {
          subset: [0, 1, 3, 4, 5],
          expectedOrder: "240",
          imageOrder: "240",
          passed: true,
        },
        {
          subset: [0, 1, 3, 4, 6],
          expectedOrder: "120",
          imageOrder: "120",
          passed: true,
        },
        {
          subset: [0, 2, 3, 4, 5],
          expectedOrder: "240",
          imageOrder: "240",
          passed: true,
        },
        {
          subset: [0, 2, 3, 4, 6],
          expectedOrder: "96",
          imageOrder: "96",
          passed: true,
        },
        {
          subset: [1, 2, 3, 4, 5],
          expectedOrder: "720",
          imageOrder: "720",
          passed: true,
        },
        {
          subset: [1, 2, 3, 4, 6],
          expectedOrder: "240",
          imageOrder: "240",
          passed: true,
        },
      ],
      indexBounds: {
        divisibilityLowerBound: "28800",
        finiteUpperBound:
          "11534940001893013746775002218383211010987451586111742927507721420800000000",
        upperBoundSource: "ambient-general-linear-group",
      },
      materialization: {
        status: "not-materialized",
        maximumMaterializedDegree: 28_800,
        reason:
          "The kernel is certified, but its exact index is not yet known, so its regular action cannot be materialized.",
      },
      claims: ["finite-index", "normal", "torsion-free"],
      nonClaims: [
        "exact torsion-free kernel index",
        "smallest torsion-free index",
        "materialized quotient complex",
        "virtual algebraic fibering",
      ],
      sourceCertificateSha256:
        "d57095e61e9333934082c8bc4bdebba9f8a6e6a8e0b487fc4df3d8761fb59a7b",
      sourceCriterion: "tits-maximal-spherical-injective-kernel",
    };
    expect(canonicalSha256(kernelWithoutHash)).toBe(
      "162165c4093d95d15f1203f4a29192b1a46d2b75ef6a8d59f82c46b614b38e54",
    );
    rawDiscovery.kernelCover = {
      ...kernelWithoutHash,
      certificateSha256: canonicalSha256(kernelWithoutHash),
    };
    rawDiscovery.coverOutcome = {
      torsionFreeCoverCertified: true,
      manageableCoverMaterialized: false,
      certificateLevel: "finite-index-kernel",
      exactIndexKnown: false,
      status: "finite-index-kernel-certified-exact-index-unknown",
    };
    const provenance = rawDiscovery.provenance as Record<string, unknown>;
    delete provenance.portableArtifactHash;
    provenance.portableArtifactHash =
      compactDiscoveryPortableSha256(rawDiscovery);

    const artifact = buildMakarovP0P1ActionCampaign({ rawDiscovery });
    expect(artifact.acceptedActionPayloads).toEqual([]);
    expect(artifact.discovery.rawArtifact).toMatchObject({
      kernelCover: {
        certificateSha256:
          "162165c4093d95d15f1203f4a29192b1a46d2b75ef6a8d59f82c46b614b38e54",
      },
    });
    expect(artifact.claims.join(" ")).not.toMatch(/torsion-free kernel/iu);
    expect(artifact.nonClaims.join(" ")).toMatch(
      /raw receipt is not accepted as a permutation action.*standalone kernel certificate/iu,
    );
    expect(replayMakarovP0P1ActionCampaign(artifact).status).toBe("passed");
  });

  it("routes a source-bound direct P1 ingest independently through the ordinary action pipeline", async () => {
    const ingest = sealedSyntheticIndependentP1Ingest();
    const parsed = parseMakarovIndependentActionIngest(ingest);
    expect(parsed).toMatchObject({
      targetId: "makarov-p1",
      system: { name: p1Input.name },
      candidate: {
        id: "synthetic:direct-p1-route",
        index: 28_800,
      },
      finiteTargetId: "h4-times-smallgroup-2-1",
      finiteTargetOrder: 28_800,
    });
    expect(() => acceptMakarovIndependentActionIngest(ingest)).toThrow(
      /failed independent exact torsion-free replay/iu,
    );

    const promoted = await promoteMakarovIndependentActionIngest(ingest, {
      budgets: {
        maxActionDegree: 28_800,
        maxGeneratorEntries: 250_000,
        maxPackedActionBytes: 4 * 1024 * 1024,
      },
    });
    expect(promoted).toMatchObject({
      status: "failed",
      source: {
        systemName: p1Input.name,
        candidateId: "synthetic:direct-p1-route",
        actionDegree: 28_800,
        actionInputKind: "raw-candidate",
        solverId: "gap-direct-finite-target",
      },
      hashes: {
        sourceSystemArtifactSha256: MAKAROV_P0_P1_SOURCE_BYTES_SHA256.p1,
      },
      torsionFreeCertificate: { status: "failed" },
    });
    expect(promoted.errors.join(" ")).toMatch(/orbit.*1 of 28800|spherical/iu);

    const rebound = structuredClone(ingest);
    rebound.targetId = "makarov-p0";
    delete rebound.payloadSha256;
    rebound.payloadSha256 = canonicalSha256(rebound);
    expect(() => parseMakarovIndependentActionIngest(rebound)).toThrow(
      /wrong bundled example|source binding is stale/iu,
    );
  });

  it("records a locally sealed runner failure without treating it as producer output", () => {
    const configuration = makarovP0P1CampaignConfiguration();
    const rawDiscovery = makeMakarovP0DiscoveryRunnerFailure(
      configuration,
      "The bounded child process exited before writing a producer artifact.",
    );
    const artifact = buildMakarovP0P1ActionCampaign({
      rawDiscovery,
      execution: {
        mode: "executed-bounded-discovery",
        discoveryArtifactPath: ".cover-search/makarov-p0/discovery.json",
        checkpointDirectory: ".cover-search/makarov-p0/checkpoints",
        processExitCode: 1,
        campaignWallClockTimeoutTriggered: false,
        hardTerminationRequested: false,
        terminationDeadlineExceeded: false,
      },
    });

    expect(artifact).toMatchObject({
      status: "failed",
      outcome: "bounded-search-failed",
      execution: {
        mode: "executed-bounded-discovery",
        processExitCode: 1,
      },
      discovery: {
        rawStatus: "failed",
        rawArtifact: rawDiscovery,
        producerPortableArtifactHash: null,
        producerCertificateDigest: null,
      },
      acceptedActionPayloads: [],
      nonClaims: DEFAULT_EXECUTED_NONCLAIMS,
    });
    expect(replayMakarovP0P1ActionCampaign(artifact).status).toBe("passed");
    expect(() =>
      makeMakarovP0DiscoveryRunnerFailure(configuration, "  "),
    ).toThrow(/reason is required/iu);

    const stale = structuredClone(rawDiscovery);
    stale.sourceBytesSha256 = "0".repeat(64);
    expect(() =>
      buildMakarovP0P1ActionCampaign({ rawDiscovery: stale }),
    ).toThrow(/failure receipt is invalid/iu);
  });

  it("detects both ordinary tampering and self-resealed scientific claims", () => {
    const artifact = buildMakarovP0P1ActionCampaign({
      rawDiscovery: sealedNonpassingDiscovery("timeout"),
    });
    expect(replayMakarovP0P1ActionCampaign(artifact).status).toBe("passed");

    const staleDigest = structuredClone(artifact);
    staleDigest.outcome = "bounded-search-failed";
    expect(replayMakarovP0P1ActionCampaign(staleDigest)).toMatchObject({
      status: "failed",
      checks: {
        envelopeRecognized: true,
        storedArtifactDigestValid: false,
        exactRootedRebuildMatches: false,
      },
    });

    const selfResealed = structuredClone(artifact);
    selfResealed.claims = ["A forged stronger conclusion."];
    selfResealed.artifactDigest =
      computeMakarovP0P1ActionCampaignDigest(selfResealed);
    expect(replayMakarovP0P1ActionCampaign(selfResealed)).toMatchObject({
      status: "failed",
      checks: {
        envelopeRecognized: true,
        storedArtifactDigestValid: true,
        exactRootedRebuildMatches: false,
      },
    });
    expect(() =>
      acceptedMakarovP0P1ActionPayloads(
        selfResealed as MakarovP0P1ActionCampaignArtifact,
      ),
    ).toThrow(/Campaign replay failed/iu);
  });

  it("rejects off-tier and over-budget campaign configurations", () => {
    expect(() =>
      makarovP0P1CampaignConfiguration({ selectedP0DegreeTier: 28_801 }),
    ).toThrow(/not an active capacity-approved tier/iu);
    expect(() =>
      makarovP0P1CampaignConfiguration({ maxCongruencePrime: 12 }),
    ).toThrow(/reviewed range 2\.\.11/iu);
    expect(() =>
      makarovP0P1CampaignConfiguration({ timeoutSeconds: 1_801 }),
    ).toThrow(/bounded campaign cap 1800/iu);
    expect(() =>
      makarovP0P1CampaignConfiguration({ maxCongruencePrime: 0 }),
    ).toThrow(/positive safe integer/iu);
    expect(() =>
      makarovP0P1CampaignConfiguration({ maxCongruencePrime: 1 }),
    ).toThrow(/reviewed range 2\.\.11/iu);

    const expanded = makarovP0P1CampaignConfiguration({
      selectedP0DegreeTier: 57_600,
      maxCongruencePrime: 11,
      timeoutSeconds: 900,
    });
    expect(expanded.bounds).toMatchObject({
      maxIndex: 57_600,
      maxCongruencePrime: 2,
      timeoutSeconds: 900,
    });
    expect(() =>
      buildMakarovP0P1ActionCampaign({
        rawDiscovery: sealedNonpassingDiscovery(),
        selectedP0DegreeTier: 57_600,
      }),
    ).toThrow(/changed a campaign bound/iu);
  });
});
