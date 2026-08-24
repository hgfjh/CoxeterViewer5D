#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  actionFromCompactDiscoveryArtifact,
  buildCompactActionPortfolio,
  buildCompactPostActionEvidence,
  compactTargetDiscoveryCommand,
  COMPACT_TARGET_DEFINITIONS,
  nonPassedCompactDiscoveryEvidence,
  replayCompactActionPortfolio,
  restrictP0ActionToP1,
  type CompactTargetEvidence,
  type CompactTargetId,
  type CompactTargetSourceInput,
} from "../src/fibering/compactActionPortfolio";
import {
  certifyTorsionFreeAction,
  planSphericalSpecialSubgroups,
  type TorsionFreeActionCandidate,
  type TorsionFreeActionCertificate,
} from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const DEFAULT_OUTPUT =
  "scripts/certificates/portfolio/compact_h5_action_portfolio.json";
const DEFAULT_DISCOVERY_DIRECTORY = ".cover-search/compact-action-portfolio";

interface Arguments {
  output: string;
  discoveryDirectory: string;
  executeDiscovery: boolean;
  verifyOnly: boolean;
  skipExistingDiscovery: boolean;
  generatedAt?: string;
}

function parseBoolean(value: string | undefined, label: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${label} must be true or false.`);
}

function parseArguments(argv: readonly string[]): Arguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  if (normalized.length % 2 !== 0) {
    throw new Error("Arguments must be supplied as --name value pairs.");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const key = normalized[index];
    const value = normalized[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) {
      throw new Error(
        "Arguments must be supplied as distinct --name value pairs.",
      );
    }
    values.set(key, value);
  }
  const known = new Set([
    "--output",
    "--discovery-directory",
    "--execute-discovery",
    "--verify-only",
    "--skip-existing-discovery",
    "--generated-at",
  ]);
  for (const key of values.keys()) {
    if (!known.has(key)) throw new Error(`Unknown argument ${key}.`);
  }
  return {
    output: values.get("--output") ?? DEFAULT_OUTPUT,
    discoveryDirectory:
      values.get("--discovery-directory") ?? DEFAULT_DISCOVERY_DIRECTORY,
    executeDiscovery: values.has("--execute-discovery")
      ? parseBoolean(values.get("--execute-discovery"), "--execute-discovery")
      : false,
    verifyOnly: values.has("--verify-only")
      ? parseBoolean(values.get("--verify-only"), "--verify-only")
      : false,
    skipExistingDiscovery: values.has("--skip-existing-discovery")
      ? parseBoolean(
          values.get("--skip-existing-discovery"),
          "--skip-existing-discovery",
        )
      : false,
    ...(values.has("--generated-at")
      ? { generatedAt: values.get("--generated-at") as string }
      : {}),
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function portable(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function sources(): CompactTargetSourceInput[] {
  return COMPACT_TARGET_DEFINITIONS.map((definition) => {
    const path = resolve(definition.sourcePath);
    const bytes = readFileSync(path);
    return {
      id: definition.id,
      path: definition.sourcePath,
      bytesSha256: sha256(bytes),
      input: JSON.parse(bytes.toString("utf8")) as unknown,
    };
  });
}

function exactActionEvidence(
  system: CoxeterSystemInput,
  candidate: TorsionFreeActionCandidate,
): {
  evidence: CompactTargetEvidence;
  certificate: TorsionFreeActionCertificate;
} {
  const plan = planSphericalSpecialSubgroups(system, {
    maxRankForExhaustiveEnumeration: system.rank,
    maxSubsetsToCheck: 2 ** system.rank,
  });
  const certificate = certifyTorsionFreeAction(system, candidate, plan, {
    maxSphericalSubgroupElements: 100_000,
    maxWitnesses: 8192,
  });
  const actionDigest = canonicalSha256({
    index: candidate.index,
    generatorImages: candidate.generatorImages,
  });
  const certificateDigest = canonicalSha256(certificate);
  const postActionEvidence =
    certificate.status === "passed"
      ? buildCompactPostActionEvidence(system, { candidate, certificate })
      : {};
  return {
    evidence: {
      torsionFree: {
        status: certificate.status,
        actionDigest,
        degree: candidate.index,
        certificateDigest,
        candidate,
        certificate,
        note:
          certificate.status === "passed"
            ? "The TypeScript Tits/spherical-special-subgroup checker independently replayed the materialized action."
            : certificate.errors.join(" "),
      },
      ...postActionEvidence,
    },
    certificate,
  };
}

interface ValidatedCompactDiscovery {
  raw: unknown;
  evidence: CompactTargetEvidence;
  action?: TorsionFreeActionCandidate;
}

function validateCompactDiscovery(
  targetId: CompactTargetId,
  source: CompactTargetSourceInput,
  system: CoxeterSystemInput,
  raw: unknown,
): ValidatedCompactDiscovery {
  const rawRecord = raw as Record<string, unknown>;
  if (rawRecord.status !== "passed") {
    return {
      raw,
      evidence: nonPassedCompactDiscoveryEvidence(targetId, source, raw),
    };
  }
  const action = actionFromCompactDiscoveryArtifact(
    raw,
    `${targetId}-discovered`,
  );
  const replay = exactActionEvidence(system, action);
  if (replay.evidence.torsionFree?.status !== "passed") {
    throw new Error(
      `${targetId} discovery claimed success but failed independent torsion-free replay.`,
    );
  }
  return { raw, evidence: replay.evidence, action };
}

function runDiscovery(
  targetId: CompactTargetId,
  discoveryDirectory: string,
  skipExisting: boolean,
  validate: (raw: unknown) => ValidatedCompactDiscovery,
): ValidatedCompactDiscovery {
  const definition = COMPACT_TARGET_DEFINITIONS.find(
    (candidate) => candidate.id === targetId,
  );
  if (definition === undefined)
    throw new Error(`Unknown compact target ${targetId}.`);
  const directory = resolve(discoveryDirectory);
  const output = resolve(directory, `${targetId}.json`);
  const checkpoint = resolve(directory, `${targetId}.checkpoints`);
  mkdirSync(directory, { recursive: true });
  const existing = existsSync(output) ? readJson(output) : undefined;
  const existingPassed =
    typeof existing === "object" &&
    existing !== null &&
    (existing as Record<string, unknown>).status === "passed";
  if (!existingPassed && (!skipExisting || existing === undefined)) {
    const freshOutput = `${output}.run-${process.pid}-${Date.now()}.json`;
    const command = [
      ...compactTargetDiscoveryCommand(targetId),
      "--output",
      portable(freshOutput),
      "--checkpoint-dir",
      portable(checkpoint),
    ];
    try {
      const completed = spawnSync(command[0], command.slice(1), {
        cwd: process.cwd(),
        stdio: "inherit",
        shell: false,
      });
      if (completed.error) throw completed.error;
      if (!existsSync(freshOutput)) {
        throw new Error(
          `${targetId} discovery exited ${String(completed.status)} without a fresh output artifact.`,
        );
      }
      const fresh = readJson(freshOutput);
      const validated = validate(fresh);
      atomicJson(output, fresh);
      return validated;
    } finally {
      if (existsSync(freshOutput)) unlinkSync(freshOutput);
    }
  }
  return validate(
    existingPassed || (skipExisting && existing !== undefined)
      ? existing
      : readJson(output),
  );
}

function executeDiscovery(
  sourceInputs: CompactTargetSourceInput[],
  discoveryDirectory: string,
  skipExisting: boolean,
): Partial<Record<CompactTargetId, CompactTargetEvidence>> {
  const systems = new Map(
    sourceInputs.map((source) => [
      source.id,
      source.input as CoxeterSystemInput,
    ]),
  );
  const sourcesById = new Map(
    sourceInputs.map((source) => [source.id, source]),
  );
  const evidence: Partial<Record<CompactTargetId, CompactTargetEvidence>> = {};

  const discover = (targetId: CompactTargetId): ValidatedCompactDiscovery => {
    const source = sourcesById.get(targetId);
    const system = systems.get(targetId);
    if (source === undefined || system === undefined) {
      throw new Error(`Missing source input for ${targetId}.`);
    }
    return runDiscovery(targetId, discoveryDirectory, skipExisting, (raw) =>
      validateCompactDiscovery(targetId, source, system, raw),
    );
  };

  const p0Discovery = discover("makarov-p0");
  evidence["makarov-p0"] = p0Discovery.evidence;
  if (p0Discovery.action !== undefined) {
    const transfers = restrictP0ActionToP1(p0Discovery.action).map(
      (candidate) => ({
        candidate,
        ...exactActionEvidence(
          systems.get("makarov-p1") as CoxeterSystemInput,
          candidate,
        ),
      }),
    );
    const passed = transfers
      .filter((entry) => entry.evidence.torsionFree?.status === "passed")
      .sort((left, right) => left.candidate.index - right.candidate.index);
    if (passed.length > 0) {
      evidence["makarov-p1"] = passed[0].evidence;
      const transferWithoutHash = {
        schemaVersion: 1,
        kind: "makarov-p0-to-p1-index-two-action-transfer",
        parentDiscoveryArtifactDigest: canonicalSha256(p0Discovery.raw),
        generatorWordsInP0: [[0], [1], [2], [3], [4], [5], [6, 5, 6]],
        orbitCount: transfers.length,
        orbits: transfers.map((entry) => ({
          candidate: entry.candidate,
          certificate: entry.certificate,
        })),
        selectedCandidateId: passed[0].candidate.id,
      };
      atomicJson(resolve(discoveryDirectory, "makarov-p1-from-p0.json"), {
        ...transferWithoutHash,
        artifactHash: canonicalSha256(transferWithoutHash),
      });
    }
  }

  if (evidence["makarov-p1"]?.torsionFree?.status !== "passed") {
    evidence["makarov-p1"] = discover("makarov-p1").evidence;
  }

  for (const targetId of [
    "tumarkin-g11411-15",
    "tumarkin-g11411-04",
  ] as const) {
    evidence[targetId] = discover(targetId).evidence;
  }
  return evidence;
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  const sourceInputs = sources();
  const output = resolve(args.output);
  if (args.verifyOnly) {
    if (!existsSync(output))
      throw new Error(`Missing portfolio artifact ${output}.`);
    const replay = replayCompactActionPortfolio(readJson(output), sourceInputs);
    if (replay.status !== "passed") {
      throw new Error(
        `Stored compact portfolio failed replay: ${replay.errors.join(" ")}`,
      );
    }
    console.log(`verified ${portable(output)} (${replay.replayDigest})`);
    return;
  }

  if (!args.executeDiscovery && existsSync(output)) {
    const replay = replayCompactActionPortfolio(readJson(output), sourceInputs);
    if (replay.status !== "passed") {
      throw new Error(
        `Existing compact portfolio failed replay and was not overwritten: ${replay.errors.join(" ")}`,
      );
    }
    console.log(
      `preserved ${portable(output)} (${replay.replayDigest}); pass --execute-discovery true to replace bounded discovery outcomes`,
    );
    return;
  }

  let evidence: Partial<Record<CompactTargetId, CompactTargetEvidence>> = {};
  if (args.executeDiscovery) {
    evidence = {
      ...evidence,
      ...executeDiscovery(
        sourceInputs,
        args.discoveryDirectory,
        args.skipExistingDiscovery,
      ),
    };
  }
  const artifact = buildCompactActionPortfolio(sourceInputs, {
    ...(args.generatedAt ? { generatedAt: args.generatedAt } : {}),
    evidence,
  });
  atomicJson(output, artifact);
  console.log(
    `wrote ${portable(output)} (${artifact.targets.map((target) => `${target.id}:${target.disposition}`).join(", ")})`,
  );
}

main();
