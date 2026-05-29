#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const demoRequests = [
  {
    id: "i2-5-demo",
    input: "tests/fixtures/quotients/I2_5_identity_subgroup_build_request.json",
  },
  {
    id: "a3-demo",
    input: "tests/fixtures/quotients/A3_s02_subgroup_build_request.json",
  },
];

function exportFor(backend, input) {
  const result = spawnSync(
    process.execPath,
    ["scripts/run_quotient_export.mjs", "--backend", backend, "--input", input],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    return {
      ok: false,
      errors: [result.stderr || result.stdout || `${backend} export failed`],
    };
  }
  return JSON.parse(result.stdout);
}

function summarize(quotient) {
  const actionCycleSignature = (action) => {
    const seen = new Set();
    const cycles = [];
    for (const vertex of Object.keys(action.images).sort()) {
      if (seen.has(vertex)) {
        continue;
      }
      let current = vertex;
      let length = 0;
      while (!seen.has(current)) {
        seen.add(current);
        length += 1;
        current = action.images[current];
      }
      cycles.push(length);
    }
    return cycles.sort((left, right) => left - right);
  };
  const countBy = (items, keyFor) => {
    const counts = new Map();
    for (const item of items) {
      const key = keyFor(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
  };
  return {
    name: quotient.name,
    vertexCount: quotient.vertices.length,
    edgeCount: quotient.edges.length,
    cellCount: quotient.twoCells.length,
    edgesByGenerator: countBy(quotient.edges, (edge) => String(edge.generator)),
    cellsByPair: countBy(
      quotient.twoCells,
      (cell) =>
        `${cell.generatorPair[0]}-${cell.generatorPair[1]}:m${cell.m}:len${cell.boundaryVertexIds.length}`,
    ),
    actions: quotient.permutationAction?.map((action) => [
      action.generator,
      actionCycleSignature(action),
    ]),
    cocycle: quotient.game?.activeCocycleId,
  };
}

function stable(value) {
  return JSON.stringify(value);
}

const reports = [];
for (const request of demoRequests) {
  const sage = exportFor("sage", request.input);
  const gap = exportFor("gap", request.input);
  const sageSummary = sage.schemaVersion === 1 ? summarize(sage) : sage;
  const gapSummary = gap.schemaVersion === 1 ? summarize(gap) : gap;
  const match = stable(sageSummary) === stable(gapSummary);
  reports.push({
    id: request.id,
    input: request.input,
    status: match ? "passed" : "failed",
    sage: {
      vertices: sage.vertices?.length ?? 0,
      edges: sage.edges?.length ?? 0,
      cells: sage.twoCells?.length ?? 0,
    },
    gap: {
      vertices: gap.vertices?.length ?? 0,
      edges: gap.edges?.length ?? 0,
      cells: gap.twoCells?.length ?? 0,
    },
    errors: match ? [] : ["Sage and GAP quotient summaries differ."],
  });
}

const ok = reports.every((report) => report.status === "passed");
process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      checkedAt: "1970-01-01T00:00:00.000Z",
      reports,
    },
    null,
    2,
  )}\n`,
);
process.exit(ok ? 0 : 1);
