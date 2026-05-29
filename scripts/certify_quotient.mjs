#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function rankOf(quotient) {
  return (
    quotient.sourceSystem?.rank ??
    quotient.generatorRank ??
    Math.max(-1, ...(quotient.edges ?? []).map((edge) => edge.generator)) + 1
  );
}

function vertexIds(quotient) {
  return (quotient.vertices ?? []).map((vertex) => vertex.id);
}

function finitePairs(system) {
  if (!system) {
    return [];
  }
  const pairs = [];
  for (let i = 0; i < system.rank; i += 1) {
    for (let j = i + 1; j < system.rank; j += 1) {
      const m = system.coxeterMatrix?.[i]?.[j];
      if (Number.isInteger(m)) {
        pairs.push({ pair: [i, j], m });
      }
    }
  }
  return pairs;
}

function buildActions(quotient, errors) {
  const ids = vertexIds(quotient);
  const actions = new Map(
    (quotient.permutationAction ?? []).map((action) => [
      action.generator,
      { ...action, images: { ...action.images } },
    ]),
  );

  for (let generator = 0; generator < rankOf(quotient); generator += 1) {
    if (actions.has(generator)) {
      continue;
    }
    const images = {};
    for (const id of ids) {
      const outgoing = (quotient.edges ?? []).filter(
        (edge) => edge.source === id && edge.generator === generator,
      );
      if (outgoing.length !== 1) {
        errors.push(
          `expected one outgoing edge for generator ${generator} at ${id}; found ${outgoing.length}`,
        );
      } else {
        images[id] = outgoing[0].target;
      }
    }
    actions.set(generator, { generator, images });
  }

  return actions;
}

function relationImage(start, left, right, m) {
  let current = start;
  for (let step = 0; step < m; step += 1) {
    current = left.images[current];
    current = current === undefined ? undefined : right.images[current];
  }
  return current;
}

function boundaryFromOrbit(start, first, second, m) {
  const boundary = [start];
  let current = start;
  for (let step = 0; step < 2 * m - 1; step += 1) {
    current = (step % 2 === 0 ? first : second).images[current];
    if (current === undefined) {
      break;
    }
    boundary.push(current);
  }
  return boundary;
}

function cycleKey(pair, boundary) {
  const candidates = [];
  for (const cycle of [boundary, [...boundary].reverse()]) {
    for (let shift = 0; shift < cycle.length; shift += 1) {
      candidates.push(
        cycle.slice(shift).concat(cycle.slice(0, shift)).join(">"),
      );
    }
  }
  return `${pair.join(",")}:${candidates.sort()[0] ?? ""}`;
}

function cellKey(cell) {
  return cycleKey(
    [...cell.generatorPair].sort((left, right) => left - right),
    cell.boundaryVertexIds ?? [],
  );
}

function certifyQuotient(quotient) {
  const errors = [];
  const warnings = [];
  const ids = vertexIds(quotient);
  const idSet = new Set(ids);
  const actions = buildActions(quotient, errors);
  const edgeKeys = new Set(
    (quotient.edges ?? []).map(
      (edge) => `${edge.generator}:${edge.source}->${edge.target}`,
    ),
  );
  const checks = {
    generatorRegularity: errors.length === 0,
    bijectiveActions: true,
    involutiveGenerators: true,
    edgeCompatibility: true,
    coxeterRelations: true,
    rankTwoCellCoverage: true,
    duplicateRankTwoCells: true,
  };

  for (const [generator, action] of actions) {
    const images = ids.map((id) => action.images[id]);
    if (
      images.some((image) => !idSet.has(image)) ||
      new Set(images).size !== ids.length
    ) {
      checks.bijectiveActions = false;
      errors.push(`generator ${generator} action is not a permutation`);
    }
    for (const id of ids) {
      const image = action.images[id];
      if (action.images[image] !== id) {
        checks.involutiveGenerators = false;
        errors.push(`generator ${generator} action is not involutive at ${id}`);
        break;
      }
      if (!edgeKeys.has(`${generator}:${id}->${image}`)) {
        checks.edgeCompatibility = false;
        errors.push(
          `missing directed edge for generator ${generator}: ${id}->${image}`,
        );
      }
    }
  }

  if (!quotient.sourceSystem) {
    warnings.push(
      "No source Coxeter system; finite-relation checks are limited.",
    );
  }

  for (const { pair, m } of finitePairs(quotient.sourceSystem)) {
    const left = actions.get(pair[0]);
    const right = actions.get(pair[1]);
    if (!left || !right) {
      checks.coxeterRelations = false;
      errors.push(`missing action for finite pair ${pair.join(",")}`);
      continue;
    }
    for (const id of ids) {
      if (relationImage(id, left, right, m) !== id) {
        checks.coxeterRelations = false;
        errors.push(
          `finite relation (${pair.join(",")}, m=${m}) fails at ${id}`,
        );
        break;
      }
    }
  }

  const cellsByKey = new Map();
  for (const cell of quotient.twoCells ?? []) {
    const key = cellKey(cell);
    cellsByKey.set(key, [...(cellsByKey.get(key) ?? []), cell.id]);
  }
  for (const [key, idsForKey] of cellsByKey) {
    if (idsForKey.length > 1) {
      checks.duplicateRankTwoCells = false;
      errors.push(`duplicate rank-two quotient cell ${key}`);
    }
  }

  const rankTwoOrbits = [];
  const seenOrbits = new Set();
  for (const { pair, m } of finitePairs(quotient.sourceSystem)) {
    const first = actions.get(pair[0]);
    const second = actions.get(pair[1]);
    if (!first || !second) {
      continue;
    }
    for (const id of ids) {
      const boundary = boundaryFromOrbit(id, first, second, m);
      const key = cycleKey(pair, boundary);
      if (seenOrbits.has(key)) {
        continue;
      }
      seenOrbits.add(key);
      const matchedCellIds = cellsByKey.get(key) ?? [];
      if (boundary.length !== 2 * m || matchedCellIds.length === 0) {
        checks.rankTwoCellCoverage = false;
        errors.push(`rank-two orbit ${key} has no matching two-cell`);
      }
      rankTwoOrbits.push({
        generatorPair: pair,
        m,
        orbitKey: key,
        boundaryVertexIds: boundary,
        matchedCellIds,
      });
    }
  }

  return {
    status: errors.length === 0 ? "passed" : "failed",
    method: "in-repo-permutation-action",
    checkedAt: new Date(0).toISOString(),
    generatorRank: rankOf(quotient),
    vertexCount: ids.length,
    checks,
    rankTwoOrbits,
    errors,
    warnings,
  };
}

try {
  const path = process.argv[2];
  if (!path) {
    throw new Error("Usage: node scripts/certify_quotient.mjs QUOTIENT.json");
  }
  const quotient = readJson(path);
  const schreierCertificate = certifyQuotient(quotient);
  const result = {
    ok: schreierCertificate.status === "passed",
    schemaVersion: 1,
    quotientName: quotient.name,
    schreierCertificate,
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
