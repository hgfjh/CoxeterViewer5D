import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { parseCoxeterSystemInput } from "../../coxeter";
import { canonicalSha256 } from "../../utils/canonicalSha256";
import type {
  CompactResearchAcquisitionScreen,
  CompactResearchTarget,
} from "../compactResearchTargets";

const DEFAULT_MAXIMUM_BYTES = 64 * 1024 * 1024;

export interface CompactResearchAcquisitionScreenBindingReplay {
  targetId: CompactResearchTarget["id"];
  screenId: CompactResearchAcquisitionScreen["id"];
  artifactPath: string;
  sourcePath: string;
  artifactBytesSha256: string;
  certificateSha256: string;
  sourceBytesSha256: string;
}

export interface CompactResearchAcquisitionScreenReplay {
  schemaVersion: 1;
  kind: "compact-research-acquisition-screen-replay";
  status: "passed" | "failed";
  checks: {
    everyArtifactPresent: boolean;
    everyArtifactByteHashValid: boolean;
    everyCertificateSealValid: boolean;
    everySourceByteHashValid: boolean;
    everySourceBindingValid: boolean;
    everyCompletedScopeValid: boolean;
    importedAndUnmodeledLanesRemainOpen: boolean;
  };
  replayedScreenCount: number;
  bindings: CompactResearchAcquisitionScreenBindingReplay[];
  errors: string[];
  replayDigest: string;
}

interface ReplayState {
  checks: CompactResearchAcquisitionScreenReplay["checks"];
  bindings: CompactResearchAcquisitionScreenBindingReplay[];
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} is not an object.`);
  return value;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array.`);
  return value;
}

