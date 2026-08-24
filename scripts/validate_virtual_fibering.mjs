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
        schemaVersion: 1,
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
  return {
    schemaVersion: 1,
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
      checks: [
        {
          id: "nonzero-wall-map",
          status: "failed",
          label: "Nontrivial wall map",
          detail: "Self-test zero map.",
          evidence: [],
        },
      ],
      failedCheckIds: ["nonzero-wall-map"],
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
