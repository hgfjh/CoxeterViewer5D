#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function minId(ids) {
  return [...ids].sort()[0] ?? "";
}

function edgeKey(left, right) {
  return [left, right].sort().join("--");
}

function boundaryEdgeIds(cell, edges) {
  const edgeIdByKey = new Map(
    (edges ?? []).map((edge) => [edgeKey(edge.source, edge.target), edge.id]),
  );
  const ids = [];
  const boundary = cell.boundaryNodeIds ?? cell.boundaryVertexIds ?? [];
  for (let index = 0; index < boundary.length; index += 1) {
    const id = edgeIdByKey.get(
      edgeKey(boundary[index], boundary[(index + 1) % boundary.length]),
    );
    if (id) {
      ids.push(id);
    }
  }
  return ids.sort();
}

function recordsForGeneratedBall(ball) {
  const records = [];
  for (const cell of ball.twoCells ?? []) {
    records.push({
      id: `incidence:${cell.id}`,
      dimension: 2,
      rank: 2,
      generators: cell.generatorPair,
      cosetRepresentativeNodeId: minId(cell.boundaryNodeIds),
      vertexNodeIds: cell.boundaryNodeIds,
      edgeIds: boundaryEdgeIds(cell, ball.edges),
      rankTwoCellIds: [cell.id],
      faceCellIds: [],
      clipped: false,
      renderingStatus: "exact-incidence",
    });
  }
  for (const cell of ball.higherCells ?? []) {
    records.push({
      id: `incidence:${cell.id}`,
      dimension: cell.rank,
      rank: cell.rank,
      sphericalSubsetId: cell.sphericalSubsetId,
      generators: cell.generators,
      cosetRepresentativeNodeId:
        cell.coset?.representativeNodeId ?? minId(cell.nodeIds ?? []),
      vertexNodeIds: cell.incidence?.vertexNodeIds ?? cell.nodeIds ?? [],
      edgeIds: cell.incidence?.edgeIds ?? [],
      rankTwoCellIds: cell.incidence?.rankTwoCellIds ?? [],
      faceCellIds: cell.incidence?.rankTwoCellIds ?? [],
      expectedSubgroupOrder: cell.coset?.expectedSubgroupOrder,
      clipped: cell.complete !== true,
      renderingStatus: cell.rendering?.kind ?? "visual-proxy",
    });
  }
  return records;
}

function recordsForQuotient(quotient) {
  return (quotient.twoCells ?? []).map((cell) => ({
    id: `quotient-incidence:${cell.id}`,
    dimension: 2,
    rank: 2,
    generators: cell.generatorPair,
    cosetRepresentativeNodeId: minId(cell.boundaryVertexIds),
    vertexNodeIds: cell.boundaryVertexIds,
    edgeIds: cell.boundaryEdgeIds ?? [],
    rankTwoCellIds: [cell.id],
    faceCellIds: [],
    clipped: false,
    renderingStatus: "exact-incidence",
  }));
}

try {
  const path = process.argv[2];
  if (!path) {
    throw new Error(
      "Usage: node scripts/certify_davis_incidence.mjs GENERATED_OR_QUOTIENT.json",
    );
  }
  const input = readJson(path);
  const records =
    Array.isArray(input.nodes) && Array.isArray(input.edges)
      ? recordsForGeneratedBall(input)
      : recordsForQuotient(input);
  const errors = records
    .filter((record) => record.vertexNodeIds.length === 0)
    .map((record) => `${record.id} has no vertices`);
  const result = {
    ok: errors.length === 0,
    schemaVersion: 1,
    certificate: {
      status: errors.length === 0 ? "passed" : "failed",
      backend: "in-repo-davis-incidence-certifier",
      scopes: ["davis-incidence"],
      diagnostics: {
        recordCount: records.length,
        clippedCount: records.filter((record) => record.clipped).length,
      },
    },
    davisIncidence: {
      status: records.some((record) => record.clipped)
        ? "clipped"
        : records.length > 0
          ? "complete-in-ball"
          : "not-computed",
      records,
      warnings: [],
    },
    errors,
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