function strings(value: unknown, label: string): string[] {
  const values = array(value, label);
  if (values.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} is not an array of strings.`);
  }
  return values as string[];
}

function repositoryPath(repositoryRoot: string, path: string): string {
  if (isAbsolute(path)) {
    throw new Error(
      `Acquisition-screen path must be repository-relative: ${path}.`,
    );
  }
  const root = resolve(repositoryRoot);
  const resolved = resolve(root, path);
  const relation = relative(root, resolved);
  if (
    relation.length === 0 ||
    relation === ".." ||
    relation.startsWith(`..\\`) ||
    relation.startsWith("../") ||
    isAbsolute(relation)
  ) {
    throw new Error(`Acquisition-screen path escapes the repository: ${path}.`);
  }
  return resolved;
}

function readBoundedBytes(path: string, maximumBytes: number): Buffer {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(`${path} is not a regular file within the byte bound.`);
  }
  const bytes = readFileSync(path);
  if (bytes.byteLength > maximumBytes) {
    throw new Error(
      `${path} changed while being read and exceeds the byte bound.`,
    );
  }
  return bytes;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameNumbers(value: unknown, expected: readonly number[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

function requireCertificateSeal(
  artifact: Record<string, unknown>,
  screen: CompactResearchAcquisitionScreen,
): void {
  if (artifact.certificateSha256 !== screen.certificateSha256) {
    throw new Error(
      "The stored certificate seal differs from the registry binding.",
    );
  }
  const payload = Object.fromEntries(
    Object.entries(artifact).filter(([key]) => key !== "certificateSha256"),
  );
  if (canonicalSha256(payload) !== screen.certificateSha256) {
    throw new Error("The acquisition-screen certificate seal is invalid.");
  }
}

function requireOpenLanes(screen: CompactResearchAcquisitionScreen): void {
  const boundary = screen.claimBoundary.toLowerCase();
  if (
    screen.disposition !== "custom-lane-closed-imported-actions-open" ||
    screen.acceptsImportedFiniteActionEvidence !== true ||
    !boundary.includes("nonnormal") ||
    !boundary.includes("nonsplit")
  ) {
    throw new Error(
      "The acquisition-screen registry entry closes an unmodeled or imported-action lane.",
    );
  }
}

function requireH4ProjectionScope(
  target: CompactResearchTarget,
  screen: Extract<
    CompactResearchAcquisitionScreen,
    { artifactType: "makarov-h4-projection-obstruction" }
  >,
  artifact: Record<string, unknown>,
): void {
  if (
    artifact.schemaVersion !== 1 ||
    artifact.artifactType !== screen.artifactType ||
    artifact.status !== "proved"
  ) {
    throw new Error(
      "The H4 projection certificate header or status is invalid.",
    );
  }
  const claim = record(artifact.claim, "H4 projection claim");
  const exact = record(artifact.exactResult, "H4 projection exact result");
  if (
    claim.candidateCount !== 0 ||
    exact.candidateCount !== 0 ||
    exact.centralizerOrder !== 4 ||
    exact.h3Order !== 120 ||
    exact.h4Order !== 14_400
  ) {
    throw new Error(
      "The H4 projection certificate does not prove the empty candidate set.",
    );
  }

  const scope = record(artifact.targetScope, "H4 projection target scope");
  const targets = array(scope.targets, "H4 projection targets");
  const expectedTargets = [
    [2, 1],
    [4, 1],
    [4, 2],
    [6, 1],
    [6, 2],
    [8, 1],
    [8, 2],
    [8, 3],
    [8, 4],
    [8, 5],
  ] as const;
  if (
    screen.canonicalFirstProjection !== true ||
    scope.canonicalFirstProjection !== true ||
    scope.construction !== screen.targetFamily ||
    !sameNumbers(scope.cofactorOrders, screen.cofactorOrders) ||
    scope.targetCount !== screen.eliminatedTargetCount ||
    targets.length !== screen.eliminatedTargetCount
  ) {
    throw new Error(
      "The H4 projection certificate has a different target scope.",
    );
  }
  for (const [index, rawTarget] of targets.entries()) {
    const scopedTarget = record(rawTarget, "H4 projection target");
    const [cofactorOrder, cofactorId] = expectedTargets[index];
    if (
      scopedTarget.id !==
        `h4-times-smallgroup-${cofactorOrder}-${cofactorId}` ||
      scopedTarget.cofactorOrder !== cofactorOrder ||
      scopedTarget.cofactorId !== cofactorId ||
      scopedTarget.targetOrder !== 14_400 * cofactorOrder
    ) {
      throw new Error(
        "The H4 projection certificate contains an invalid direct target.",
      );
    }
  }

  const bindingKey =
    target.id === "makarov-p0"
      ? "p0"
      : target.id === "makarov-p1"
        ? "p1"
        : undefined;
  if (!bindingKey) {
    throw new Error(
      "The H4 projection certificate is attached to a non-Makarov target.",
    );
  }
  const bindings = record(
    artifact.sourceBindings,
    "H4 projection source bindings",
  );
  const binding = record(
    bindings[bindingKey],
    `H4 projection ${bindingKey} source binding`,
  );
  if (
    binding.sourcePath !== screen.sourcePath ||
    binding.sourceBytesSha256 !== screen.sourceBytesSha256 ||
    !sameNumbers(binding.h4Generators, [0, 1, 2, 3]) ||
    !sameNumbers(binding.h3Generators, [0, 1, 2]) ||
    binding.candidateGenerator !== 4 ||
    !sameNumbers(binding.candidateIncidenceWithH4, [2, 2, 2, 3])
  ) {
    throw new Error(
      "The H4 projection certificate is bound to a different source system.",
    );
  }

  const nonClaims = strings(artifact.nonClaims, "H4 projection non-claims")
    .join(" ")
    .toLowerCase();
  if (
    !nonClaims.includes("noncanonical h4") ||
    !nonClaims.includes("nonsplit") ||
    !nonClaims.includes("nonnormal")
  ) {
    throw new Error(
      "The H4 projection certificate omits its open-lane boundary.",
    );
  }
}

function requireTumarkinScope(
  target: CompactResearchTarget,
  screen: Extract<
    CompactResearchAcquisitionScreen,
    { artifactType: "tumarkin-06-15-shallow-split-target-screen" }
  >,
  artifact: Record<string, unknown>,
): void {
  if (
    artifact.schemaVersion !== 1 ||
    artifact.artifactType !== screen.artifactType ||
    artifact.status !== "completed"
  ) {
    throw new Error("The Tumarkin shallow-screen header or status is invalid.");
  }
  const configuration = record(
    artifact.configuration,
    "Tumarkin configuration",
  );
  if (
    configuration.target !== screen.targetFamily ||
    configuration.targetOrder !== 28_800
  ) {
    throw new Error(
      "The Tumarkin certificate has a different split-target scope.",
    );
  }
  const scope = record(artifact.scope, "Tumarkin scope");
  const notSearched = strings(scope.notSearched, "Tumarkin open lanes")
    .join(" ")
    .toLowerCase();
  if (
    !notSearched.includes("nonnormal") ||
    !notSearched.includes("nonsplit") ||
    !notSearched.includes("outside the four explicit") ||
    !notSearched.includes("higher-degree")
  ) {
    throw new Error("The Tumarkin certificate omits its open-lane boundary.");
  }

  const system = array(artifact.systems, "Tumarkin systems")
    .map((entry) => record(entry, "Tumarkin system"))
    .find((entry) => entry.id === target.id);
  if (!system) {
    throw new Error(`The Tumarkin certificate omits ${target.id}.`);
  }
  const source = record(system.sourceBinding, "Tumarkin source binding");
  if (
    source.path !== screen.sourcePath ||
    source.bytesSha256 !== screen.sourceBytesSha256 ||
    source.canonicalSourceSha256 !== screen.sourceCanonicalSystemSha256
  ) {
    throw new Error(
      "The Tumarkin certificate is bound to a different source system.",
    );
  }
  const summary = record(system.summary, "Tumarkin summary");
  const anchors = array(system.anchors, "Tumarkin anchors").map((entry) =>
    record(entry, "Tumarkin anchor"),
  );
  const records = anchors.flatMap((anchor) =>
    array(anchor.modeledAnchorRecords, "Tumarkin modeled anchor records").map(
      (entry) => record(entry, "Tumarkin modeled anchor record"),
    ),
  );
  if (
    system.h4TimesA1AnchorCount !== anchors.length ||
    summary.modeledAnchorRecordCount !== screen.modeledAnchorRecordCount ||
    summary.eliminatedRecordCount !== screen.eliminatedAnchorRecordCount ||
    summary.budgetExhaustedRecordCount !== 0 ||
    summary.pairwiseSurvivorCount !== 0 ||
    summary.concreteActionFound !== false ||
    summary.splitTargetEliminatedWithinModeledAnchorClasses !== true ||
    records.length !== screen.modeledAnchorRecordCount ||
    anchors.some((anchor) => anchor.allModeledRecordsEliminated !== true) ||
    records.some((entry) => entry.outcome !== "eliminated")
  ) {
    throw new Error(
      "The Tumarkin certificate does not complete the modeled obstruction.",
    );
  }
}

function replayOne(
  repositoryRoot: string,
  maximumBytes: number,
  target: CompactResearchTarget,
  screen: CompactResearchAcquisitionScreen,
): CompactResearchAcquisitionScreenBindingReplay {
  if (
    screen.status !== "closed-within-modeled-classes" ||
    target.sourceStatus !== "bundled-certified" ||
    target.facts === null ||
    target.executionPolicy.acceptsFiniteActionEvidence !== true ||
    target.canonicalSystemSha256 !== screen.sourceCanonicalSystemSha256 ||
    target.facts.sourcePath !== screen.sourcePath
  ) {
    throw new Error(
      "The acquisition-screen registry binding is inconsistent with its target.",
    );
  }
  requireOpenLanes(screen);

  const artifactPath = repositoryPath(repositoryRoot, screen.artifactPath);
  const sourcePath = repositoryPath(repositoryRoot, screen.sourcePath);
  const artifactBytes = readBoundedBytes(artifactPath, maximumBytes);
  const sourceBytes = readBoundedBytes(sourcePath, maximumBytes);
  if (sha256(artifactBytes) !== screen.artifactBytesSha256) {
    throw new Error("The acquisition-screen artifact byte hash is stale.");
  }
  if (sha256(sourceBytes) !== screen.sourceBytesSha256) {
    throw new Error("The acquisition-screen source byte hash is stale.");
  }
  const sourceSystem = parseCoxeterSystemInput(
    JSON.parse(sourceBytes.toString("utf8")) as unknown,
  );
  if (canonicalSha256(sourceSystem) !== screen.sourceCanonicalSystemSha256) {
    throw new Error(
      "The acquisition-screen source system differs from the target's canonical system.",
    );
  }
  const artifact = record(
    JSON.parse(artifactBytes.toString("utf8")) as unknown,
    "Acquisition-screen artifact",
  );
  requireCertificateSeal(artifact, screen);
  if (screen.artifactType === "makarov-h4-projection-obstruction") {
    requireH4ProjectionScope(target, screen, artifact);
  } else {
    requireTumarkinScope(target, screen, artifact);
  }
  return {
    targetId: target.id,
    screenId: screen.id,
    artifactPath: screen.artifactPath,
    sourcePath: screen.sourcePath,
    artifactBytesSha256: screen.artifactBytesSha256,
    certificateSha256: screen.certificateSha256,
    sourceBytesSha256: screen.sourceBytesSha256,
  };
}

/**
 * Replay every closed acquisition lane from the tracked artifact and source
 * bytes. The pure portfolio replay checks registry digests; this Node boundary
 * is what turns those locators into verified evidence.
 */
export function replayCompactResearchAcquisitionScreens(
  targets: readonly CompactResearchTarget[],
  repositoryRoot: string,
  maximumBytes = DEFAULT_MAXIMUM_BYTES,
): CompactResearchAcquisitionScreenReplay {
  const state: ReplayState = {
    checks: {
      everyArtifactPresent: true,
      everyArtifactByteHashValid: true,
      everyCertificateSealValid: true,
      everySourceByteHashValid: true,
      everySourceBindingValid: true,
      everyCompletedScopeValid: true,
      importedAndUnmodeledLanesRemainOpen: true,
    },
    bindings: [],
    errors: [],
  };
  for (const target of targets) {
    for (const screen of target.acquisitionScreens) {
      try {
        state.bindings.push(
          replayOne(repositoryRoot, maximumBytes, target, screen),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state.errors.push(`${target.id}/${screen.id}: ${message}`);
        if (/not a regular file|ENOENT/u.test(message)) {
          state.checks.everyArtifactPresent = false;
        }
        if (/artifact byte hash/u.test(message)) {
          state.checks.everyArtifactByteHashValid = false;
        }
        if (/certificate seal/u.test(message)) {
          state.checks.everyCertificateSealValid = false;
        }
        if (/source byte hash/u.test(message)) {
          state.checks.everySourceByteHashValid = false;
        }
        if (/source system|registry binding/u.test(message)) {
          state.checks.everySourceBindingValid = false;
        }
        if (
          /scope|candidate set|modeled obstruction|header or status/u.test(
            message,
          )
        ) {
          state.checks.everyCompletedScopeValid = false;
        }
        if (/open-lane|unmodeled or imported-action/u.test(message)) {
          state.checks.importedAndUnmodeledLanesRemainOpen = false;
        }
      }
    }
  }
  const expectedScreenCount = targets.reduce(
    (count, target) => count + target.acquisitionScreens.length,
    0,
  );
  const status: CompactResearchAcquisitionScreenReplay["status"] =
    state.errors.length === 0 && state.bindings.length === expectedScreenCount
      ? "passed"
      : "failed";
  const payload = {
    schemaVersion: 1 as const,
    kind: "compact-research-acquisition-screen-replay" as const,
    status,
    checks: state.checks,
    replayedScreenCount: state.bindings.length,
    bindings: state.bindings,
    errors: [...new Set(state.errors)].sort(),
  };
  return { ...payload, replayDigest: canonicalSha256(payload) };
}
