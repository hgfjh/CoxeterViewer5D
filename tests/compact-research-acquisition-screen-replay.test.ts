import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { replayCompactResearchAcquisitionScreens } from "../src/fibering/node/compactResearchAcquisitionScreenReplay";
import {
  compactResearchTargets,
  type CompactResearchTarget,
} from "../src/fibering/compactResearchTargets";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const temporaryDirectories: string[] = [];
const SCREEN_KINDS = ["makarov-p0", "tumarkin-g11411-06"] as const;

function temporaryDirectory(): string {
  const directory = mkdtempSync(
    join(tmpdir(), "compact-acquisition-screen-replay-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function clonedTarget(id: CompactResearchTarget["id"]): CompactResearchTarget {
  const target = compactResearchTargets.find((entry) => entry.id === id);
  if (!target) throw new Error(`Missing compact target ${id}.`);
  return structuredClone(target);
}

function copyBindingFiles(root: string, target: CompactResearchTarget): void {
  for (const screen of target.acquisitionScreens) {
    for (const path of [screen.artifactPath, screen.sourcePath]) {
      const destination = resolve(root, path);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(resolve(path), destination);
    }
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("compact acquisition-screen byte replay", () => {
  it("replays both H4 and Tumarkin certificates from tracked bytes", () => {
    const replay = replayCompactResearchAcquisitionScreens(
      compactResearchTargets,
      resolve("."),
    );
    expect(replay).toMatchObject({
      status: "passed",
      replayedScreenCount: 4,
      checks: {
        everyArtifactPresent: true,
        everyArtifactByteHashValid: true,
        everyCertificateSealValid: true,
        everySourceByteHashValid: true,
        everySourceBindingValid: true,
        everyCompletedScopeValid: true,
        importedAndUnmodeledLanesRemainOpen: true,
      },
      errors: [],
    });
  });

  it.each(SCREEN_KINDS)(
    "fails closed when the %s artifact is missing",
    (targetId) => {
      const root = temporaryDirectory();
      const target = clonedTarget(targetId);
      copyBindingFiles(root, target);
      unlinkSync(resolve(root, target.acquisitionScreens[0].artifactPath));
      const replay = replayCompactResearchAcquisitionScreens([target], root);
      expect(replay.status).toBe("failed");
      expect(replay.checks.everyArtifactPresent).toBe(false);
      expect(replay.errors.join(" ")).toMatch(/ENOENT|not a regular file/u);
    },
  );

  it.each(SCREEN_KINDS)(
    "rejects the %s artifact when its bytes change after registry binding",
    (targetId) => {
      const root = temporaryDirectory();
      const target = clonedTarget(targetId);
      copyBindingFiles(root, target);
      const path = resolve(root, target.acquisitionScreens[0].artifactPath);
      const bytes = readFileSync(path);
      writeFileSync(path, Buffer.concat([bytes, Buffer.from("\n")]));
      const replay = replayCompactResearchAcquisitionScreens([target], root);
      expect(replay.status).toBe("failed");
      expect(replay.checks.everyArtifactByteHashValid).toBe(false);
    },
  );

  it("rejects a resealed certificate that changes the completed scope", () => {
    const root = temporaryDirectory();
    const target = clonedTarget("makarov-p1");
    copyBindingFiles(root, target);
    const screen = target.acquisitionScreens[0];
    const path = resolve(root, screen.artifactPath);
    const artifact = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      unknown
    >;
    artifact.status = "incomplete";
    delete artifact.certificateSha256;
    artifact.certificateSha256 = canonicalSha256(artifact);
    const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
    writeFileSync(path, bytes);
    screen.certificateSha256 = artifact.certificateSha256 as string;
    screen.artifactBytesSha256 = sha256(bytes);

    const replay = replayCompactResearchAcquisitionScreens([target], root);
    expect(replay.status).toBe("failed");
    expect(replay.checks.everyCompletedScopeValid).toBe(false);
    expect(replay.errors.join(" ")).toMatch(/header or status/u);
  });

  it("rejects changed semantics even when the byte binding is refreshed", () => {
    const root = temporaryDirectory();
    const target = clonedTarget("tumarkin-g11411-15");
    copyBindingFiles(root, target);
    const screen = target.acquisitionScreens[0];
    const path = resolve(root, screen.artifactPath);
    const artifact = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      unknown
    >;
    artifact.claimBoundary = "tampered";
    const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
    writeFileSync(path, bytes);
    screen.artifactBytesSha256 = sha256(bytes);

    const replay = replayCompactResearchAcquisitionScreens([target], root);
    expect(replay.status).toBe("failed");
    expect(replay.checks.everyCertificateSealValid).toBe(false);
    expect(replay.errors.join(" ")).toMatch(/certificate seal/u);
  });
});
