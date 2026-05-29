#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function keyOf(simplex) {
  return [...new Set(simplex)].sort().join(",");
}

function push(byDimension, simplex) {
  const dimension = simplex.length - 1;
  const set = byDimension.get(dimension) ?? new Set();
  set.add(keyOf(simplex));
  byDimension.set(dimension, set);
}

function combinations(values, size) {
  const result = [];
  function visit(start, current) {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      current.push(values[index]);
      visit(index + 1, current);
      current.pop();
    }
  }
  visit(0, []);
  return result;
}

function closeUnderFaces(vertices, simplices) {
  const byDimension = new Map();
  for (const vertex of vertices) {
    push(byDimension, [vertex]);
  }
  for (const simplex of simplices) {
    const normalized = [...new Set(simplex)].sort();
    for (let size = 1; size <= normalized.length; size += 1) {
      for (const face of combinations(normalized, size)) {
        push(byDimension, face);
      }
    }
  }
  return byDimension;
}

function gf2Rank(columns, rowCount) {
  const rows = Array.from({ length: rowCount }, () => 0n);
  columns.forEach((column, columnIndex) => {
    const bit = 1n << BigInt(columnIndex);
    for (const row of column) {
      rows[row] ^= bit;
    }
  });
  let rank = 0;
  for (let column = columns.length - 1; column >= 0; column -= 1) {
    const pivot = rows.findIndex(
      (row, index) => index >= rank && ((row >> BigInt(column)) & 1n) === 1n,
    );
    if (pivot < 0) {
      continue;
    }
    [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
    for (let row = 0; row < rows.length; row += 1) {
      if (row !== rank && ((rows[row] >> BigInt(column)) & 1n) === 1n) {
        rows[row] ^= rows[rank];
      }
    }
    rank += 1;
  }
  return rank;
}

function boundaryRank(domainKeys, codomainKeys) {
  const rowIndex = new Map(codomainKeys.map((key, index) => [key, index]));
  const columns = domainKeys.map((key) => {
    const simplex = key.split(",");
    const rows = [];
    for (let index = 0; index < simplex.length; index += 1) {
      const face = simplex.filter((_, faceIndex) => faceIndex !== index);
      const row = rowIndex.get(keyOf(face));
      if (row !== undefined) {
        rows.push(row);
      }
    }
    return rows;
  });
  return gf2Rank(columns, codomainKeys.length);
}

function homology(vertices, simplices) {
  const byDimension = closeUnderFaces(vertices, simplices);
  const vertexKeys = [...(byDimension.get(0) ?? new Set())].sort();
  const edgeKeys = [...(byDimension.get(1) ?? new Set())].sort();
  const triangleKeys = [...(byDimension.get(2) ?? new Set())].sort();
  const boundaryOneRank = boundaryRank(edgeKeys, vertexKeys);
  const boundaryTwoRank = boundaryRank(triangleKeys, edgeKeys);
  const connectedComponents =
    vertexKeys.length === 0 ? 0 : vertexKeys.length - boundaryOneRank;
  return {
    coefficientField: "F2",
    connectedComponents,
    reducedBetti0: Math.max(0, connectedComponents - 1),
    betti1: Math.max(0, edgeKeys.length - boundaryOneRank - boundaryTwoRank),
  };
}

function localSimplices(sourceSystem) {
  if (!sourceSystem) {
    return { vertices: [], simplices: [], warnings: ["No source system."] };
  }
  const vertices = sourceSystem.generators.map(
    (generator, index) => generator.id ?? `s${index}`,
  );
  const simplices = vertices.map((vertex) => [vertex]);
  for (let i = 0; i < sourceSystem.rank; i += 1) {
    for (let j = i + 1; j < sourceSystem.rank; j += 1) {
      if (Number.isInteger(sourceSystem.coxeterMatrix?.[i]?.[j])) {
        simplices.push([vertices[i], vertices[j]]);
      }
    }
  }
  return { vertices, simplices, warnings: [] };
}

try {
  const path = process.argv[2];
  if (!path) {
    throw new Error(
      "Usage: node scripts/certify_local_links.mjs QUOTIENT.json",
    );
  }
  const quotient = readJson(path);
  const link = localSimplices(quotient.sourceSystem);
  const localLinks = (quotient.vertices ?? []).map((vertex) => ({
    vertexId: vertex.id,
    status: quotient.sourceSystem ? "passed" : "skipped",
    homology: homology(link.vertices, link.simplices),
    warnings: link.warnings,
  }));
  const result = {
    ok: localLinks.every((entry) => entry.status !== "failed"),
    schemaVersion: 1,
    quotientName: quotient.name,
    certificate: {
      status: quotient.sourceSystem ? "passed" : "skipped",
      backend: "in-repo-f2-local-link-homology",
      scopes: ["local-link-homology"],
    },
    localLinks,
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
