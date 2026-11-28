import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createInlineKernelPool, shareRows } from "../src/parallel/kernelPool";
import { runKernel } from "../src/parallel/kernels";

describe("kernel pool", () => {
  it("runs kernels inline with the same results as direct calls", async () => {
    const pool = createInlineKernelPool();
    // s, t generate the dihedral group of order 6 acting regularly on 6 points.
    const s = Uint32Array.from([1, 0, 3, 2, 5, 4]);
    const t = Uint32Array.from([5, 2, 1, 4, 3, 0]);
    const args = { left: s, right: t, m: 3, degree: 6, involutions: true };
    expect(await pool.run("alternatingRelation", args)).toEqual(
      runKernel("alternatingRelation", args),
    );
    expect(await pool.run("alternatingRelation", args)).toBeNull();
    expect(
      await pool.run("freeOrbitTemplate", {
        rows: [s, t],
        degree: 6,
        order: 6,
      }),
    ).toBe(true);
    // The same rows do not satisfy (st)^2 = 1.
    expect(
      await pool.run("alternatingRelation", { ...args, m: 2 }),
    ).not.toBeNull();
  });

  it("copies unshared rows into shared memory without changing them", () => {
    const rows = [Uint32Array.from([1, 0, 2]), [2, 1, 0]];
    const shared = shareRows(rows);
    expect(shared.map((row) => Array.from(row))).toEqual([
      [1, 0, 2],
      [2, 1, 0],
    ]);
    expect(shared.every((row) => row.buffer instanceof SharedArrayBuffer)).toBe(
      true,
    );
    expect(shareRows(shared)).toBe(shared);
  });

  it("starts real worker threads under tsx and reproduces sequential results", () => {
    const command = spawnSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/kernel_pool_selfcheck.ts",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    expect(command.status, command.stderr).toBe(0);
    expect(JSON.parse(command.stdout.trim().split("\n").at(-1)!)).toEqual({
      poolKind: "node-workers",
      torsionEqual: true,
      oracleEqual: true,
    });
  });
});
