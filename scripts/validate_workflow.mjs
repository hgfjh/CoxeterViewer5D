#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createServer } from "vite";

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

function parseResult(result, label) {
  if (result.status !== 0) {
    return {
      ok: false,
      label,
      errors: [result.stderr || result.stdout || `${label} failed`],
    };
  }
  return JSON.parse(result.stdout);
}

function passed(id, details = {}) {
  return { id, status: "passed", ...details };
}

function failed(id, errors) {
  return { id, status: "failed", errors };
}

const checks = [];
const temp = mkdtempSync(join(tmpdir(), "coxeter-cover-wall-workflow-"));
const quotientPath = join(temp, "i2-5-identity-action.json");
const exportResult = parseResult(
  runNode([
    "scripts/run_quotient_export.mjs",
    "--backend",
    "sage",
    "--input",
    "tests/fixtures/quotients/I2_5_identity_subgroup_build_request.json",
  ]),
  "I2(5) finite-action export",
);

let vite;
try {
  if (exportResult.schemaVersion !== 1) {
    checks.push(
      failed("export-finite-action", [
        ...(exportResult.errors ?? []),
        "The exporter did not emit a schemaVersion 1 QuotientComplex.",
      ]),
    );
  } else {
    writeFileSync(quotientPath, JSON.stringify(exportResult), "utf8");
    checks.push(
      passed("export-finite-action", {
        vertices: exportResult.vertices.length,
        directedEdges: exportResult.edges.length,
        relationCells: exportResult.twoCells.length,
        backend: exportResult.backendMetadata?.backend ?? "unknown",
      }),
    );

    const quotientCertificate = parseResult(
      runNode(["scripts/certify_quotient.mjs", quotientPath]),
      "certify finite action",
    );
    checks.push({ id: "certify-finite-action", ...quotientCertificate });

    // Vite's SSR loader executes the same TypeScript modules used by the app.
    // The release gate therefore checks one implementation of the cellular
    // construction instead of maintaining a second JavaScript copy.
    vite = await createServer({
      appType: "custom",
      configFile: false,
      logLevel: "silent",
      optimizeDeps: { include: [], noDiscovery: true },
      root: process.cwd(),
      server: { middlewareMode: true },
    });
    const quotientModule = await vite.ssrLoadModule(
      "/src/quotient/validation.ts",
    );
    const compressionModule = await vite.ssrLoadModule(
      "/src/compression/construction.ts",
    );
    const wallSystemModule = await vite.ssrLoadModule(
      "/src/walls/wallSystem.ts",
    );
    const wallSearchModule = await vite.ssrLoadModule("/src/walls/search.ts");

    const quotient = quotientModule.parseQuotientComplex(exportResult);
    const cover = compressionModule.buildCoverCompression(quotient);
    checks.push(
      cover.certificate.status === "passed"
        ? passed("construct-hat-x", {
            vertices: cover.hatX.vertices.length,
            directedLiftEdges: cover.hatX.directedLiftEdges.length,
            generatorBigons: cover.hatX.generatorBigonCells.length,
            liftedRelationCells: cover.hatX.liftedRelationCells.length,
          })
        : failed("construct-hat-x", cover.certificate.errors),
    );
    checks.push(
      cover.certificate.status === "passed"
        ? passed("compress-to-bar-x", {
            vertices: cover.barX.vertices.length,
            geometricEdges: cover.barX.geometricEdges.length,
            relationCells: cover.barX.relationCells.length,
            compressionMethod: cover.certificate.method,
          })
        : failed("compress-to-bar-x", cover.certificate.errors),
    );

    const wallSystem = wallSystemModule.findWallSystem(cover.barX);
    const wallDiagnosticsPassed =
      wallSystem.diagnostics.embedded &&
      wallSystem.diagnostics.twoSided &&
      wallSystem.diagnostics.selfOsculationFree;
    checks.push(
      wallDiagnosticsPassed
        ? passed("find-walls", {
            walls: wallSystem.walls.length,
            crossingSegments: wallSystem.crossingSegments.length,
            embedded: true,
            twoSided: true,
            selfOsculationFree: true,
          })
        : failed("find-walls", [
            ...wallSystem.diagnostics.embeddednessWitnesses.map(
              (witness) => `Embeddedness witness: ${witness.kind}`,
            ),
            ...wallSystem.diagnostics.twoSidednessWitnesses.map(
              (witness) => `Two-sidedness witness: ${witness.kind}`,
            ),
            ...wallSystem.diagnostics.selfOsculationWitnesses.map(
              (witness) => `Self-osculation witness: ${witness.kind}`,
            ),
          ]),
    );

    const search = wallSearchModule.searchMaximumLawfulSubcomplex(
      cover.barX,
      wallSystem,
      {
        exactWallLimit: 22,
        nodeBudget: 2_000_000,
        timeBudgetMs: 12_000,
      },
    );
    const searchPassed =
      search.status === "optimal" &&
      search.certificate.optimalityProven &&
      search.lawfulSubcomplex?.valid === true &&
      search.coorientation?.valid === true;
    checks.push(
      searchPassed
        ? passed("search-lawful-subcomplex", {
            objectiveValue: search.objectiveValue,
            retainedCellIds: search.lawfulSubcomplex.retainedCellIds,
            lowerBound: search.certificate.lowerBound,
            upperBound: search.certificate.upperBound,
            searchedNodes: search.certificate.searchedNodes,
            optimalityProven: true,
          })
        : failed("search-lawful-subcomplex", [
            ...search.warnings,
            `Search status: ${search.status}`,
            `Termination: ${search.certificate.terminationReason}`,
          ]),
    );

    if (search.morseLinks) {
      checks.push(
        search.morseLinks.valid
          ? passed("derive-morse-links", {
              vertices: search.morseLinks.vertices.length,
              allAscendingNonempty: search.morseLinks.allAscendingNonempty,
              allDescendingNonempty: search.morseLinks.allDescendingNonempty,
              allAscendingConnected: search.morseLinks.allAscendingConnected,
              allDescendingConnected: search.morseLinks.allDescendingConnected,
            })
          : failed("derive-morse-links", search.morseLinks.errors),
      );
    } else {
      checks.push(
        failed("derive-morse-links", [
          "The lawful-subcomplex search returned no Morse-link diagnostics.",
        ]),
      );
    }
  }

  const parity = parseResult(
    runNode(["scripts/compare_quotient_backends.mjs"]),
    "compare finite-action backends",
  );
  checks.push({
    id: "compare-finite-action-backends",
    status: parity.ok ? "passed" : "failed",
    reports: parity.reports,
    errors: parity.reports?.flatMap((report) => report.errors ?? []) ?? [],
  });
} catch (error) {
  checks.push(
    failed("workflow-runtime", [
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    ]),
  );
} finally {
  await vite?.close();
}

const ok = checks.every((check) => {
  if ("ok" in check) return check.ok !== false;
  return check.status === "passed";
});

process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      checkedAt: "1970-01-01T00:00:00.000Z",
      workflow: "cover-compression-walls-i2-5",
      checks,
    },
    null,
    2,
  )}\n`,
);
process.exit(ok ? 0 : 1);
