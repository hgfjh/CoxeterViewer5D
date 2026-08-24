#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// Vitest's Windows launcher can misresolve its config inside a pnpm script when
// explicit file filters are present in an OneDrive checkout. The full suite is
// a stronger gate and uses the stable no-filter path on every platform.
const fullDavisVitestArgs = ["pnpm", "validate:full-davis-fibering"];

const fullDavisVitestCommand =
  process.platform === "win32"
    ? [
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", `corepack ${fullDavisVitestArgs.join(" ")}`],
      ]
    : ["corepack", fullDavisVitestArgs];

// Browser timing has its own `bench:timed:hard-gate` process and CI step.
// Running it again after every Python/external checker measures residual host
// contention rather than the production app, and made the combined validator
// nondeterministic without strengthening any mathematical check.
const COMMANDS = [
  ["node", ["scripts/verify_catalogue.mjs"]],
  [
    "python",
    [
      "scripts/certify_compact_5_cube.py",
      "public/examples/compact_5_cube_gamma1.json",
    ],
  ],
  [
    "python",
    [
      "scripts/certify_compact_5_prism.py",
      "public/examples/compact_5_prism_makarov.json",
    ],
  ],
  [
    "python",
    [
      "scripts/certify_compact_5_prism_family.py",
      "public/examples/compact_5_polytope_p1_double_makarov.json",
      "public/examples/compact_5_prism_makarov_p2.json",
    ],
  ],
  [
    "python",
    [
      "scripts/certify_ideal_hyperbolic_3_cube.py",
      "public/examples/ideal_hyperbolic_3_cube_m3.json",
    ],
  ],
  ["python", ["scripts/certify_tumarkin_8facet.py"]],
  [
    "python",
    [
      "scripts/gap_kbmag_export_backend.py",
      "--certify-output",
      "tests/fixtures/generated/I2_5_gap_radius_5.json",
      "tests/fixtures/generated/A2_gap_radius_3.json",
      "tests/fixtures/generated/A3_gap_radius_6.json",
    ],
  ],
  [
    "python",
    [
      "scripts/certify_geometry_intervals.py",
      "public/examples/compact_5_cube_gamma1.json",
    ],
  ],
  [
    "python",
    [
      "scripts/certify_geometry_intervals.py",
      "public/examples/compact_5_prism_makarov.json",
    ],
  ],
  [
    "python",
    [
      "scripts/certify_geometry_intervals.py",
      "public/examples/compact_5_polytope_p1_double_makarov.json",
    ],
  ],
  [
    "python",
    [
      "scripts/certify_geometry_intervals.py",
      "public/examples/compact_5_prism_makarov_p2.json",
    ],
  ],
  ["node", ["scripts/check_independent.mjs"]],
  [
    "node",
    [
      "scripts/validate_artifact_manifest.mjs",
      "scripts/certificates/external-artifact-manifest.example.json",
    ],
  ],
  ["node", ["scripts/registry_validate.mjs"]],
  ["node", ["scripts/compare_backends.mjs"]],
  ["node", ["scripts/compare_quotient_backends.mjs"]],
  ["node", ["scripts/validate_workflow.mjs"]],
  ["node", ["scripts/validate_virtual_fibering.mjs", "--self-test"]],
  ["python", ["scripts/test_mod3_structural_certificate.py"]],
  ["python", ["scripts/test_odd_prime_structural_certificate.py"]],
  ["python", ["scripts/test_block_amalgam_cover_search.py"]],
  ["python", ["scripts/test_block_amalgam_canonical_augmentation.py"]],
  ["python", ["scripts/test_block_amalgam_candidate_globalizer.py"]],
  ["python", ["scripts/test_run_finite_image_portfolio.py"]],
  ["python", ["scripts/test_finite_target_synthesis.py"]],
  ["python", ["scripts/test_everitt_composite_portfolio.py"]],
  ["python", ["scripts/test_orbifold_cover_search.py"]],
  ["python", ["scripts/test_coordinated_cover_search.py"]],
  fullDavisVitestCommand,
  [
    "node",
    [
      "scripts/certify_quotient.mjs",
      "tests/fixtures/quotients/I2_5_one_vertex_quotient.json",
    ],
  ],
  [
    "node",
    [
      "scripts/certify_morse.mjs",
      "tests/fixtures/quotients/I2_5_one_vertex_quotient.json",
    ],
  ],
  [
    "node",
    [
      "scripts/certify_local_links.mjs",
      "tests/fixtures/quotients/I2_5_one_vertex_quotient.json",
    ],
  ],
  [
    "node",
    [
      "scripts/certify_davis_incidence.mjs",
      "tests/fixtures/generated/A3_sage_radius_6.json",
    ],
  ],
  [
    "node",
    [
      "scripts/benchmark_catalogue.mjs",
      "--check",
      "scripts/benchmarks/catalogue-static-v1.json",
    ],
  ],
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  return {
    command: [command, ...args],
    status: result.status,
    ok: result.status === 0,
    error: result.error?.message,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

const checks = COMMANDS.map(([command, args]) => run(command, args));
const result = {
  ok: checks.every((check) => check.ok),
  validator: "research-grade-hard-gate",
  schemaVersion: 1,
  checks,
};

// The full checker output can exceed hundreds of thousands of lines because
// several certificate tools print their complete diagnostics. Keep routine
// runs readable; request `--full` only when a passing check needs inspection.
const concise = !process.argv.includes("--full");
const reported = concise
  ? {
      ...result,
      checks: checks.map((check) => ({
        command: check.command,
        status: check.status,
        ok: check.ok,
        ...(check.error ? { error: check.error } : {}),
        ...(!check.ok && check.stderr
          ? { stderrTail: check.stderr.slice(-2_000) }
          : {}),
        ...(!check.ok && check.stdout
          ? { stdoutTail: check.stdout.slice(-2_000) }
          : {}),
      })),
    }
  : result;

console.log(`${JSON.stringify(reported, null, 2)}\n`);

if (!result.ok) {
  process.exitCode = 1;
}
