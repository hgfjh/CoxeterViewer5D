#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";
import ts from "typescript";

const argument = process.argv[2];
if (!argument) {
  process.stderr.write(
    "Usage: node scripts/validate_virtual_fibering.mjs <certificate.json|--self-test>\n",
  );
  process.exit(2);
}

try {
  const validate = await loadValidator();
  const certificate =
    argument === "--self-test"
      ? minimalConsistentFailedCertificate()
      : JSON.parse(readFileSync(argument, "utf8"));
  const validation = validate(certificate);
  const tamperCheck =
    argument === "--self-test"
      ? !validate({
          ...certificate,
          result: {
            ...certificate.result,
            virtualAlgebraicFibration: true,
          },
        }).valid
      : true;
  const valid = validation.valid && tamperCheck;
  process.stdout.write(
    `${JSON.stringify(
      {
        validator: "virtual-algebraic-fibering-certificate-validator",
        schemaVersion: 2,
        source: argument,
        ...validation,
        valid,
        ...(argument === "--self-test" ? { tamperCheck } : {}),
      },
      null,
      2,
    )}\n`,
  );
  process.exit(valid ? 0 : 1);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
}

async function loadValidator() {
  // validation.ts has type-only imports, so transpiling this one module yields
  // a standalone checker without starting Vite or a file watcher.
  const source = readFileSync("src/fibering/validation.ts", "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "validation.ts",
  }).outputText;
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
  );
  return module.validateVirtualAlgebraicFiberingCertificate;
}

function minimalConsistentFailedCertificate() {
  const checkIds = [
    "finite-cover-action",
    "torsion-free-subgroup",
    "compression-certificate",
    "finite-connected-complex",
    "affine-cell-models",
    "two-sided-walls",
    "wall-coorientation",
    "cellular-cocycle",
    "circle-valued-map",
    "schreier-presentation",
    "lawful-full-skeleton",
    "affine-morse-cells",
    "discrete-lifted-heights",
    "lawful-to-subgroup-surjection",
    "morse-links",
    "nonzero-wall-map",
    "primitive-image",
    "finite-height-band-pi1-surjection",
  ];
  const failedCheckIds = [
    "nonzero-wall-map",
    "primitive-image",
    "finite-height-band-pi1-surjection",
  ];
  return {
    schemaVersion: 2,
    kind: "virtual-algebraic-fibering-certificate",
    method: "cooriented-walls-schreier-and-pl-morse",
    status: "failed",
    source: { subgroupIndex: 1 },
    wallHomomorphism: {
      cocycle: {
        edgeValues: [],
        relationChecks: [],
        checks: { relationBoundarySumsZero: true },
        closed: true,
        failures: [],
      },
    },
    primitiveHomomorphism: {
      status: "failed",
      primitiveImage: false,
      normalizationDivisor: null,
      generatorValues: [],
      relatorChecks: [],
      presentation: { generators: [], relators: [] },
      checks: {
        everyRelatorMapsToZero: true,
        normalizedImageIsZ: false,
      },
    },
    lawfulSubcomplex: {},
    morseLinks: { vertices: [] },
    plMorse: {
      status: "failed",
      checks: checkIds.map((id) => ({
        id,
        status: failedCheckIds.includes(id) ? "failed" : "passed",
        label: id,
        detail: "Standalone validator self-test row.",
        evidence: [],
      })),
      failedCheckIds,
      missingEvidenceCheckIds: [],
      linkCertificates: [],
      conclusion: { virtualAlgebraicFibrationCertified: false },
    },
    result: {
      explicitEpimorphismToZ: false,
      finitelyGeneratedKernel: false,
      virtualAlgebraicFibration: false,
    },
  };
}
