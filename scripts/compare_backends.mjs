#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_FIXTURE_DIR = "tests/fixtures/generated";

function usage() {
  return [
    "Usage: node scripts/compare_backends.mjs [--fixture-dir DIR] [--pair SAGE_JSON GAP_JSON]...",
    "",
    "When no --pair arguments are provided, the script compares every",
    "*_sage_radius_R.json fixture with the matching *_gap_radius_R.json fixture.",
  ].join("\n");
}

function parseArgs(argv) {
  const pairs = [];
  let fixtureDir = DEFAULT_FIXTURE_DIR;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--fixture-dir") {
      fixtureDir = argv[index + 1];
      if (!fixtureDir) {
        throw new Error("--fixture-dir requires a directory");
      }
      index += 1;
      continue;
    }
    if (arg === "--pair") {
      const sagePath = argv[index + 1];
      const gapPath = argv[index + 2];
      if (!sagePath || !gapPath) {
        throw new Error("--pair requires SAGE_JSON and GAP_JSON");
      }
      pairs.push([sagePath, gapPath]);
      index += 2;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return { fixtureDir, pairs };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function stableCounts(values, key) {
  const counts = new Map();
  for (const value of values) {
    const item = key(value);
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

function lengthMultiset(ball) {
  return stableCounts(ball.nodes ?? [], (node) => String(node.length));
}

function nodeIds(ball) {
  return new Set((ball.nodes ?? []).map((node) => node.id));
}

function edgeSignature(edge) {
  const [left, right] = [edge.source, edge.target].sort();
  return `${edge.generator}|${left}|${right}`;
}

function edgeSet(ball) {
  return new Set((ball.edges ?? []).map(edgeSignature));
}

function cellSignature(cell) {
  const pair = Array.isArray(cell.generatorPair)
    ? cell.generatorPair.join("-")
    : "unknown";
  const boundary = [...(cell.boundaryNodeIds ?? [])].sort().join("|");
  return `${pair}|${cell.m}|${boundary}`;
}

function cellSet(ball) {
  return new Set((ball.twoCells ?? []).map(cellSignature));
}

function sortedSetValues(value) {
  return [...value].sort();
}

function compareSets(name, left, right, errors) {
  const onlyLeft = sortedSetValues(left).filter((item) => !right.has(item));
  const onlyRight = sortedSetValues(right).filter((item) => !left.has(item));
  if (onlyLeft.length > 0 || onlyRight.length > 0) {
    errors.push(`${name} differ`);
  }
  return {
    equal: onlyLeft.length === 0 && onlyRight.length === 0,
    onlySage: onlyLeft.slice(0, 10),
    onlyGap: onlyRight.slice(0, 10),
    omittedOnlySage: Math.max(0, onlyLeft.length - 10),
    omittedOnlyGap: Math.max(0, onlyRight.length - 10),
  };
}

function generatorClosure(ball) {
  const rank = ball.rank;
  const ids = nodeIds(ball);
  const incident = new Map([...ids].map((id) => [id, new Map()]));

  for (const edge of ball.edges ?? []) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      continue;
    }
    incident.get(edge.source)?.set(edge.generator, edge.target);
    incident.get(edge.target)?.set(edge.generator, edge.source);
  }

  const missing = [];
  const duplicateOrInvalid = [];
  for (const node of ball.nodes ?? []) {
    const byGenerator = incident.get(node.id) ?? new Map();
    for (let generator = 0; generator < rank; generator += 1) {
      if (!byGenerator.has(generator)) {
        missing.push(`${node.id}:s${generator}`);
      }
    }
    for (const generator of byGenerator.keys()) {
      if (!Number.isInteger(generator) || generator < 0 || generator >= rank) {
        duplicateOrInvalid.push(`${node.id}:s${generator}`);
      }
    }
  }

  return {
    complete: missing.length === 0 && duplicateOrInvalid.length === 0,
    missing: missing.slice(0, 12),
    omittedMissing: Math.max(0, missing.length - 12),
    duplicateOrInvalid: duplicateOrInvalid.slice(0, 12),
  };
}

function metadataSummary(ball) {
  const metadata = ball.metadata ?? {};
  const normalForms =
    metadata.normalForms ?? metadata.normalFormRecords?.records ?? [];
  const normalFormLengthMultiset =
    metadata.normalFormRecords?.lengthMultiset ??
    stableCounts(normalForms, (record) => String(record.length));
  const relationProofs =
    metadata.relationProofs ?? metadata.relationProofSummaries?.summaries ?? [];
  return {
    backendId: metadata.backend?.id ?? null,
    deduplication: metadata.deduplication ?? null,
    certificationStatus: metadata.certification?.status ?? null,
    inputSha256: metadata.backend?.input?.sha256 ?? null,
    normalFormRecordCount: normalForms.length,
    normalFormLengthMultiset,
    relationProofSummaryCount: relationProofs.length,
  };
}

function relationSummarySignature(summary) {
  return `${summary.generatorPair?.join("-")}|${summary.m}|${summary.expectedBoundaryLength}|${summary.completeTwoCellCount}|${summary.clipped}`;
}

function relationSummarySet(ball) {
  if (Array.isArray(ball.metadata?.relationProofs)) {
    return new Set(
      ball.metadata.relationProofs.map(
        (summary) =>
          `${summary.generatorIndices?.join("-")}|${summary.order}|${summary.status}`,
      ),
    );
  }
  return new Set(
    (ball.metadata?.relationProofSummaries?.summaries ?? []).map(
      relationSummarySignature,
    ),
  );
}

function comparePair(sagePath, gapPath) {
  const sage = readJson(sagePath);
  const gap = readJson(gapPath);
  const errors = [];

  const sageMeta = metadataSummary(sage);
  const gapMeta = metadataSummary(gap);
  if (sageMeta.deduplication !== "external-sage") {
    errors.push("Sage fixture does not use external-sage deduplication");
  }
  if (gapMeta.deduplication !== "external-gap-kbmag") {
    errors.push("GAP fixture does not use external-gap-kbmag deduplication");
  }
  if (sageMeta.certificationStatus !== "passed") {
    errors.push("Sage fixture certification did not pass");
  }
  if (gapMeta.certificationStatus !== "passed") {
    errors.push("GAP fixture certification did not pass");
  }
  if (!sageMeta.inputSha256 || sageMeta.inputSha256 !== gapMeta.inputSha256) {
    errors.push("source input hashes differ");
  }

  const counts = {
    sage: {
      nodes: sage.nodes?.length ?? 0,
      edges: sage.edges?.length ?? 0,
      twoCells: sage.twoCells?.length ?? 0,
    },
    gap: {
      nodes: gap.nodes?.length ?? 0,
      edges: gap.edges?.length ?? 0,
      twoCells: gap.twoCells?.length ?? 0,
    },
  };
  if (JSON.stringify(counts.sage) !== JSON.stringify(counts.gap)) {
    errors.push("node/edge/two-cell counts differ");
  }

  const lengthMultisets = {
    sage: lengthMultiset(sage),
    gap: lengthMultiset(gap),
  };
  if (
    JSON.stringify(lengthMultisets.sage) !== JSON.stringify(lengthMultisets.gap)
  ) {
    errors.push("length multisets differ");
  }

  const nodeComparison = compareSets(
    "node ids",
    nodeIds(sage),
    nodeIds(gap),
    errors,
  );
  const edgeComparison = compareSets(
    "edges",
    edgeSet(sage),
    edgeSet(gap),
    errors,
  );
  const cellComparison = compareSets(
    "rank-two cells",
    cellSet(sage),
    cellSet(gap),
    errors,
  );
  const relationComparison = compareSets(
    "relation proof summaries",
    relationSummarySet(sage),
    relationSummarySet(gap),
    errors,
  );

  const sageClosure = generatorClosure(sage);
  const gapClosure = generatorClosure(gap);
  if (!sageClosure.complete) {
    errors.push("Sage fixture is missing generator edge closure");
  }
  if (!gapClosure.complete) {
    errors.push("GAP fixture is missing generator edge closure");
  }

  const normalFormChecks = {
    sageRecordsMatchNodes: sageMeta.normalFormRecordCount === counts.sage.nodes,
    gapRecordsMatchNodes: gapMeta.normalFormRecordCount === counts.gap.nodes,
    sageLengthMultisetMatches:
      JSON.stringify(sageMeta.normalFormLengthMultiset) ===
      JSON.stringify(lengthMultisets.sage),
    gapLengthMultisetMatches:
      JSON.stringify(gapMeta.normalFormLengthMultiset) ===
      JSON.stringify(lengthMultisets.gap),
  };
  for (const [name, ok] of Object.entries(normalFormChecks)) {
    if (!ok) {
      errors.push(`normal-form metadata failed: ${name}`);
    }
  }

  return {
    ok: errors.length === 0,
    sagePath,
    gapPath,
    systemName: sage.systemName,
    radius: {
      sage: sage.metadata?.radius ?? null,
      gap: gap.metadata?.radius ?? null,
    },
    counts,
    lengthMultisets,
    sourceInputHashes: {
      sage: sageMeta.inputSha256,
      gap: gapMeta.inputSha256,
      equal: sageMeta.inputSha256 === gapMeta.inputSha256,
    },
    certification: {
      sage: sageMeta.certificationStatus,
      gap: gapMeta.certificationStatus,
    },
    normalFormChecks,
    relationProofSummaryCounts: {
      sage: sageMeta.relationProofSummaryCount,
      gap: gapMeta.relationProofSummaryCount,
    },
    generatorEdgeClosure: {
      sage: sageClosure,
      gap: gapClosure,
    },
    comparisons: {
      nodes: nodeComparison,
      edges: edgeComparison,
      rankTwoCells: cellComparison,
      relationProofSummaries: relationComparison,
    },
    errors,
  };
}

function discoverPairs(fixtureDir) {
  const files = readdirSync(resolve(process.cwd(), fixtureDir)).sort();
  const gapFiles = new Set(files);
  const pairs = [];
  for (const file of files) {
    const match = /^(.*)_sage_radius_(\d+)\.json$/.exec(file);
    if (!match) {
      continue;
    }
    const gapFile = `${match[1]}_gap_radius_${match[2]}.json`;
    if (gapFiles.has(gapFile)) {
      pairs.push([`${fixtureDir}/${file}`, `${fixtureDir}/${gapFile}`]);
    }
  }
  return pairs;
}

try {
  const { fixtureDir, pairs } = parseArgs(process.argv.slice(2));
  const comparisonPairs = pairs.length > 0 ? pairs : discoverPairs(fixtureDir);
  const reports = comparisonPairs.map(([sagePath, gapPath]) =>
    comparePair(sagePath, gapPath),
  );
  const result = {
    ok: reports.length > 0 && reports.every((report) => report.ok),
    schemaVersion: 1,
    reportName: "coxeter-viewer-backend-parity",
    comparedPairs: reports.length,
    pairs: reports,
    limitations: [
      "This parity report covers exported finite-spherical fixtures only.",
      "It compares deterministic generated JSON artifacts; it is not a theorem-level proof of an infinite Coxeter word problem.",
    ],
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
        reportName: "coxeter-viewer-backend-parity",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
