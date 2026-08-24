import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("rank-19 normal-catalogue archive validation", () => {
  it("rejects a raw JSON container before treating it as a gzip-json archive", () => {
    const directory = mkdtempSync(join(tmpdir(), "rank19-archive-"));
    const archivePath = join(directory, "catalogue.json.gz");
    const manifestPath = join(directory, "catalogue.archive.json");
    try {
      writeFileSync(archivePath, "{}\n", "utf8");
      writeFileSync(manifestPath, "{}\n", "utf8");
      const result = spawnSync(
        process.execPath,
        [
          resolve("node_modules/tsx/dist/cli.mjs"),
          resolve("scripts/archive_rank19_global_normal_catalogue.ts"),
          "--archive",
          archivePath,
          "--manifest",
          manifestPath,
          "--verify-only",
          "true",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "is not a gzip archive",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
