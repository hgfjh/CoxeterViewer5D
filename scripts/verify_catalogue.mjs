#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const EXAMPLE_DIR = "public/examples";
const GENERATED_DIR = "tests/fixtures/generated";
const STATUSES = new Set([
  "toy",
  "placeholder",
  "verified-source",
  "certified",
]);
const EXACT_DEDUPLICATION = new Set(["external-sage", "external-gap-kbmag"]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(errors, file, message) {
  errors.push(`${file}: ${message}`);
}

function evaluatePolynomial(coefficients, x) {
  return coefficients.reduce(
    (value, coefficient) => value * x + coefficient,
    0,
  );
}

function verifyExactReal(errors, file, location, exact) {
  if (
    !Array.isArray(exact.minimalPolynomial) ||
    exact.minimalPolynomial.length === 0
  ) {
    fail(
      errors,
      file,
      `${location}.exact.minimalPolynomial must be a nonempty array.`,
    );
  }

  if (
    !Array.isArray(exact.isolatingInterval) ||
    exact.isolatingInterval.length !== 2
  ) {
    fail(
      errors,
      file,
      `${location}.exact.isolatingInterval must be [lower, upper].`,
    );
    return;
  }

  const [lower, upper] = exact.isolatingInterval;
  if (!(lower < upper)) {
    fail(
      errors,
      file,
      `${location}.exact.isolatingInterval must be increasing.`,
    );
  }

  if (
    typeof exact.decimal !== "number" ||
    exact.decimal < lower ||
    exact.decimal > upper
  ) {
    fail(
      errors,
      file,
      `${location}.exact.decimal must lie in the isolating interval.`,
    );
  }

  const residual = Math.abs(
    evaluatePolynomial(exact.minimalPolynomial ?? [], exact.decimal),
  );
  if (residual > 1e-8) {
    fail(
      errors,
      file,
      `${location}.exact.decimal has polynomial residual ${residual}.`,
    );
  }
}

function verifyExample(errors, file, example) {
  if (!STATUSES.has(example.dataStatus)) {
    fail(
      errors,
      file,
      "dataStatus must be toy, placeholder, verified-source, or certified.",
    );
  }

  if (
    !Array.isArray(example.generators) ||
    example.generators.length !== example.rank
  ) {
    fail(errors, file, "generators length must match rank.");
  }

  const generatorIds = new Set(
    example.generators?.map((generator) => generator.id),
  );
  if (generatorIds.size !== example.generators?.length) {
    fail(errors, file, "generator ids must be unique.");
  }

  if (
    (example.dataStatus === "verified-source" ||
      example.dataStatus === "certified") &&
    (!Array.isArray(example.sourceRefs) || example.sourceRefs.length === 0)
  ) {
    fail(
      errors,
      file,
      `${example.dataStatus} examples must include sourceRefs.`,
    );
  }

  if (
    example.dataStatus === "certified" &&
    example.certificate?.status !== "passed"
  ) {
    fail(errors, file, "certified examples must include a passed certificate.");
  }

  const normalGram = example.geometry?.normalGram;
  if (normalGram !== undefined) {
    if (!Array.isArray(normalGram) || normalGram.length !== example.rank) {
      fail(errors, file, "geometry.normalGram must be a rank-by-rank matrix.");
      return;
    }

    for (let i = 0; i < normalGram.length; i += 1) {
      if (
        !Array.isArray(normalGram[i]) ||
        normalGram[i].length !== example.rank
      ) {
        fail(errors, file, `geometry.normalGram[${i}] must have length rank.`);
        continue;
      }

      for (let j = 0; j < normalGram[i].length; j += 1) {
        const entry = normalGram[i][j];
        if (entry?.exact !== undefined) {
          verifyExactReal(
            errors,
            file,
            `geometry.normalGram[${i}][${j}]`,
            entry.exact,
          );
        }
      }
    }
  }
}

function verifyGenerated(errors, file, ball) {
  if (!EXACT_DEDUPLICATION.has(ball.metadata?.deduplication)) {
    fail(
      errors,
      file,
      "generated research fixtures must use external-sage or external-gap-kbmag deduplication.",
    );
  }

  if (ball.metadata?.certification?.status !== "passed") {
    fail(
      errors,
      file,
      "generated research fixtures must preserve a passed backend certificate.",
    );
  }

  const nodeIds = new Set(ball.nodes?.map((node) => node.id));
  for (const edge of ball.edges ?? []) {
    if (!nodeIds.has(edge.source)) {
      fail(errors, file, `edge ${edge.id} source ${edge.source} is unknown.`);
    }
    if (!nodeIds.has(edge.target)) {
      fail(errors, file, `edge ${edge.id} target ${edge.target} is unknown.`);
    }
  }

  for (const cell of ball.twoCells ?? []) {
    if (cell.boundaryNodeIds?.length !== 2 * cell.m) {
      fail(errors, file, `two-cell ${cell.id} boundary length must be 2*m.`);
    }
    for (const nodeId of cell.boundaryNodeIds ?? []) {
      if (!nodeIds.has(nodeId)) {
        fail(
          errors,
          file,
          `two-cell ${cell.id} refers to unknown node ${nodeId}.`,
        );
      }
    }
  }
}

const errors = [];
const examples = readdirSync(EXAMPLE_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort();
const generated = readdirSync(GENERATED_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort();

for (const file of examples) {
  verifyExample(errors, file, readJson(join(EXAMPLE_DIR, file)));
}

for (const file of generated) {
  verifyGenerated(errors, file, readJson(join(GENERATED_DIR, file)));
}

const result = {
  ok: errors.length === 0,
  checked: {
    examples: examples.length,
    generated: generated.length,
  },
  errors,
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exitCode = 1;
}
