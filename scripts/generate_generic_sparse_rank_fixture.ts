#!/usr/bin/env tsx

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildGenericSparseModularRankWorkerRequest,
  certifyGenericSparseModularRank,
  type GenericSparseIntegerMatrix,
  type GenericSparseMatrixSourceBinding,
} from "../src/fibering/genericSparseModularRank";
import { canonicalSha256 } from "../src/utils/canonicalSha256";

const outputDirectory = resolve("tests/fixtures/generic-sparse-h1");
const matrixPath = resolve(outputDirectory, "rank-matrix.linbox");
const certificatePath = resolve(outputDirectory, "rank-certificate-ts.json");

const matrix: GenericSparseIntegerMatrix = {
  schemaVersion: 1,
  rowCount: 1,
  columnCount: 3,
  rows: [
    {
      row: 0,
      entries: [
        [0, "-1"],
        [1, "-1"],
        [2, "2"],
      ],
    },
  ],
};

const sourceBindings: GenericSparseMatrixSourceBinding[] = [
  { id: "action-rows", sha256: canonicalSha256({ action: 1 }) },
  // This entry is replaced with the matrix digest after request construction.
  { id: "generic-sparse-matrix", sha256: "0".repeat(64) },
  { id: "oracle-structure", sha256: canonicalSha256({ oracle: 1 }) },
  { id: "preparation", sha256: canonicalSha256({ preparation: 1 }) },
  { id: "prepared-boundary", sha256: canonicalSha256({ boundary: 1 }) },
  {
    id: "torsion-free-certificate",
    sha256: canonicalSha256({ torsionFreeCertificate: 1 }),
  },
];

const provisional = buildGenericSparseModularRankWorkerRequest({
  matrix,
  sourceBindings,
  modulusPrime: 11,
});
sourceBindings.find(
  (binding) => binding.id === "generic-sparse-matrix",
)!.sha256 = provisional.matrixDigest;
const request = buildGenericSparseModularRankWorkerRequest({
  matrix,
  sourceBindings,
  modulusPrime: 11,
});
const certificate = certifyGenericSparseModularRank(request, {
  backend: {
    name: "TypeScript fixture generator",
    version: "1",
    algorithm: "bounded sparse RREF",
  },
});

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(matrixPath, "1 3 S\n3 0 -1 1 -1 2 2\n", "ascii");
writeFileSync(
  certificatePath,
  `${JSON.stringify(certificate, null, 2)}\n`,
  "utf8",
);
