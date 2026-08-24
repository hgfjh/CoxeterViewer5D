import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  computePackedMaterializedActionSha256,
  promoteMaterializedActionToFullDavisFibering,
  verifyMaterializedActionPromotionArtifact,
  type MaterializedActionImplementationManifest,
  type MaterializedActionPromotionArtifact,
} from "../src/fibering/materializedActionPipeline";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const PRODUCT_SYSTEM: CoxeterSystemInput = {
  schemaVersion: 1,
  name: "D_infinity x A1 materialized-action fixture",
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
};

const ROWS = [
  [1, 0, 3, 2],
  [1, 0, 3, 2],
  [2, 3, 0, 1],
];

async function materializedArtifact(): Promise<Record<string, unknown>> {
  const actionSha256 = await computePackedMaterializedActionSha256(ROWS, 4);
  return {
    schemaVersion: 1,
    solver: {
      id: "packed-composite-permutation-module-solver",
      version: "1.0.0",
    },
    problemSha256: canonicalSha256({ fixture: "product-action" }),
    candidate: {
      id: "composite:product-action",
      moduleIndices: [0, 1],
      moduleIds: ["factor-a", "factor-b"],
      representativeCode: "0",
      representativeTuple: [0, 0],
      orbitIndex: 0,
      degree: 4,
      cartesianDegree: "4",
      decompositionKind: "double-coset-diagonal-orbit",
      actionMaterialized: true,
      actionSha256,
      witnessChecks: [],
    },
    generatorActions: ROWS.map((row) => [...row]),
    orbitPointCodes: [0, 1, 2, 3],
  };
}

function testImplementationManifest(): MaterializedActionImplementationManifest {
  const paths = [
    "package.json",
    "pnpm-lock.yaml",
    "scripts/run_materialized_fibering.ts",
    "src/compression/construction.ts",
    "src/davis/fullQuotient.ts",
    "src/fibering/fullDavisCertificate.ts",
    "src/fibering/fullDavisMorse.ts",
    "src/fibering/fullDavisSearch.ts",
    "src/fibering/lawfulNpcCertificate.ts",
    "src/fibering/lawfulSearch.ts",
    "src/fibering/lawfulTrack.ts",
    "src/fibering/materializedActionPipeline.ts",
    "src/fibering/pullingTriangulation.ts",
    "src/fibering/schreierHomomorphism.ts",
    "src/fibering/schreierPresentation.ts",
    "src/fibering/wallHomomorphism.ts",
    "src/topology/collapsibility.ts",
    "src/torsionFree/certification.ts",
    "src/torsionFree/quotient.ts",
    "src/utils/canonicalSha256.ts",
    "src/walls/coorientation.ts",
    "src/walls/wallSystem.ts",
  ];
  const files = paths.map((path) => ({
    path,
    sha256: canonicalSha256({ testImplementationPath: path }),
  }));
  const payload = {
    schemaVersion: 1 as const,
    kind: "materialized-action-implementation-manifest" as const,
    hashAlgorithm: "sha256" as const,
    files,
    sourceTreeMerkleSha256: canonicalSha256(files),
    toolchain: {
      node: process.version,
      packageManager: "pnpm@test",
      typescript: "test",
      vite: "test",
      viteNode: "test",
    },
  };
  return { ...payload, manifestSha256: canonicalSha256(payload) };
}

const implementationManifest = testImplementationManifest();

function passingOptions() {
  return {
    implementationManifest,
    coorientationSearch: {
      exactWallLimit: 8,
      maxCandidates: 16,
      timeBudgetMs: 10_000,
      collapsibilityOptions: {
        maxStates: 20_000,
        maxTransitions: 100_000,
        maxMilliseconds: 2_000,
      },
    },
  };
}

function rehashPromotion(artifact: MaterializedActionPromotionArtifact): void {
  const { artifactSha256: _discarded, ...hashes } = artifact.hashes;
  void _discarded;
  artifact.hashes = {
    ...hashes,
    artifactSha256: canonicalSha256({ ...artifact, hashes }),
  };
}

function alterManifest(
  manifest: MaterializedActionImplementationManifest,
): MaterializedActionImplementationManifest {
  const changed = structuredClone(manifest);
  changed.files[0].sha256 = "f".repeat(64);
  changed.sourceTreeMerkleSha256 = canonicalSha256(changed.files);
  const { manifestSha256: _discarded, ...payload } = changed;
  void _discarded;
  changed.manifestSha256 = canonicalSha256(payload);
  return changed;
}

