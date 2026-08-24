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
    docNeedle: "Find A Rank-Two Cell",
    sourceExample: "A2",
    guideId: "find-a-hexagon",
    media: {
      screenshot: "docs/screenshots/hexagon-a2-rank-two-m3.png",
    },
    storyboardFrames: [
      "Open A2 and switch to the rank-two-cell preset.",
      "Focus the unique m=3 pair.",
      "Read the six alternating boundary labels.",
    ],
  },
  {
    id: "build-hat-x",
    title: "Build hat X from a finite action",
    docNeedle: "Build hat X From I2(5)",
    sourceExample: "I2_5_identity_quotient",
    guideId: "inspect-finite-cover",
    media: {
      screenshot: "docs/screenshots/cover-walls-01-hat-x.png",
    },
    storyboardFrames: [
      "Load the complete I2(5) permutation action.",
      "Open the hat X cover model.",
      "Compare directed lifts, generator bigons, and relation-cell lifts.",
    ],
  },
  {
    id: "find-walls",
    title: "Find walls in bar X",
    docNeedle: "Find The Walls Of bar X",
    sourceExample: "I2_5_identity_quotient",
    guideId: "find-walls",
    media: {
      screenshot: "docs/screenshots/cover-walls-02-bar-x-walls.png",
    },
    storyboardFrames: [
      "Compress generator bigons and parallel relation lifts.",
      "Open the bar X compression model.",
      "Select an opposite-edge wall class and inspect its diagnostics.",
    ],
  },
  {
    id: "lawful-subcomplex",
    title: "Coorient walls and retain lawful cells",
    docNeedle: "Search For A Large Lawful Subcomplex",
    sourceExample: "I2_5_identity_quotient",
    guideId: "coorient-walls",
    media: {
      screenshot:
        "docs/screenshots/cover-walls-04-largest-lawful-subcomplex.png",
    },
    storyboardFrames: [
      "Flip wall coorientations and watch relation-cell lawfulness update.",
      "Run the exact search and read its optimality certificate.",
      "Inspect ascending and descending links at a compressed vertex.",
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
