#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path =
  process.argv[2] ?? "tests/fixtures/quotients/I2_5_one_vertex_quotient.json";
const text = readFileSync(path, "utf8");
const quotient = JSON.parse(text);
const supplied = quotient.torsionFreeCertificate;
const inputHash = createHash("sha256").update(text).digest("hex");

// This script is intentionally a certificate normalizer for the browser demo:
// it never invents torsion-free evidence. Missing metadata becomes a skipped
// certificate so the UI keeps manifold language disabled.
const report = {
  ok:
    supplied?.status === "passed" ||
    supplied?.status === "skipped" ||
    !supplied,
  schemaVersion: 1,
  quotientName: quotient.name,
  inputHash,
  certificate: supplied ?? {
    status: "skipped",
    method: "visible-spherical-stabilizer",
    checkedAt: "1970-01-01T00:00:00.000Z",
    checkedSphericalSubsets: [],
    witnesses: [],
    limitations: [
      "No torsion-free certificate is attached to this quotient artifact.",
    ],
    errors: [],
    warnings: [
      "Skipped torsion-free certification; external subgroup data is required for theorem-level manifold language.",
    ],
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