describe("materialized action downstream promotion", () => {
  it("replays a complete action before constructing and certifying the quotient", async () => {
    const artifact = await materializedArtifact();
    const result = await promoteMaterializedActionToFullDavisFibering(
      PRODUCT_SYSTEM,
      artifact,
      passingOptions(),
    );

    expect(result.status, JSON.stringify(result.errors)).toBe("passed");
    expect(result.stages.map(({ id, status }) => [id, status])).toEqual([
      ["materialized-action", "passed"],
      ["spherical-plan", "passed"],
      ["spherical-freeness", "passed"],
      ["quotient-2-skeleton", "passed"],
      ["lawful-subcomplex", "passed"],
      ["full-davis-fallback", "not-run"],
    ]);
    expect(result.selectedTrack).toBe("lawful-subcomplex");
    expect(result.torsionFreeCertificate?.status).toBe("passed");
    expect(
      result.lawfulCertificate?.lawful.conclusion
        .virtualAlgebraicFibrationCertified,
    ).toBe(true);
    expect(result.hashes.materializedActionSha256).toBe(
      (artifact.candidate as Record<string, unknown>).actionSha256,
    );
    expect(result.hashes.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.lawfulCertificateReplay).toMatchObject({
      valid: true,
      mandatoryChecksPassed: true,
    });
    expect(
      verifyMaterializedActionPromotionArtifact(result, implementationManifest),
    ).toMatchObject({ valid: true, implementationManifestMatches: true });

    const replay = await promoteMaterializedActionToFullDavisFibering(
      PRODUCT_SYSTEM,
      artifact,
      passingOptions(),
    );
    expect(replay).toEqual(result);
  });

  it("rejects a self-attested nested replay and a changed implementation tree", async () => {
    const result = await promoteMaterializedActionToFullDavisFibering(
      PRODUCT_SYSTEM,
      await materializedArtifact(),
      passingOptions(),
    );
    const selfAttested = structuredClone(result);
    selfAttested.lawfulCertificateReplay!.reconstructedHashes["cover"] =
      "0".repeat(64);
    const { replayHash: _discarded, ...replayPayload } =
      selfAttested.lawfulCertificateReplay!;
    void _discarded;
    selfAttested.lawfulCertificateReplay!.replayHash =
      canonicalSha256(replayPayload);
    selfAttested.hashes.lawfulCertificateReplaySha256 =
      selfAttested.lawfulCertificateReplay!.replayHash;
    rehashPromotion(selfAttested);

    expect(
      verifyMaterializedActionPromotionArtifact(
        selfAttested,
        implementationManifest,
      ).errors.join(" "),
    ).toContain("self-attested");
    expect(
      verifyMaterializedActionPromotionArtifact(
        result,
        alterManifest(implementationManifest),
      ),
    ).toMatchObject({ valid: false, implementationManifestMatches: false });
  });

  it("accepts a raw user coset action and independently certifies it", async () => {
    const result = await promoteMaterializedActionToFullDavisFibering(
      PRODUCT_SYSTEM,
      {
        id: "user:product-action",
        index: 4,
        generatorImages: ROWS.map((row) => [...row]),
        source: "user-supplied test action",
      },
      passingOptions(),
    );

    expect(result.status, JSON.stringify(result.errors)).toBe("passed");
    expect(result.source).toMatchObject({
      candidateId: "user:product-action",
      actionDegree: 4,
      actionInputKind: "raw-candidate",
      solverId: "user-supplied-permutation-action",
    });
    expect(result.torsionFreeCertificate?.status).toBe("passed");
    expect(result.hashes.materializedActionSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.nonClaims.join(" ")).toContain("smooth fibration");
    expect(
      verifyMaterializedActionPromotionArtifact(result, implementationManifest),
    ).toMatchObject({ valid: true, implementationManifestMatches: true });
  });

  it("supports verifier-only replay of a serialized promotion", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "coxeter-promotion-replay-"),
    );
    const systemPath = join(directory, "system.json");
    const actionPath = join(directory, "action.json");
    const artifactPath = join(directory, "promotion.json");
    const reportPath = join(directory, "replay.json");
    await Promise.all([
      writeFile(systemPath, `${JSON.stringify(PRODUCT_SYSTEM)}\n`, "utf8"),
      writeFile(
        actionPath,
        `${JSON.stringify(await materializedArtifact())}\n`,
        "utf8",
      ),
    ]);
    const tsxCli = join(
      process.cwd(),
      "node_modules",
      "tsx",
      "dist",
      "cli.mjs",
    );
    const promotion = spawnSync(
      process.execPath,
      [
        tsxCli,
        "scripts/run_materialized_fibering.ts",
        "--system",
        systemPath,
        "--action",
        actionPath,
        "--output",
        artifactPath,
        "--exact-wall-limit",
        "8",
        "--max-candidates",
        "16",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    expect(promotion.status, promotion.stderr || promotion.stdout).toBe(0);
    const verification = spawnSync(
      process.execPath,
      [
        tsxCli,
        "scripts/run_materialized_fibering.ts",
        "--verify-artifact",
        artifactPath,
        "--output",
        reportPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    expect(
      verification.status,
      verification.stderr || verification.stdout,
    ).toBe(0);
    expect(JSON.parse(await readFile(reportPath, "utf8"))).toMatchObject({
      valid: true,
      implementationManifestMatches: true,
    });
  }, 20_000);

  it("resolves a bundled example id for a raw action CLI run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "coxeter-example-action-"));
    const actionPath = join(directory, "action.json");
    const artifactPath = join(directory, "promotion.json");
    const point = (rotation: number, reflected: number): number =>
      2 * ((rotation + 5) % 5) + reflected;
    const s0 = Array.from({ length: 10 }, (_unused, index) => {
      const rotation = Math.floor(index / 2);
      return point(rotation, 1 - (index % 2));
    });
    const s1 = Array.from({ length: 10 }, (_unused, index) => {
      const rotation = Math.floor(index / 2);
      const reflected = index % 2;
      return reflected === 0 ? point(rotation - 1, 1) : point(rotation + 1, 0);
    });
    await writeFile(
      actionPath,
      `${JSON.stringify({
        id: "user:i2-5-regular",
        index: 10,
        generatorImages: [s0, s1],
      })}\n`,
      "utf8",
    );
    const tsxCli = join(
      process.cwd(),
      "node_modules",
      "tsx",
      "dist",
      "cli.mjs",
    );
    const run = spawnSync(
      process.execPath,
      [
        tsxCli,
        "scripts/run_materialized_fibering.ts",
        "--example",
        "I2_5",
        "--action",
        actionPath,
        "--output",
        artifactPath,
        "--exact-wall-limit",
        "8",
        "--max-candidates",
        "16",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    expect([0, 1, 2], run.stderr || run.stdout).toContain(run.status);
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    expect(artifact.source).toMatchObject({
      candidateId: "user:i2-5-regular",
      actionDegree: 10,
      actionInputKind: "raw-candidate",
    });
    expect(artifact.torsionFreeCertificate.status).toBe("passed");
  });

  it("rejects a tampered complete permutation row before any quotient claim", async () => {
    const artifact = await materializedArtifact();
    (artifact.generatorActions as number[][])[0] = [2, 3, 0, 1];
    const result = await promoteMaterializedActionToFullDavisFibering(
      PRODUCT_SYSTEM,
      artifact,
      passingOptions(),
    );

    expect(result.status).toBe("failed");
    expect(result.stages[0].status).toBe("failed");
    expect(result.stages[3].status).toBe("not-run");
    expect(result.quotientSummary).toBeUndefined();
    expect(result.errors.join(" ")).toContain("actionSha256");
    expect(result.claims.join(" ")).not.toContain("torsion-free");
  });

  it("runs the lawful track before applying the full-Davis cell budget", async () => {
    const result = await promoteMaterializedActionToFullDavisFibering(
      PRODUCT_SYSTEM,
      await materializedArtifact(),
      {
        ...passingOptions(),
        budgets: { maxFullDavisCells: 1 },
      },
    );

    expect(result.metrics.estimatedFullDavisCellCount).toBeGreaterThan(1);
    expect(result.status).toBe("passed");
    expect(result.selectedTrack).toBe("lawful-subcomplex");
    expect(
      result.stages.find(({ id }) => id === "lawful-subcomplex"),
    ).toMatchObject({ status: "passed" });
    expect(
      result.stages.find(({ id }) => id === "full-davis-fallback"),
    ).toMatchObject({ status: "not-run" });
  });

  it("falls back to the full Davis quotient when higher lawful evidence is absent", async () => {
    const result = await promoteMaterializedActionToFullDavisFibering(
      PRODUCT_SYSTEM,
      await materializedArtifact(),
      {
        ...passingOptions(),
        lawfulSearch: {
          exactWallLimit: 8,
          maxCandidates: 16,
          deterministicCandidateBudgetOnly: true,
          certificationComplex: "coface-closed-full",
        },
      },
    );

    expect(result.status, JSON.stringify(result.errors)).toBe("passed");
    expect(result.selectedTrack).toBe("full-davis");
    expect(
      result.stages.find(({ id }) => id === "lawful-subcomplex"),
    ).toMatchObject({ status: "incomplete" });
    expect(
      result.stages.find(({ id }) => id === "full-davis-fallback"),
    ).toMatchObject({ status: "passed" });
    expect(result.fiberingCertificateReplay).toMatchObject({
      valid: true,
      mandatoryStagesPassed: true,
    });
  });

  it("reports resource caps and incomplete spherical planning as inconclusive", async () => {
    const artifact = await materializedArtifact();
    const degreeCapped = await promoteMaterializedActionToFullDavisFibering(
      PRODUCT_SYSTEM,
      artifact,
      { budgets: { maxActionDegree: 3 } },
    );
    expect(degreeCapped.status).toBe("incomplete");
    expect(degreeCapped.errors.join(" ")).toContain("degree budget");
    expect(degreeCapped.nonClaims.join(" ")).toContain("fibering");

    const planCapped = await promoteMaterializedActionToFullDavisFibering(
      PRODUCT_SYSTEM,
      artifact,
      {
        sphericalPlanLimits: { maxSubsetsToCheck: 1 },
      },
    );
    expect(planCapped.status).toBe("incomplete");
    expect(planCapped.stages[1].status).toBe("incomplete");
    expect(planCapped.stages[2].status).toBe("not-run");
    expect(planCapped.claims.join(" ")).not.toContain("torsion-free");
  });
});
