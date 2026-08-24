import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("optional exact exporter tooling", () => {
  it("defines the shared generated JSON contract", () => {
    const contract = JSON.parse(
      readWorkspaceFile("scripts/exact_export_contract.json"),
    ) as {
      browserAvailability: boolean;
      cli: {
        inspectionArguments: string[];
        optionalArguments: string[];
        requiredArguments: string[];
      };
      output: {
        requiredFields: string[];
        metadata: {
          deduplication: string[];
          requiredFields: string[];
          backendRequiredFields: string[];
          capStatusRequiredFields: string[];
          completenessRequiredFields: string[];
          certificationRequiredFields: string[];
          normalFormRecordsRequiredFields: string[];
          relationProofSummariesRequiredFields: string[];
        };
      };
      exporters: Array<{ id: string; status: string }>;
    };

    expect(contract.browserAvailability).toBe(false);
    expect(contract.cli.requiredArguments).toEqual([
      "--input <coxeter-system.json>",
      "--radius <nonnegative-integer>",
      "--output <generated-ball.json>",
    ]);
    expect(contract.cli.optionalArguments).toContain(
      "--created-at <iso-timestamp>",
    );
    expect(contract.cli.optionalArguments).toContain(
      "--gap-executable <path-or-command>",
    );
    expect(contract.cli.optionalArguments).toContain(
      "--gap-timeout <positive-integer>",
    );
    expect(contract.cli.inspectionArguments).toContain(
      "--certify-output <generated-ball.json>...",
    );
    expect(contract.output.requiredFields).toEqual([
      "systemName",
      "rank",
      "nodes",
      "edges",
      "twoCells",
      "metadata",
    ]);
    expect(contract.output.metadata.deduplication).toEqual([
      "external-sage",
      "external-gap-kbmag",
    ]);
    expect(contract.output.metadata.requiredFields).toContain(
      "generatorConvention",
    );
    expect(contract.output.metadata.requiredFields).toEqual(
      expect.arrayContaining([
        "backend",
        "capStatus",
        "completeness",
        "certification",
        "normalFormRecords",
        "relationProofSummaries",
      ]),
    );
    expect(contract.output.metadata.backendRequiredFields).toContain("version");
    expect(contract.output.metadata.backendRequiredFields).toContain("command");
    expect(contract.output.metadata.backendRequiredFields).toContain("input");
    expect(contract.output.metadata.capStatusRequiredFields).toEqual([
      "radiusCapped",
      "nodeCapHit",
      "edgeCapHit",
      "truncated",
    ]);
    expect(contract.output.metadata.completenessRequiredFields).toContain(
      "requestedBallComplete",
    );
    expect(contract.output.metadata.certificationRequiredFields).toContain(
      "diagnostics",
    );
    expect(contract.output.metadata.normalFormRecordsRequiredFields).toContain(
      "lengthMultiset",
    );
    expect(
      contract.output.metadata.relationProofSummariesRequiredFields,
    ).toContain("summaries");
    expect(contract.exporters).toEqual([
      expect.objectContaining({
        id: "sageExportBackend",
        status: "implemented-local-cli",
      }),
      expect.objectContaining({
        id: "gapKbmagExportBackend",
        status: "implemented-finite-spherical-cli",
      }),
    ]);
  });

  it("exposes package scripts for GAP export, certification, and benchmarks", () => {
    const packageJson = JSON.parse(readWorkspaceFile("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["exact:gap:i2-5"]).toContain(
      "scripts/run_gap_export.mjs",
    );
    expect(packageJson.scripts["exact:gap:a3"]).toContain(
      "scripts/run_gap_export.mjs",
    );
    expect(packageJson.scripts["certify:gap:i2-5"]).toContain(
      "--certify-output",
    );
    expect(packageJson.scripts["certify:compact-5-cube"]).toContain(
      "certify_compact_5_cube.py",
    );
    expect(packageJson.scripts["certify:compact-5-prism"]).toContain(
      "certify_compact_5_prism.py",
    );
    expect(packageJson.scripts["certify:compact-5-prism-family"]).toContain(
      "certify_compact_5_prism_family.py",
    );
    expect(
      packageJson.scripts["check:coxiter:compact-5-polytope-p1"],
    ).toContain("compact_5_polytope_p1_double_makarov.json");
    expect(packageJson.scripts["check:coxiter:compact-5-prism-p2"]).toContain(
      "compact_5_prism_makarov_p2.json",
    );
    expect(packageJson.scripts["check:independent"]).toContain(
      "check_independent.mjs",
    );
    expect(packageJson.scripts["validate:research-grade"]).toContain(
      "validate_research_grade.mjs",
    );
    expect(packageJson.scripts["bench:timed"]).toContain("benchmark_timed.mjs");
    expect(packageJson.scripts["bench:timed:check"]).toContain("--check");
    expect(packageJson.scripts["bench:timed:machine:check"]).toContain(
      "benchmark_machine.mjs",
    );
    expect(packageJson.scripts["bench:timed:hard-gate"]).toContain(
      "--hard-gates",
    );
    expect(packageJson.scripts["bench:timed:hard-gate"]).toContain(
      "--machine-class ci-linux-standard",
    );
    expect(packageJson.scripts["bench:catalogue:check"]).toContain("--check");
    expect(packageJson.scripts["bench:catalogue:write"]).toContain("--write");
    expect(packageJson.scripts["cover:discover"]).toContain(
      "torsion_free_discovery.py",
    );
    expect(packageJson.scripts["cover:discover:self-test"]).toContain(
      "--self-test",
    );
    expect(packageJson.scripts["cover:discover:finite-image"]).toContain(
      "torsion_free_finite_image.py",
    );
    expect(
      packageJson.scripts["cover:discover:finite-image:self-test"],
    ).toContain("--pure-self-test");
    expect(packageJson.scripts["cover:discover:packed:self-test"]).toContain(
      "packed_composite_solver.py --self-test",
    );
    expect(packageJson.scripts["cover:discover:runtime:self-test"]).toContain(
      "scripts.discovery_runtime",
    );
    expect(
      packageJson.scripts["cover:discover:runtime:self-test:wsl"],
    ).toContain("--wsl");
    expect(packageJson.scripts["cover:search:coordinated:plan"]).toContain(
      "coordinated_cover_search.py",
    );
    expect(packageJson.scripts["cover:search:finite-target:plan"]).toContain(
      "finite_target_synthesis.py",
    );
    expect(packageJson.scripts["cover:search:everitt:plan"]).toContain(
      "everitt_composite_portfolio.py",
    );
    expect(packageJson.scripts["cover:search:orbifold:plan"]).toContain(
      "orbifold_cover_search.py",
    );
  });

  it("keeps the coordinated cover-search tracks on one artifact contract", () => {
    const contract = JSON.parse(
      readWorkspaceFile("scripts/coordinated_cover_search_contract.json"),
    ) as {
      $defs: {
        trackId: { enum: string[] };
        track: { properties: { status: { enum: string[] } } };
      };
    };

    expect(contract.$defs.trackId.enum).toEqual([
      "finite-target-synthesis",
      "everitt-composite-modules",
      "geometric-orbifold-cover",
    ]);
    expect(contract.$defs.track.properties.status.enum).toEqual(
      expect.arrayContaining(["planned", "candidate-found", "exhausted"]),
    );
    expect(readWorkspaceFile("scripts/coordinated_cover_search.py")).toContain(
      "regular orbits for every maximal spherical subgroup",
    );
  });

  it("keeps automatic torsion-free discovery bounded and certificate-driven", () => {
    const contract = JSON.parse(
      readWorkspaceFile("scripts/torsion_free_discovery_contract.json"),
    ) as {
      properties: {
        status: { enum: string[] };
        certificate: {
          properties: {
            criterion: { enum: string[] };
          };
        };
      };
    };
    const launcher = readWorkspaceFile("scripts/torsion_free_discovery.py");
    const gapProgram = readWorkspaceFile(
      "scripts/gap_torsion_free_discovery.g",
    );
    const finiteImage = readWorkspaceFile(
      "scripts/torsion_free_finite_image.py",
    );
    const packedSolver = readWorkspaceFile(
      "scripts/packed_composite_solver.py",
    );
    const runtimeSession = readWorkspaceFile(
      "scripts/discovery_runtime/session.py",
    );

    expect(contract.properties.status.enum).toEqual(
      expect.arrayContaining([
        "passed",
        "failed",
        "skipped",
        "exhausted",
        "timeout",
        "cancelled",
      ]),
    );
    expect(contract.properties.certificate.properties.criterion.enum).toEqual(
      expect.arrayContaining([
        "tits-prime-order-fixed-point",
        "tits-spherical-image-order",
        "tits-maximal-spherical-regular-orbits",
      ]),
    );
    expect(launcher).toContain("maximal_spherical_subsets");
    expect(launcher).toContain("completeTorsionWitnessCatalogue");
    expect(launcher).toContain("DiscoveryRuntimeSession");
    expect(launcher).toContain("cancel_file=args.cancel_file");
    expect(launcher).toContain('parser.add_argument(\n        "--cancel-file"');
    expect(runtimeSession).toContain("CancelFileMonitor");
    expect(runtimeSession).toContain("run_backend");

    const managedLadder = launcher.slice(
      launcher.indexOf("with DiscoveryRuntimeSession("),
    );
    const finiteImagePosition = managedLadder.indexOf(
      "run_finite_image_portfolio(",
    );
    const packedCompositePosition = managedLadder.indexOf(
      "run_finite_image_composite(",
    );
    const gapFallbackPosition = managedLadder.indexOf("run_gap_runtime(");
    expect(finiteImagePosition).toBeGreaterThanOrEqual(0);
    expect(packedCompositePosition).toBeGreaterThan(finiteImagePosition);
    expect(gapFallbackPosition).toBeGreaterThan(packedCompositePosition);

    expect(finiteImage).toContain("MatrixGroup");
    expect(finiteImage).toContain("spherical_orbit_certificate");
    expect(finiteImage).toContain("persist_frontier_expansion");
    expect(finiteImage).toContain('"frontierExhausted"');
    expect(finiteImage).toContain('"packedPermutationRows"');
    expect(launcher).toContain('module.get("packedPermutationRows")');
    expect(packedSolver).toContain("enumerate_diagonal_orbits");
    expect(launcher).toContain("allOrbitsOfAdmittedFactorSetsSearched");
    expect(launcher).not.toContain('"allDiagonalOrbitsSearched": True');
    expect(packedSolver).toContain("double-coset-diagonal-orbits");
    expect(packedSolver).toContain("spool_base_dir");
    const sageCongruence = readWorkspaceFile(
      "scripts/sage_congruence_torsion_free.py",
    );
    expect(sageCongruence).toContain("build_tits_generators");
    expect(sageCongruence).toContain("sphericalRestrictionChecks");
    expect(gapProgram).toContain("LowIndexSubgroupsFpGroupIterator");
    expect(gapProgram).toContain("ConjugacyClasses");
    expect(gapProgram).toContain("CoxeterViewerFixedPoints");

    const tauriConfig = JSON.parse(
      readWorkspaceFile("src-tauri/tauri.conf.json"),
    ) as { bundle: { resources: string[] } };
    expect(tauriConfig.bundle.resources).toEqual(
      expect.arrayContaining([
        "../scripts/torsion_free_discovery.py",
        "../scripts/gap_torsion_free_discovery.g",
        "../scripts/sage_congruence_torsion_free.py",
        "../scripts/torsion_free_finite_image.py",
        "../scripts/packed_composite_solver.py",
        "../scripts/discovery_runtime/**/*",
      ]),
    );
  });

  it("reports release signing and updater skips without blocking local builds", () => {
    const desktopStdout = execFileSync(
      process.execPath,
      ["scripts/release_desktop.mjs", "--check"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const desktop = JSON.parse(desktopStdout) as {
      ok: boolean;
      releaseOperations: {
        codeSigning: { status: string; note: string };
        updater: { status: string; missingEnv: string[]; note: string };
      };
    };

    expect(desktop.ok).toBe(true);
    expect(["configured", "skipped"]).toContain(
      desktop.releaseOperations.codeSigning.status,
    );
    if (desktop.releaseOperations.codeSigning.status === "skipped") {
      expect(desktop.releaseOperations.codeSigning.note).toContain("local");
    }
    expect(["configured", "skipped"]).toContain(
      desktop.releaseOperations.updater.status,
    );
    if (desktop.releaseOperations.updater.status === "skipped") {
      expect(desktop.releaseOperations.updater.missingEnv).toContain(
        "TAURI_SIGNING_PRIVATE_KEY",
      );
      expect(desktop.releaseOperations.updater.note).toContain(
        "does not fail unsigned local desktop builds",
      );
    }

    const webStdout = execFileSync(
      process.execPath,
      ["scripts/release_web.mjs", "--check"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const web = JSON.parse(webStdout) as {
      ok: boolean;
      releaseOperations: {
        codeSigning: { status: string; reason: string };
        updater: { status: string; reason: string };
      };
    };

    expect(web.ok).toBe(true);
    expect(web.releaseOperations.codeSigning).toMatchObject({
      status: "skipped",
      reason: "not-applicable",
    });
    expect(web.releaseOperations.updater).toMatchObject({
      status: "skipped",
      reason: "not-applicable",
    });
  });

  it("keeps the Sage exporter honest about runtime and implementation status", () => {
    const script = readWorkspaceFile("scripts/sage_export_backend.py");

    expect(script).toContain("--check-runtime");
    expect(script).toContain("--certify-output");
    expect(script).toContain("--contract");
    expect(script).toContain("BACKEND_VERSION");
    expect(script).toContain("sha256_file");
    expect(script).toContain("command_metadata");
    expect(script).toContain("certify_generated_ball");
    expect(script).toContain("compute_normal_form_records");
    expect(script).toContain("compute_relation_proof_summaries");
    expect(script).toContain("capStatus");
    expect(script).toContain("completeness");
    expect(script).toContain("sage.all");
    expect(script).toContain("external-sage");
    expect(script).toContain("generate_exact_cayley_ball");
    expect(script).toContain("Sage algebraic real reflection matrices");
    expect(script).toContain("deduplicated by Sage algebraic real");
  });

  it("keeps GAP and KBMAG checks outside the browser path", () => {
    const launcher = readWorkspaceFile("scripts/gap_kbmag_export_backend.py");
    const runner = readWorkspaceFile("scripts/run_gap_export.mjs");
    const gapTemplate = readWorkspaceFile("scripts/gap_kbmag_export_backend.g");

    expect(launcher).toContain("--gap-executable");
    expect(launcher).toContain("--gap-timeout");
    expect(launcher).toContain("--check-runtime");
    expect(launcher).toContain("--certify-output");
    expect(launcher).toContain("external-gap-kbmag");
    expect(launcher).toContain("missing-runtime");
    expect(launcher).toContain("finite_spherical_preflight");
    expect(launcher).toContain("run_gap_export");
    expect(launcher).toContain("gap_bootstrap_args");
    expect(launcher).toContain("compute_normal_form_records");
    expect(runner).toContain("/opt/miniforge3/envs/sage/bin/gap");
    expect(runner).toContain("missing-kbmag");
    expect(gapTemplate).toContain('LoadPackage("kbmag")');
    expect(gapTemplate).toContain("missing-kbmag");
    expect(gapTemplate).toContain("IsomorphismPermGroup");
    expect(gapTemplate).toContain("CoxeterViewerGenerate");
  });

  it("reports a GAP/KBMAG runtime skip without requiring GAP in CI", () => {
    const python = process.env.PYTHON ?? "python";
    const stdout = execFileSync(
      python,
      ["scripts/gap_kbmag_export_backend.py", "--check-runtime"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const status = JSON.parse(stdout) as {
      ok: boolean;
      backend: string;
      code?: string;
      requiredRuntime: string;
    };

    expect(status.backend).toBe("gapKbmagExportBackend");
    expect(status.requiredRuntime).toBe("GAP with KBMAG");
    if (!status.ok) {
      expect(["missing-runtime", "missing-kbmag"]).toContain(status.code);
    }
  });

  it("certifies generated graph JSON without importing Sage", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "coxeter-export-"));
    const outputPath = resolve(directory, "ball.json");
    const python = process.env.PYTHON ?? "python";

    const generatedBall = {
      systemName: "certifier fixture",
      rank: 1,
      nodes: [{ id: "e", word: [], length: 0 }],
      edges: [],
      twoCells: [],
      metadata: {
        radius: 0,
        requestedRadius: 0,
        generatorConvention: "right-multiplication",
        deduplication: "external-sage",
        backend: {
          id: "sageExportBackend",
          version: "1.0.0",
          requiredRuntime: "SageMath",
          command: {
            argv: ["scripts/sage_export_backend.py"],
            note: "Captured from sys.argv inside the exporter process.",
          },
          input: {
            path: "public/examples/I2_5.json",
            sha256: "0".repeat(64),
          },
        },
        caps: { maxRadius: 8, maxNodes: 50000, maxEdges: 200000 },
        capStatus: {
          radiusCapped: false,
          nodeCapHit: false,
          edgeCapHit: false,
          truncated: false,
        },
        completeness: {
          requestedBallComplete: true,
          effectiveRadiusBallComplete: true,
          blockingReasons: [],
          rankTwoCells: {
            allFinitePairBoundariesComplete: true,
            clippedGeneratorPairs: [],
          },
        },
        certification: {
          status: "passed",
          backend: "sageExportBackend",
          backendVersion: "1.0.0",
          diagnostics: {},
          errors: [],
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
      },
    };

    try {
      writeFileSync(outputPath, `${JSON.stringify(generatedBall, null, 2)}\n`);
      const stdout = execFileSync(
        python,
        ["scripts/sage_export_backend.py", "--certify-output", outputPath],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      const result = JSON.parse(stdout) as {
        ok: boolean;
        results: Array<{
          status: string;
          diagnostics: Record<string, boolean | number>;
        }>;
      };

      expect(result.ok).toBe(true);
      expect(result.results[0]?.status).toBe("passed");
      expect(result.results[0]?.diagnostics.metadataHasBackend).toBe(true);
      expect(result.results[0]?.diagnostics.edgeReferencesPresentNodes).toBe(
        true,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("certifies the compact 5-cube source transcription and exact Gram data", () => {
    const python = process.env.PYTHON ?? "python";
    const stdout = execFileSync(
      python,
      [
        "scripts/certify_compact_5_cube.py",
        "public/examples/compact_5_cube_gamma1.json",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const result = JSON.parse(stdout) as {
      ok: boolean;
      certificate: {
        status: string;
        backend: string;
        diagnostics: {
          gram: {
            rank: number;
            signature: { positive: number; negative: number; zero: number };
          };
          dottedValues: {
            boundary: { minimalPolynomial: number[] };
            diagonal: { minimalPolynomial: number[] };
          };
        };
      };
    };

    expect(result.ok).toBe(true);
    expect(result.certificate.status).toBe("passed");
    expect(result.certificate.backend).toBe("compact5CubeGamma1ExactChecker");
    expect(result.certificate.diagnostics.gram.rank).toBe(6);
    expect(result.certificate.diagnostics.gram.signature).toEqual({
      positive: 5,
      negative: 1,
      zero: 4,
    });
    expect(
      result.certificate.diagnostics.dottedValues.boundary.minimalPolynomial,
    ).toEqual([4, -2, -3]);
    expect(
      result.certificate.diagnostics.dottedValues.diagonal.minimalPolynomial,
    ).toEqual([16, 0, -20, 0, 3]);
  });

  it("certifies the ideal 3-cube geometry and S4-kernel map", () => {
    const python = process.env.PYTHON ?? "python";
    const stdout = execFileSync(
      python,
      [
        "scripts/certify_ideal_hyperbolic_3_cube.py",
        "public/examples/ideal_hyperbolic_3_cube_m3.json",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const result = JSON.parse(stdout) as {
      ok: boolean;
      certificate: {
        status: string;
        scopes: string[];
        diagnostics: {
          gram: {
            rank: number;
            signature: { positive: number; negative: number; zero: number };
          };
          polyhedron: {
            compact: boolean;
            finiteVolume: boolean;
            idealVertexCount: number;
          };
          finiteAction: {
            image: string;
            kernelIndex: number;
            kernelTorsionFree: boolean;
            sphericalRestrictionsFaithful: boolean;
          };
        };
      };
    };

    expect(result.ok).toBe(true);
    expect(result.certificate.status).toBe("passed");
    expect(result.certificate.scopes).toEqual(
      expect.arrayContaining(["geometry", "quotient-action", "torsion-free"]),
    );
    expect(result.certificate.diagnostics.gram).toEqual({
      rank: 4,
      signature: { positive: 3, negative: 1, zero: 2 },
      eigenvalues: { "3": 3, "0": 2, "-3": 1 },
    });
    expect(result.certificate.diagnostics.polyhedron).toMatchObject({
      compact: false,
      finiteVolume: true,
      idealVertexCount: 8,
    });
    expect(result.certificate.diagnostics.finiteAction).toMatchObject({
      image: "S4",
      kernelIndex: 24,
      kernelTorsionFree: true,
      sphericalRestrictionsFaithful: true,
    });
  });

  it("blocks compact 5-cube certification when the source table changes", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "coxeter-compact-cert-"));
    const outputPath = resolve(directory, "compact_5_cube_gamma1.json");
    const python = process.env.PYTHON ?? "python";

    try {
      const example = JSON.parse(
        readWorkspaceFile("public/examples/compact_5_cube_gamma1.json"),
      ) as { coxeterMatrix: Array<Array<number | string>> };
      example.coxeterMatrix[0][2] = 2;
      example.coxeterMatrix[2][0] = 2;
      writeFileSync(outputPath, `${JSON.stringify(example, null, 2)}\n`);

      const result = spawnSync(
        python,
        ["scripts/certify_compact_5_cube.py", outputPath],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      const report = JSON.parse(result.stdout) as {
        ok: boolean;
        errors: string[];
      };

      expect(result.status).not.toBe(0);
      expect(report.ok).toBe(false);
      expect(report.errors.join(" ")).toContain("coxeterMatrix");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("certifies the compact 5-prism source transcription and exact Gram data", () => {
    const python = process.env.PYTHON ?? "python";
    const result = spawnSync(
      python,
      [
        "scripts/certify_compact_5_prism.py",
        "public/examples/compact_5_prism_makarov.json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const report = JSON.parse(result.stdout) as {
      ok: boolean;
      certificate: {
        status: string;
        backend: string;
        diagnostics: {
          gram: {
            rank: number;
            signature: { positive: number; negative: number; zero: number };
          };
          dottedValue: { minimalPolynomial: number[] };
        };
      };
    };

    expect(result.status).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.certificate.status).toBe("passed");
    expect(report.certificate.backend).toBe("compact5PrismMakarovExactChecker");
    expect(report.certificate.diagnostics.gram.rank).toBe(6);
    expect(report.certificate.diagnostics.gram.signature).toEqual({
      positive: 5,
      negative: 1,
      zero: 1,
    });
    expect(
      report.certificate.diagnostics.dottedValue.minimalPolynomial,
    ).toEqual([16, 0, -28, 0, 11]);
  });

  it("emits numerical interval geometry certificates for compact examples", () => {
    const python = process.env.PYTHON ?? "python";
    const stdout = execFileSync(
      python,
      [
        "scripts/certify_geometry_intervals.py",
        "public/examples/compact_5_cube_gamma1.json",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const report = JSON.parse(stdout) as {
      ok: boolean;
      certificate: {
        status: string;
        scopes: string[];
        diagnostics: {
          passConditions: Record<string, boolean>;
          nonClaims: string[];
          factorization: {
            signature: { positive: number; negative: number; zero: number };
            residualInterval: { lower: number; upper: number };
          };
          basepoint: { maxFacetValueInterval: { upper: number } };
        };
      };
      certifiedModel: {
        coordinateType: string;
        projectionBounds: Array<{ model: string }>;
      };
    };

    expect(report.ok).toBe(true);
    expect(report.certificate.status).toBe("passed");
    expect(report.certificate.scopes).toContain("geometry-intervals");
    expect(report.certificate.diagnostics.passConditions).toEqual(
      expect.objectContaining({
        factorizationSucceeded: true,
        lorentzPreservationWithinTolerance: true,
        reflectionInvolutionWithinTolerance: true,
      }),
    );
    expect(report.certificate.diagnostics.nonClaims.join(" ")).toContain(
      "not an exact algebraic coordinate certificate",
    );
    expect(
      report.certificate.diagnostics.factorization.signature,
    ).toMatchObject({
      positive: 5,
      negative: 1,
      zero: 4,
    });
    expect(
      report.certificate.diagnostics.factorization.residualInterval.lower,
    ).toBe(0);
    expect(
      report.certificate.diagnostics.basepoint.maxFacetValueInterval.upper,
    ).toBeLessThan(0);
    expect(report.certifiedModel.coordinateType).toBe(
      "interval-certified-numeric",
    );
    expect(
      report.certifiedModel.projectionBounds.map((entry) => entry.model),
    ).toEqual(["klein", "poincare"]);
  });

  it("blocks interval geometry certification when normalGram symmetry changes", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "coxeter-geometry-cert-"));
    const outputPath = resolve(directory, "compact_5_prism_makarov.json");
    const python = process.env.PYTHON ?? "python";

    try {
      const example = JSON.parse(
        readWorkspaceFile("public/examples/compact_5_prism_makarov.json"),
      ) as {
        geometry: {
          normalGram: Array<
            Array<{ coshDistance?: number; exact?: { decimal: number } }>
          >;
        };
      };
      const dotted = example.geometry.normalGram[5][6];
      dotted.coshDistance = 1.25;
      if (dotted.exact) {
        dotted.exact.decimal = 1.25;
      }
      writeFileSync(outputPath, `${JSON.stringify(example, null, 2)}\n`);

      const result = spawnSync(
        python,
        ["scripts/certify_geometry_intervals.py", outputPath],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      const report = JSON.parse(result.stdout) as {
        ok: boolean;
        errors: string[];
      };

      expect(result.status).not.toBe(0);
      expect(report.ok).toBe(false);
      expect(report.errors.join(" ")).toContain(
        "geometry.normalGram must be symmetric",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("emits a CoxIter skipped certificate without treating it as a passed check", () => {
    const python = process.env.PYTHON ?? "python";
    const stdout = execFileSync(
      python,
      [
        "scripts/coxiter_check_compact.py",
        "public/examples/compact_5_prism_makarov.json",
        "--coxiter-executable",
        "definitely-not-coxiter",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const report = JSON.parse(stdout) as {
      ok: boolean;
      certificate: {
        status: string;
        scopes: string[];
        diagnostics: {
          diagramTranscriptionValidated: boolean;
          coxiterGraphSha256: string;
          dottedEdges: string[];
          coxiter: { status: string };
        };
      };
      coxiterInput: string;
    };

    expect(report.ok).toBe(true);
    expect(report.certificate.status).toBe("skipped");
    expect(report.certificate.scopes).toContain("coxiter-diagram");
    expect(report.certificate.diagnostics.diagramTranscriptionValidated).toBe(
      true,
    );
    expect(report.certificate.diagnostics.coxiter.status).toBe("skipped");
    expect(report.certificate.diagnostics.coxiterGraphSha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(report.certificate.diagnostics.dottedEdges).toEqual(["p5-p6"]);
    expect(report.coxiterInput).toContain("p5 p6 1 # -1.0744805708748175");
  });

  it("uses hash-matched CoxIter artifacts as passed external checks", () => {
    const python = process.env.PYTHON ?? "python";
    const stdout = execFileSync(
      python,
      [
        "scripts/coxiter_check_compact.py",
        "public/examples/compact_5_prism_makarov.json",
        "--require-external",
        "--timeout",
        "1",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const report = JSON.parse(stdout) as {
      ok: boolean;
      certificate: {
        status: string;
        diagnostics: {
          coxiter: {
            status: string;
            artifactKind?: string;
            parsed: {
              vertices: number;
              dimension: number;
              cocompact: string;
              finiteCovolume: string;
            };
          };
        };
      };
    };

    expect(report.ok).toBe(true);
    expect(report.certificate.status).toBe("passed");
    expect(report.certificate.diagnostics.coxiter.status).toBe("passed");
    if (report.certificate.diagnostics.coxiter.artifactKind !== undefined) {
      expect(report.certificate.diagnostics.coxiter.artifactKind).toBe(
        "hash-matched-stored-coxiter-output",
      );
    }
    expect(report.certificate.diagnostics.coxiter.parsed).toMatchObject({
      vertices: 7,
      dimension: 5,
      cocompact: "yes",
      finiteCovolume: "yes",
    });
  });

  it("blocks CoxIter wrapper checks when compact diagram metadata is corrupted", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "coxeter-coxiter-cert-"));
    const outputPath = resolve(directory, "compact_5_prism_makarov.json");
    const python = process.env.PYTHON ?? "python";

    try {
      const example = JSON.parse(
        readWorkspaceFile("public/examples/compact_5_prism_makarov.json"),
      ) as { rank: number };
      example.rank = 6;
      writeFileSync(outputPath, `${JSON.stringify(example, null, 2)}\n`);

      const result = spawnSync(
        python,
        [
          "scripts/coxiter_check_compact.py",
          outputPath,
          "--coxiter-executable",
          "definitely-not-coxiter",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      const report = JSON.parse(result.stdout) as {
        ok: boolean;
        errors: string[];
      };

      expect(result.status).not.toBe(0);
      expect(report.ok).toBe(false);
      expect(report.errors.join(" ")).toContain("rank must be 7");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("certifies generated graph JSON through the GAP wrapper without running GAP", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "coxeter-gap-export-"));
    const outputPath = resolve(directory, "ball.json");
    const python = process.env.PYTHON ?? "python";

    const generatedBall = {
      systemName: "gap certifier fixture",
      rank: 1,
      nodes: [{ id: "e", word: [], length: 0 }],
      edges: [],
      twoCells: [],
      metadata: {
        radius: 0,
        requestedRadius: 0,
        generatorConvention: "right-multiplication",
        deduplication: "external-gap-kbmag",
        backend: {
          id: "gapKbmagExportBackend",
          version: "1.0.0",
          requiredRuntime: "GAP with KBMAG",
          command: {
            argv: ["scripts/gap_kbmag_export_backend.py"],
            note: "Captured from sys.argv inside the exporter process.",
          },
          input: {
            path: "public/examples/I2_5.json",
            sha256: "0".repeat(64),
          },
        },
        caps: { maxRadius: 8, maxNodes: 50000, maxEdges: 200000 },
        capStatus: {
          radiusCapped: false,
          nodeCapHit: false,
          edgeCapHit: false,
          truncated: false,
        },
        completeness: {
          requestedBallComplete: true,
          effectiveRadiusBallComplete: true,
          blockingReasons: [],
          rankTwoCells: {
            allFinitePairBoundariesComplete: true,
            clippedGeneratorPairs: [],
          },
        },
        certification: {
          status: "passed",
          backend: "gapKbmagExportBackend",
          backendVersion: "1.0.0",
          diagnostics: {},
          errors: [],
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
      },
    };

    try {
      writeFileSync(outputPath, `${JSON.stringify(generatedBall, null, 2)}\n`);
      const stdout = execFileSync(
        python,
        ["scripts/gap_kbmag_export_backend.py", "--certify-output", outputPath],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      const result = JSON.parse(stdout) as {
        ok: boolean;
        backend: string;
        results: Array<{
          backend: string;
          status: string;
          diagnostics: Record<string, boolean | number>;
        }>;
      };

      expect(result.ok).toBe(true);
      expect(result.backend).toBe("gapKbmagExportBackend");
      expect(result.results[0]?.backend).toBe("gapKbmagExportBackend");
      expect(result.results[0]?.status).toBe("passed");
      expect(result.results[0]?.diagnostics.metadataHasBackend).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps bundled GAP fixtures in parity with Sage fixtures", () => {
    const pairs = [
      ["A2_sage_radius_3.json", "A2_gap_radius_3.json"],
      ["I2_5_sage_radius_5.json", "I2_5_gap_radius_5.json"],
      ["A3_sage_radius_6.json", "A3_gap_radius_6.json"],
    ];

    for (const [sageFile, gapFile] of pairs) {
      const sage = JSON.parse(
        readWorkspaceFile(`tests/fixtures/generated/${sageFile}`),
      ) as {
        nodes: unknown[];
        edges: unknown[];
        twoCells: unknown[];
      };
      const gap = JSON.parse(
        readWorkspaceFile(`tests/fixtures/generated/${gapFile}`),
      ) as {
        nodes: unknown[];
        edges: unknown[];
        twoCells: unknown[];
        metadata: { deduplication: string; certification: { status: string } };
      };

      expect(gap.metadata.deduplication).toBe("external-gap-kbmag");
      expect(gap.metadata.certification.status).toBe("passed");
      expect(gap.nodes).toHaveLength(sage.nodes.length);
      expect(gap.edges).toHaveLength(sage.edges.length);
      expect(gap.twoCells).toHaveLength(sage.twoCells.length);
    }
  });

  it("writes a deterministic backend parity report", () => {
    const stdout = execFileSync(
      process.execPath,
      ["scripts/compare_backends.mjs"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const report = JSON.parse(stdout) as {
      ok: boolean;
      reportName: string;
      comparedPairs: number;
      pairs: Array<{
        ok: boolean;
        systemName: string;
        sourceInputHashes: { equal: boolean };
        generatorEdgeClosure: {
          sage: { complete: boolean };
          gap: { complete: boolean };
        };
        normalFormChecks: Record<string, boolean>;
      }>;
    };

    expect(report.ok).toBe(true);
    expect(report.reportName).toBe("coxeter-viewer-backend-parity");
    expect(report.comparedPairs).toBeGreaterThanOrEqual(3);
    expect(report.pairs.map((pair) => pair.systemName)).toEqual(
      expect.arrayContaining(["A2", "A3", "I2(5)"]),
    );
    for (const pair of report.pairs) {
      expect(pair.ok).toBe(true);
      expect(pair.sourceInputHashes.equal).toBe(true);
      expect(pair.generatorEdgeClosure.sage.complete).toBe(true);
      expect(pair.generatorEdgeClosure.gap.complete).toBe(true);
      expect(Object.values(pair.normalFormChecks).every(Boolean)).toBe(true);
    }
  });

  it("fails backend parity when a fixture is corrupted", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "coxeter-parity-"));
    const sagePath = resolve(directory, "A2_sage_radius_3.json");
    const gapPath = resolve(directory, "A2_gap_radius_3.json");

    try {
      const sage = JSON.parse(
        readWorkspaceFile("tests/fixtures/generated/A2_sage_radius_3.json"),
      );
      const gap = JSON.parse(
        readWorkspaceFile("tests/fixtures/generated/A2_gap_radius_3.json"),
      ) as { edges: unknown[] };
      gap.edges = gap.edges.slice(1);
      writeFileSync(sagePath, `${JSON.stringify(sage, null, 2)}\n`);
      writeFileSync(gapPath, `${JSON.stringify(gap, null, 2)}\n`);

      const result = spawnSync(
        process.execPath,
        ["scripts/compare_backends.mjs", "--pair", sagePath, gapPath],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      const report = JSON.parse(result.stdout) as {
        ok: boolean;
        pairs: Array<{ errors: string[] }>;
      };

      expect(result.status).toBe(1);
      expect(report.ok).toBe(false);
      expect(report.pairs[0]?.errors.join(" ")).toContain("edges differ");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("stores deterministic catalogue benchmark output separately from timing", () => {
    const benchmarkScript = readWorkspaceFile(
      "scripts/benchmark_catalogue.mjs",
    );
    const stored = JSON.parse(
      readWorkspaceFile("scripts/benchmarks/catalogue-static-v1.json"),
    ) as {
      benchmark: string;
      elapsedMs?: number;
      totals: {
        examples: number;
        generated: number;
        generatedNodes: number;
        generatedEdges: number;
        generatedTwoCells: number;
      };
    };

    expect(benchmarkScript).toContain("--write");
    expect(benchmarkScript).toContain("--check");
    expect(benchmarkScript).toContain("elapsedMs");
    expect(stored.benchmark).toBe("catalogue-static-v1");
    expect(stored.elapsedMs).toBeUndefined();
    expect(stored.totals).toMatchObject({
      examples: 27,
      generated: 6,
      generatedNodes: 80,
      generatedEdges: 104,
      generatedTwoCells: 32,
    });
  });

  it("runs the standalone virtual-fibering certificate validator", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/validate_virtual_fibering.mjs", "--self-test"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const report = JSON.parse(result.stdout) as {
      valid: boolean;
      tamperCheck: boolean;
      checks: Record<string, boolean>;
    };

    expect(result.status).toBe(0);
    expect(report.valid).toBe(true);
    expect(report.tamperCheck).toBe(true);
    expect(Object.values(report.checks).every(Boolean)).toBe(true);
  });
});

describe("release orientation documentation", () => {
  it("keeps the README front door organized around first-user questions", () => {
    const readme = readWorkspaceFile("README.md");

    for (const heading of [
      "## What Is This App For?",
      "## What Can I Click First?",
      "## What Is Exact?",
      "## What Is Only A Drawing?",
      "## How Do I Run Web/Desktop?",
    ]) {
      expect(readme).toContain(heading);
    }
    for (const action of [
      "Explore a Coxeter example",
      "Find a torsion-free cover",
      "Find walls in bar X",
      "Coorient walls",
      "Inspect exactness and data status",
    ]) {
      expect(readme).toContain(action);
    }
  });

  it("documents visual vocabulary, walkthroughs, UI map, and limits", () => {
    const glossary = readWorkspaceFile("docs/glossary.md");
    const walkthroughs = readWorkspaceFile("docs/walkthroughs.md");
    const uiMap = readWorkspaceFile("docs/ui-map.md");
    const limits = readWorkspaceFile("docs/known-limits.md");

    for (const term of [
      "Cayley graph",
      "Davis cell",
      "`hat X`",
      "`bar X`",
      "Wall Coorientation",
      "Lawful Cell",
      "Gamma",
      "Geometric Projection",
    ]) {
      expect(glossary).toContain(term);
    }
    for (const walkthrough of [
      "Find A Rank-Two Cell",
      "Build hat X From I2(5)",
      "Compress hat X To bar X",
      "Find The Walls Of bar X",
      "Coorient Walls And Read A Lawful Cell",
      "Inspect Ascending And Descending Links",
    ]) {
      expect(walkthroughs).toContain(walkthrough);
    }
    for (const region of [
      "Model switch",
      "Start Here + Focus controls",
      "Inspector",
      "Caveats drawer",
      "Research tools",
      "Export + notebook",
    ]) {
      expect(uiMap).toContain(region);
    }
    for (const limit of [
      "Dense Complexes",
      "Finite Cover Input",
      "Wall And Morse Claims",
      "Projection Caveats",
      "Non-Planar Gamma",
      "Search Limits",
      "External Tool Constraints",
    ]) {
      expect(limits).toContain(limit);
    }
  });
});
