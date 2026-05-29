#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

const DEFAULT_OUTPUT = "docs/demo-media-manifest.json";
const checkedAt = "1970-01-01T00:00:00.000Z";

const demos = [
  {
    id: "find-a-hexagon",
    title: "Find a hexagon",
    docNeedle: "Hexagon Relation",
    sourceExample: "I2_5",
    guideId: "find-a-hexagon",
    storyboardFrames: [
      "Open the relation guide.",
      "Focus an m=3 pair in a compact or finite example.",
      "Read the six alternating boundary labels.",
    ],
  },
  {
    id: "rank-three-cell",
    title: "Understand a rank-three cell",
    docNeedle: "Rank-Three Cell",
    sourceExample: "A3",
    guideId: "understand-rank-three-cell",
    storyboardFrames: [
      "Open Y_Gamma.",
      "Choose the rank-three spherical-cell lens.",
      "Orbit until square and hexagon faces share a visible edge.",
    ],
  },
  {
    id: "inspect-ygamma",
    title: "Inspect Y_Gamma",
    docNeedle: "The Base Complex `Y_Gamma`",
    sourceExample: "A3",
    guideId: "inspect-ygamma",
    storyboardFrames: [
      "Show the single base vertex and generator arrows.",
      "Turn on semantic edge labels.",
      "Toggle full 2-skeleton and topology glass mode.",
    ],
  },
  {
    id: "quotient-game",
    title: "Run a quotient/game experiment",
    docNeedle: "Quotient And Game Demo",
    sourceExample: "I2_5_identity_quotient",
    guideId: "quotient-game-experiment",
    storyboardFrames: [
      "Load the I2(5) quotient workflow.",
      "Use the s0=+1, s1=-1 cocycle preset.",
      "Inspect ascending and descending link lenses.",
      "Export a workflow bundle.",
    ],
  },
];

function parseArgs(argv) {
  const args = { write: undefined, check: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--write" || arg === "--check") {
      args[arg.slice(2)] = argv[index + 1] ?? DEFAULT_OUTPUT;
      index += 1;
      continue;
    }
    throw new Error(`unknown demo recording argument: ${arg}`);
  }
  return args;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildManifest() {
  return {
    schemaVersion: 1,
    reportKind: "coxeter-demo-media-manifest",
    checkedAt,
    status: "storyboard-ready",
    outputPolicy:
      "WebM and PNG storyboards may be generated with Playwright locally; normal build/test does not require ffmpeg or video tooling.",
    demos,
    requiredDocs: [
      "docs/walkthroughs.md",
      "docs/demo-media.md",
      "docs/glossary.md",
      "docs/exact-vs-drawing.md",
    ],
  };
}

function validateDocs(manifest) {
  const missing = manifest.requiredDocs.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(`missing demo documentation: ${missing.join(", ")}`);
  }
  const walkthroughs = readFileSync("docs/walkthroughs.md", "utf8");
  for (const demo of manifest.demos) {
    if (!walkthroughs.includes(demo.docNeedle)) {
      throw new Error(
        `docs/walkthroughs.md does not mention "${demo.docNeedle}"`,
      );
    }
  }
}

const args = parseArgs(process.argv.slice(2));
const manifest = buildManifest();
validateDocs(manifest);

if (args.write) {
  mkdirSync(dirname(args.write), { recursive: true });
  writeFileSync(args.write, stableJson(manifest));
  process.stdout.write(
    stableJson({ ok: true, status: "written", path: args.write }),
  );
  process.exit(0);
}

if (args.check) {
  if (!existsSync(args.check)) {
    throw new Error(`${args.check} is missing.`);
  }
  const existing = JSON.parse(readFileSync(args.check, "utf8"));
  if (stableJson(existing) !== stableJson(manifest)) {
    throw new Error(
      `${args.check} is stale. Run pnpm demo:record -- --write ${args.check}`,
    );
  }
  process.stdout.write(
    stableJson({ ok: true, status: "passed", path: args.check }),
  );
  process.exit(0);
}

process.stdout.write(stableJson(manifest));
