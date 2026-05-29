#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function activeAssignment(quotient) {
  const game = quotient.game;
  if (!game?.assignments?.length) {
    return {
      id: "zero-fallback",
      label: "Zero fallback",
      edgeStates: (quotient.edges ?? []).map((edge) => ({
        edgeId: edge.id,
        value: 0,
      })),
      warnings: ["No imported game assignment; using the zero 1-cochain."],
    };
  }

  const assignment =
    game.assignments.find((entry) => entry.id === game.activeAssignmentId) ??
    game.assignments[0];
  if (assignment.kind === "integer-edge-labeling") {
    return {
      id: assignment.id,
      label: assignment.label ?? assignment.id,
      edgeStates: assignment.edgeStates ?? [],
      warnings: [],
    };
  }

  const generatorValues = new Map(
    (assignment.generatorStates ?? []).map((entry) => [
      entry.generator,
      entry.value,
    ]),
  );
  return {
    id: assignment.id,
    label: assignment.label ?? assignment.id,
    edgeStates: (quotient.edges ?? []).map((edge) => ({
      edgeId: edge.id,
      value: generatorValues.get(edge.generator) ?? 0,
    })),
    warnings: [],
  };
}

function validateBoundarySums(quotient, states) {
  const valueByEdge = new Map(
    states.map((state) => [state.edgeId, state.value]),
  );
  const edgeById = new Map(
    (quotient.edges ?? []).map((edge) => [edge.id, edge]),
  );
  const checks = [];
  const errors = [];

  for (const cell of quotient.twoCells ?? []) {
    const boundaryEdgeIds = cell.boundaryEdgeIds ?? [];
    let boundarySum = 0;
    const missingStateEdgeIds = [];
    const missingEdgeIds = [];
    for (const edgeId of boundaryEdgeIds) {
      const edge = edgeById.get(edgeId);
      const value = valueByEdge.get(edgeId);
      if (!edge) {
        missingEdgeIds.push(edgeId);
        continue;
      }
      if (value === undefined) {
        missingStateEdgeIds.push(edgeId);
        continue;
      }
      boundarySum += value;
    }
    const ok =
      boundaryEdgeIds.length === (cell.boundaryVertexIds ?? []).length &&
      missingEdgeIds.length === 0 &&
      missingStateEdgeIds.length === 0 &&
      boundarySum === 0;
    if (!ok) {
      errors.push(`cell "${cell.id}" failed cocycle boundary check`);
    }
    checks.push({
      cellId: cell.id,
      boundarySum,
      ok,
      missingEdgeIds,
      missingStateEdgeIds,
      expectedBoundaryLength: 2 * cell.m,
      actualBoundaryLength: boundaryEdgeIds.length,
    });
  }

  return { checks, errors };
}

try {
  const path = process.argv[2];
  if (!path) {
    throw new Error("Usage: node scripts/certify_morse.mjs QUOTIENT.json");
  }
  const quotient = readJson(path);
  const assignment = activeAssignment(quotient);
  const validation = validateBoundarySums(quotient, assignment.edgeStates);
  const certificate = {
    status: validation.errors.length === 0 ? "passed" : "failed",
    method: "in-repo-rank-two-boundary-sums",
    assignmentId: assignment.id,
    cocycleId: quotient.game?.activeCocycleId,
    checkedAt: new Date(0).toISOString(),
    cellCount: (quotient.twoCells ?? []).length,
    boundaryFailures: validation.errors,
    warnings: assignment.warnings,
  };
  const result = {
    ok: certificate.status === "passed",
    schemaVersion: 1,
    quotientName: quotient.name,
    certificate,
    checks: validation.checks,
  };
  console.log(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.log(
    `${JSON.stringify(
      {
        ok: false,
        schemaVersion: 1,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
