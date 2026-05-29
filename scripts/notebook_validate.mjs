#!/usr/bin/env node
import { readFileSync } from "node:fs";

const paths = process.argv.slice(2);

function validateBundle(value, path) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path}: bundle must be a JSON object`);
    return errors;
  }
  if (value.schemaVersion !== 1) {
    errors.push(`${path}: schemaVersion must be 1`);
  }
  if (!Array.isArray(value.runs)) {
    errors.push(`${path}: runs must be an array`);
  }
  for (const [index, run] of (value.runs ?? []).entries()) {
    if (!run.id || !run.dataset || !run.view || !run.render) {
      errors.push(
        `${path}: run ${index} must include id, dataset, view, and render`,
      );
    }
  }
  return errors;
}

const errors = [];
for (const path of paths) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const bundles = Array.isArray(parsed) ? parsed : [parsed];
  bundles.forEach((bundle, index) =>
    errors.push(...validateBundle(bundle, `${path}#${index}`)),
  );
}

const report = {
  ok: errors.length === 0,
  checked: paths.length,
  errors,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (errors.length > 0) {
  process.exitCode = 1;
}
