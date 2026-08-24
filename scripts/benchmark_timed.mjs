#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";

const DEFAULT_OUTPUT = "scripts/benchmarks/timed-browser-v1.json";
const EXTERNAL_BENCHMARK_URL = process.env.COXETER_BENCHMARK_URL;
const BENCHMARK_URL = EXTERNAL_BENCHMARK_URL ?? "http://127.0.0.1:4178/";

const MODEL_SCENARIOS = [
  {
    id: "model-switch-davis",
    label: "Davis complex",
    expected: sceneExpectation(10, 10, 1),
  },
  {
    id: "model-switch-hat-x",
    label: "hat X cover",
    expected: {
      inventory: { vertices: 10, edges: 20, cells: 10 },
      // The exact directed lifts are paired into ten geometric rails.
      rendered: { nodes: 10, edges: 10, cells: 10 },
    },
  },
  {
    id: "model-switch-bar-x",
    label: "bar X compression",
    setupModel: "Davis complex",
    expected: barXExpectation(),
  },
  {
    id: "model-switch-gamma",
    label: "Defining graph Gamma",
    expected: sceneExpectation(2, 1, 0),
  },
  {
    id: "model-switch-projection",
    label: "Projection drawing",
    expected: sceneExpectation(10, 10, 1),
  },
];

const CASE_BUDGETS = new Map([
  ["bar-x-cold", { elapsedMs: 4_500, lastGraphUpdateMs: 650 }],
  ["bar-x-warm", { elapsedMs: 2_500, lastGraphUpdateMs: 400 }],
]);

const INTERACTION_BUDGETS = new Map([
  ...MODEL_SCENARIOS.map(({ id }) => [
    id,
    { elapsedMs: 1_800, lastGraphUpdateMs: 400 },
  ]),
  ["selected-wall-flip", { elapsedMs: 1_200, lastGraphUpdateMs: 300 }],
  ["wall-search-worker", { elapsedMs: 3_000, lastGraphUpdateMs: 450 }],
  ["labels-roundtrip", { elapsedMs: 1_600, lastGraphUpdateMs: 300 }],
  ["screenshot-export", { elapsedMs: 5_000, lastGraphUpdateMs: 450 }],
  ["viewer-only-roundtrip", { elapsedMs: 1_600, lastGraphUpdateMs: 300 }],
  ["research-export", { elapsedMs: 1_800, lastGraphUpdateMs: 300 }],
  ["idle-render-count", { maxRenderCountDelta: 3 }],
]);

const FRAME_BUDGETS = {
  frameDeltaP95Ms: 180,
  frameDeltaMaxMs: 360,
};

const LONG_TASK_BUDGET_PROFILES = {
  "local-dev-laptop": {
    caseMs: 550,
    interactionMs: 300,
    screenshotMs: 500,
  },
  "ci-linux-standard": {
    caseMs: 800,
    interactionMs: 500,
    screenshotMs: 750,
  },
};

const REQUIRED_FEATURES = new Map([
  ["bar-x-cold", barXFeatureFloor()],
  ["bar-x-warm", barXFeatureFloor()],
  ["model-switch-davis", featureFloor(10, 10, 1)],
  ["model-switch-hat-x", featureFloor(10, 20, 10)],
  ["model-switch-bar-x", barXFeatureFloor()],
  ["model-switch-gamma", featureFloor(2, 1, 0)],
  ["model-switch-projection", featureFloor(10, 10, 1)],
  ["selected-wall-flip", barXFeatureFloor()],
  ["wall-search-worker", barXFeatureFloor()],
  [
    "labels-roundtrip",
    {
      ...barXFeatureFloor(),
      renderedNodeLabels: 10,
      renderedEdgeLabels: 10,
    },
  ],
  ["screenshot-export", barXFeatureFloor()],
  ["viewer-only-roundtrip", barXFeatureFloor()],
  ["research-export", barXFeatureFloor()],
]);

function sceneExpectation(vertices, edges, cells) {
  return {
    inventory: { vertices, edges, cells },
    rendered: { nodes: vertices, edges, cells },
  };
}

function barXExpectation() {
  return {
    inventory: { vertices: 10, edges: 10, cells: 1, walls: 5 },
    // The renderer keeps the ten exact dual rails and the five transverse wall
    // arcs. The midpoint nodes and arcs are drawing aids, not extra bar-X cells.
    rendered: { nodes: 20, edges: 15, cells: 1 },
  };
}

function featureFloor(vertices, edges, cells) {
  return {
    semanticVertices: vertices,
    semanticEdges: edges,
    semanticCells: cells,
  };
}

function barXFeatureFloor() {
  return {
    semanticVertices: 10,
    semanticEdges: 10,
    semanticCells: 1,
    wallCount: 5,
    renderedEdgeSegments: 15,
    renderedNodeLabels: 10,
    renderedEdgeLabels: 10,
    drawingHelperLabels: 0,
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseArgs(argv) {
  const args = {
    write: undefined,
    check: undefined,
    report: undefined,
    machineClass: "local-dev-laptop",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write" || arg === "--check") {
      args[arg.slice(2)] = argv[index + 1] ?? DEFAULT_OUTPUT;
      index += 1;
      continue;
    }
    if (arg === "--report") {
      args.report =
        argv[index + 1] ?? ".benchmark-current/timed-browser-v1.json";
      index += 1;
      continue;
    }
    if (arg === "--machine-class") {
      args.machineClass = argv[index + 1] ?? args.machineClass;
      index += 1;
      continue;
    }
    throw new Error(`unknown timed benchmark argument: ${arg}`);
  }
  if (!LONG_TASK_BUDGET_PROFILES[args.machineClass]) {
    throw new Error(
      `unknown timed benchmark machine class: ${args.machineClass}`,
    );
  }
  return args;
}

async function canReachBenchmarkUrl() {
  try {
    const response = await fetch(BENCHMARK_URL, { method: "HEAD" });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForBenchmarkUrl(timeoutMs = 60_000) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    if (await canReachBenchmarkUrl()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`benchmark server did not become ready at ${BENCHMARK_URL}`);
}

async function ensureBenchmarkServer() {
  if (EXTERNAL_BENCHMARK_URL && (await canReachBenchmarkUrl())) {
    return { dispose: async () => undefined };
  }
  const url = new URL(BENCHMARK_URL);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(
      `benchmark URL ${BENCHMARK_URL} is not reachable; start that server before running the timed benchmark`,
    );
  }
  const server = await startStaticBenchmarkServer(url);
  await waitForBenchmarkUrl();
  return { dispose: () => closeServer(server) };
}

async function startStaticBenchmarkServer(url) {
  const distRoot = resolve(process.cwd(), "dist");
  const indexPath = join(distRoot, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(
      "dist/index.html is missing; run `corepack pnpm build` before the timed benchmark",
    );
  }

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", BENCHMARK_URL);
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const candidate = resolve(
      distRoot,
      decodedPath === "/" ? "index.html" : decodedPath.slice(1),
    );
    const relativePath = relative(distRoot, candidate);
    const insideDist =
      relativePath !== "" &&
      !relativePath.startsWith("..") &&
      !resolve(relativePath).startsWith("\\\\");
    const filePath =
      insideDist && isReadableFile(candidate) ? candidate : indexPath;
    response.setHeader("content-type", contentTypeFor(filePath));
    response.end(readFileSync(filePath));
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(Number(url.port || "4178"), url.hostname, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return server;
}

function isReadableFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

async function closeServer(server) {
  await new Promise((resolveClose) => server.close(resolveClose));
}

function contentTypeFor(path) {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".html":
    default:
      return "text/html; charset=utf-8";
  }
}

async function snapshotScene(page) {
  return page.evaluate(() => {
    const stats = globalThis.__coxeterSceneStats ?? {};
    const inventory = {};
    for (const stat of globalThis.document.querySelectorAll(
      ".stats-row .stat",
    )) {
      const label = stat.querySelector("span")?.textContent?.trim();
      const value = Number(stat.querySelector("strong")?.textContent?.trim());
      if (label && Number.isFinite(value)) inventory[label] = value;
    }
    const model = [
      ...globalThis.document.querySelectorAll(
        '[aria-label="Mathematical model"] button',
      ),
    ]
      .find((button) => button.getAttribute("aria-pressed") === "true")
      ?.textContent?.trim();
    const renderedNodeLabels = Number(stats.renderedNodeLabels ?? 0);
    const renderedEdgeLabels = Number(stats.renderedEdgeLabels ?? 0);
    const semanticVertices = Number(inventory.Vertices ?? 0);
    const semanticEdges = Number(inventory.Edges ?? 0);
    const semanticCells = Number(inventory.Cells ?? 0);
    const wallCount = Number(inventory.Walls ?? 0);
    // A selected wall may have one meaningful W_i annotation. Labels on
    // midpoint helper nodes or additional wall-segment helpers are forbidden.
    const allowedWallAnnotations = wallCount > 0 ? 1 : 0;
    const drawingHelperLabels =
      Math.max(0, renderedNodeLabels - semanticVertices) +
      Math.max(0, renderedEdgeLabels - semanticEdges - allowedWallAnnotations);
    return {
      model: model ?? "",
      semanticVertices,
      semanticEdges,
      semanticCells,
      wallCount,
      drawingHelperLabels,
      renderedNodes: Number(stats.renderedNodes ?? 0),
      renderedEdgeSegments: Number(stats.renderedEdgeSegments ?? 0),
      renderedCells: Number(stats.renderedCells ?? 0),
      renderedNodeLabels,
      renderedEdgeLabels,
      renderedLabelLeaders: Number(stats.renderedLabelLeaders ?? 0),
      labelRenderer: stats.labelRenderer ?? "sprite",
      pickingStrategy: stats.picking?.strategy ?? "linear",
      pickingBuildMs: Number(stats.picking?.buildMs ?? 0),
      pickingQueryMs: Number(stats.picking?.queryMs ?? 0),
      drawCalls: Number(stats.drawCalls ?? 0),
      triangles: Number(stats.triangles ?? 0),
      workerGenerationMs: Number(stats.workerGenerationMs ?? 0),
      lastGraphUpdateMs: Number(stats.lastGraphUpdateMs ?? 0),
      renderCount: Number(stats.renderCount ?? 0),
      longTaskCount: Number(stats.performanceTrace?.longTaskCount ?? 0),
      longTaskTotalMs: Number(stats.performanceTrace?.longTaskTotalMs ?? 0),
      longTaskMaxMs: Number(stats.performanceTrace?.longTaskMaxMs ?? 0),
      estimatedSceneBytes: Number(
        stats.performanceTrace?.estimatedSceneBytes ?? 0,
      ),
      frameSamples: stats.frameSamples ?? [],
      viewerOnly:
        globalThis.document
          .querySelector(".app-shell")
          ?.classList.contains("viewer-only") ?? false,
      researchExportAvailable: [
        ...globalThis.document.querySelectorAll("button"),
      ].some(
        (button) =>
          /export experiment/i.test(button.textContent ?? "") &&
          !button.disabled,
      ),
    };
  });
}

async function browserHeapBytes(page) {
  return page.evaluate(() =>
    Number(globalThis.performance?.memory?.usedJSHeapSize ?? 0),
  );
}

async function waitForScene(page, expected, modelLabel) {
  try {
    await page.waitForFunction(
      ({ target, label }) => {
        const stats = globalThis.__coxeterSceneStats;
        if (!stats) return false;
        const inventory = {};
        for (const stat of globalThis.document.querySelectorAll(
          ".stats-row .stat",
        )) {
          const key = stat.querySelector("span")?.textContent?.trim();
          const value = Number(
            stat.querySelector("strong")?.textContent?.trim(),
          );
          if (key && Number.isFinite(value)) inventory[key] = value;
        }
        const activeModel = [
          ...globalThis.document.querySelectorAll(
            '[aria-label="Mathematical model"] button',
          ),
        ]
          .find((button) => button.getAttribute("aria-pressed") === "true")
          ?.textContent?.trim();
        return (
          (!label || activeModel === label) &&
          Number(inventory.Vertices ?? 0) === target.inventory.vertices &&
          Number(inventory.Edges ?? 0) === target.inventory.edges &&
          Number(inventory.Cells ?? 0) === target.inventory.cells &&
          (target.inventory.walls === undefined ||
            Number(inventory.Walls ?? 0) === target.inventory.walls) &&
          Number(stats.renderedNodes ?? 0) === target.rendered.nodes &&
          Number(stats.renderedEdgeSegments ?? 0) === target.rendered.edges &&
          Number(stats.renderedCells ?? 0) === target.rendered.cells
        );
      },
      { target: expected, label: modelLabel },
      { timeout: 30_000 },
    );
  } catch (error) {
    const actual = await snapshotScene(page);
    throw new Error(
      `scene did not reach ${modelLabel}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
      { cause: error },
    );
  }
  return snapshotScene(page);
}

async function waitForBarX(page) {
  return waitForScene(page, barXExpectation(), "bar X compression");
}

async function resetDefaultBarX(page) {
  await page.goto(BENCHMARK_URL, { waitUntil: "domcontentloaded" });
  return waitForBarX(page);
}

async function switchModel(page, modelLabel, expected) {
  const button = page
    .getByRole("group", { name: "Mathematical model" })
    .getByRole("button", { name: modelLabel, exact: true });
  await button.click();
  await button.waitFor({ state: "visible" });
  return waitForScene(page, expected, modelLabel);
}

async function startLongTaskTrace(page) {
  return page.evaluate(() => {
    globalThis.__coxeterTimedBenchmarkObserver?.disconnect?.();
    const durations = [];
    const supported = Boolean(
      globalThis.PerformanceObserver?.supportedEntryTypes?.includes("longtask"),
    );
    let observer;
    if (supported) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) durations.push(entry.duration);
      });
      observer.observe({ type: "longtask", buffered: false });
    }
    const token = `${Date.now()}-${Math.random()}`;
    globalThis.__coxeterTimedBenchmarkObserver = {
      token,
      durations,
      observer,
      disconnect() {
        observer?.disconnect();
      },
    };
    return token;
  });
}

async function finishLongTaskTrace(page, token) {
  return page.evaluate((expectedToken) => {
    const trace = globalThis.__coxeterTimedBenchmarkObserver;
    if (!trace || trace.token !== expectedToken) {
      return { supported: false, count: 0, totalMs: 0, maxMs: 0 };
    }
    for (const entry of trace.observer?.takeRecords?.() ?? []) {
      trace.durations.push(entry.duration);
    }
    trace.disconnect();
    const totalMs = trace.durations.reduce((sum, value) => sum + value, 0);
    return {
      supported: Boolean(trace.observer),
      count: trace.durations.length,
      totalMs,
      maxMs: trace.durations.length > 0 ? Math.max(...trace.durations) : 0,
    };
  }, token);
}

async function runLoadCase(page, id, cacheState, action) {
  const traceToken = await startLongTaskTrace(page).catch(() => undefined);
  const startedAt = performance.now();
  await action();
  const snapshot = await waitForBarX(page);
  const elapsedMs = performance.now() - startedAt;
  const longTasks = traceToken
    ? await finishLongTaskTrace(page, traceToken)
    : { supported: false, count: 0, totalMs: 0, maxMs: 0 };
  const result = metricsFromSnapshot(snapshot, {
    id,
    status: "measured",
    cacheState,
    elapsedMs,
    longTasks: longTasks.supported ? longTasks : undefined,
    jsHeapUsedBytes: await browserHeapBytes(page),
  });
  return result;
}

async function runInteraction(page, definition) {
  try {
    await definition.setup();
    const before = await snapshotScene(page);
    const traceToken = await startLongTaskTrace(page);
    const startedAt = performance.now();
    await definition.action(before);
    await definition.settle(before);
    const elapsedMs = performance.now() - startedAt;
    const after = await snapshotScene(page);
    const longTasks = await finishLongTaskTrace(page, traceToken);
    return metricsFromSnapshot(after, {
      id: definition.id,
      status: "measured",
      scenario: definition.scenario,
      elapsedMs,
      longTasks,
      renderCountDelta: after.renderCount - before.renderCount,
      jsHeapUsedBytes: await browserHeapBytes(page),
    });
  } catch (error) {
    return {
      id: definition.id,
      status: "failed",
      scenario: definition.scenario,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function metricsFromSnapshot(snapshot, metadata) {
  const frameTiming = frameTimingSummary(snapshot.frameSamples ?? []);
  return {
    ...metadata,
    model: snapshot.model,
    semanticVertices: snapshot.semanticVertices,
    semanticEdges: snapshot.semanticEdges,
    semanticCells: snapshot.semanticCells,
    wallCount: snapshot.wallCount,
    drawingHelperLabels: snapshot.drawingHelperLabels,
    renderedNodes: snapshot.renderedNodes,
    renderedEdgeSegments: snapshot.renderedEdgeSegments,
    renderedCells: snapshot.renderedCells,
    renderedNodeLabels: snapshot.renderedNodeLabels,
    renderedEdgeLabels: snapshot.renderedEdgeLabels,
    renderedLabelLeaders: snapshot.renderedLabelLeaders,
    labelRenderer: snapshot.labelRenderer,
    pickingStrategy: snapshot.pickingStrategy,
    pickingBuildMs: round(snapshot.pickingBuildMs),
    pickingQueryMs: round(snapshot.pickingQueryMs),
    drawCalls: snapshot.drawCalls,
    triangles: snapshot.triangles,
    workerGenerationMs: round(snapshot.workerGenerationMs),
    lastGraphUpdateMs: round(snapshot.lastGraphUpdateMs),
    longTaskCount: metadata.longTasks?.count ?? snapshot.longTaskCount,
    longTaskTotalMs: round(
      metadata.longTasks?.totalMs ?? snapshot.longTaskTotalMs,
    ),
    longTaskMaxMs: round(metadata.longTasks?.maxMs ?? snapshot.longTaskMaxMs),
    estimatedSceneBytes: snapshot.estimatedSceneBytes,
    jsHeapUsedBytes: metadata.jsHeapUsedBytes ?? 0,
    elapsedMs: round(metadata.elapsedMs ?? 0),
    ...frameTiming,
  };
}

function round(value) {
  return Number(Number(value ?? 0).toFixed(3));
}

async function modelInteractions(page) {
  const results = [];
  for (const scenario of MODEL_SCENARIOS) {
    results.push(
      await runInteraction(page, {
        id: scenario.id,
        scenario: { action: "switch model", target: scenario.label },
        setup: async () => {
          await resetDefaultBarX(page);
          if (scenario.setupModel) {
            await switchModel(
              page,
              scenario.setupModel,
              sceneExpectation(10, 10, 1),
            );
          }
        },
        action: async () => {
          await page
            .getByRole("group", { name: "Mathematical model" })
            .getByRole("button", { name: scenario.label, exact: true })
            .click();
        },
        settle: async () => {
          await waitForScene(page, scenario.expected, scenario.label);
        },
      }),
    );
  }
  return results;
}

async function runWallFlipInteraction(page) {
  return runInteraction(page, {
    id: "selected-wall-flip",
    scenario: { action: "flip selected wall", wall: "W1" },
    setup: () => resetDefaultBarX(page),
    action: async () => {
      await page.getByRole("button", { name: "Flip selected wall" }).click();
    },
    settle: async (before) => {
      await page.waitForFunction(
        (renderCount) =>
          Number(globalThis.__coxeterSceneStats?.renderCount ?? 0) >
          renderCount,
        before.renderCount,
      );
      await waitForBarX(page);
    },
  });
}

async function runWallSearchInteraction(page) {
  return runInteraction(page, {
    id: "wall-search-worker",
    scenario: { action: "find largest lawful subcomplex", execution: "worker" },
    setup: () => resetDefaultBarX(page),
    action: async () => {
      await page
        .getByRole("button", { name: "Find largest lawful subcomplex" })
        .click();
    },
    settle: async () => {
      await page.waitForFunction(() =>
        /proven optimum|best found/i.test(
          globalThis.document.body.textContent ?? "",
        ),
      );
      await waitForBarX(page);
    },
  });
}

async function runLabelsInteraction(page) {
  return runInteraction(page, {
    id: "labels-roundtrip",
    scenario: { action: "hide and restore vertex and edge labels" },
    setup: () => resetDefaultBarX(page),
    action: async () => {
      const vertexLabels = page.getByRole("checkbox", {
        name: "Show vertex labels",
      });
      const edgeLabels = page.getByRole("checkbox", {
        name: "Show edge labels",
      });
      await vertexLabels.uncheck();
      await edgeLabels.uncheck();
      await page.waitForFunction(() => {
        const stats = globalThis.__coxeterSceneStats;
        return (
          Number(stats?.renderedNodeLabels ?? -1) === 0 &&
          Number(stats?.renderedEdgeLabels ?? -1) === 0
        );
      });
      await vertexLabels.check();
      await edgeLabels.check();
    },
    settle: async () => {
      await page.waitForFunction(() => {
        const stats = globalThis.__coxeterSceneStats;
        return (
          Number(stats?.renderedNodeLabels ?? 0) >= 10 &&
          Number(stats?.renderedEdgeLabels ?? 0) >= 10
        );
      });
      await waitForBarX(page);
    },
  });
}

async function runScreenshotInteraction(page) {
  return runInteraction(page, {
    id: "screenshot-export",
    scenario: { action: "one-shot PNG export" },
    setup: () => resetDefaultBarX(page),
    action: async () => {
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export PNG" }).click();
      const download = await downloadPromise;
      const failure = await download.failure().catch(() => null);
      if (failure) throw new Error(`screenshot export failed: ${failure}`);
    },
    settle: () => waitForBarX(page),
  });
}

async function runViewerOnlyInteraction(page) {
  return runInteraction(page, {
    id: "viewer-only-roundtrip",
    scenario: { action: "enter and leave viewer-only mode" },
    setup: () => resetDefaultBarX(page),
    action: async () => {
      await page.getByRole("button", { name: "Viewer only" }).click();
      await page
        .locator(".app-shell.viewer-only")
        .waitFor({ state: "visible" });
      await page.keyboard.press("u");
    },
    settle: async () => {
      await page.waitForFunction(
        () =>
          !globalThis.document
            .querySelector(".app-shell")
            ?.classList.contains("viewer-only"),
      );
      await waitForBarX(page);
    },
  });
}

async function switchToResearchMode(page) {
  const button = page
    .getByRole("group", { name: "Interface mode" })
    .getByRole("button", { name: "Research", exact: true });
  if ((await button.getAttribute("aria-pressed")) !== "true") {
    await button.click();
  }
  await page.getByRole("button", { name: /export experiment/i }).waitFor({
    state: "visible",
  });
}

async function runResearchExportInteraction(page) {
  return runInteraction(page, {
    id: "research-export",
    scenario: { action: "verify and export research experiment bundle" },
    setup: async () => {
      await resetDefaultBarX(page);
      await switchToResearchMode(page);
    },
    action: async () => {
      const button = page.getByRole("button", { name: /export experiment/i });
      if (!(await button.isEnabled())) {
        throw new Error("research experiment export is disabled");
      }
      const downloadPromise = page.waitForEvent("download");
      await button.click();
      const download = await downloadPromise;
      const failure = await download.failure().catch(() => null);
      if (failure) throw new Error(`experiment export failed: ${failure}`);
    },
    settle: () => waitForBarX(page),
  });
}

async function runIdleInteraction(page) {
  await resetDefaultBarX(page);
  await page.waitForTimeout(150);
  const before = await snapshotScene(page);
  await page.waitForTimeout(900);
  const after = await snapshotScene(page);
  return metricsFromSnapshot(after, {
    id: "idle-render-count",
    status: "measured",
    scenario: { action: "remain idle after scene settles" },
    elapsedMs: 900,
    renderCountDelta: after.renderCount - before.renderCount,
    longTasks: { count: 0, totalMs: 0, maxMs: 0 },
    jsHeapUsedBytes: await browserHeapBytes(page),
  });
}

async function runInteractions(page) {
  return [
    ...(await modelInteractions(page)),
    await runWallFlipInteraction(page),
    await runWallSearchInteraction(page),
    await runLabelsInteraction(page),
    await runScreenshotInteraction(page),
    await runViewerOnlyInteraction(page),
    await runResearchExportInteraction(page),
    await runIdleInteraction(page),
  ];
}

function frameTimingSummary(samples) {
  const deltas = samples
    .map((sample) => Number(sample.deltaMs))
    // Demand-driven rendering intentionally leaves long idle gaps. Only
    // active render bursts belong in frame latency statistics.
    .filter((delta) => Number.isFinite(delta) && delta <= 180)
    .sort((left, right) => left - right);
  if (deltas.length === 0) {
    return {
      frameDeltaMedianMs: 0,
      frameDeltaP95Ms: 0,
      frameDeltaMaxMs: 0,
    };
  }
  return {
    frameDeltaMedianMs: round(percentile(deltas, 0.5)),
    frameDeltaP95Ms: round(percentile(deltas, 0.95)),
    frameDeltaMaxMs: round(deltas[deltas.length - 1]),
  };
}

function percentile(sortedValues, fraction) {
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * fraction) - 1),
  );
  return sortedValues[index];
}

function featureFailures(entries, kind) {
  const failures = [];
  for (const entry of entries) {
    if (entry.status === "failed") {
      failures.push(`${kind} ${entry.id} failed: ${entry.reason}`);
      continue;
    }
    const required = REQUIRED_FEATURES.get(entry.id);
    if (!required) continue;
    for (const [field, floor] of Object.entries(required)) {
      const actual = Number(entry[field] ?? 0);
      if (field === "drawingHelperLabels") {
        if (actual !== floor) {
          failures.push(`${kind} ${entry.id} ${field} ${actual} != ${floor}`);
        }
      } else if (actual < floor) {
        failures.push(`${kind} ${entry.id} ${field} ${actual} < ${floor}`);
      }
    }
  }
  return failures;
}

function budgetFailures(cases, interactions, longTaskBudgets) {
  const failures = [];
  for (const entry of cases) {
    const budget = CASE_BUDGETS.get(entry.id);
    compareBudget(failures, entry, budget, longTaskBudgets.caseMs);
    if (entry.frameDeltaP95Ms > FRAME_BUDGETS.frameDeltaP95Ms) {
      failures.push(
        `${entry.id} frame p95 ${entry.frameDeltaP95Ms}ms > ${FRAME_BUDGETS.frameDeltaP95Ms}ms`,
      );
    }
    if (entry.frameDeltaMaxMs > FRAME_BUDGETS.frameDeltaMaxMs) {
      failures.push(
        `${entry.id} frame max ${entry.frameDeltaMaxMs}ms > ${FRAME_BUDGETS.frameDeltaMaxMs}ms`,
      );
    }
  }
  for (const entry of interactions) {
    if (entry.status === "failed") continue;
    const budget = INTERACTION_BUDGETS.get(entry.id);
    const longTaskBudget =
      entry.id === "screenshot-export"
        ? longTaskBudgets.screenshotMs
        : longTaskBudgets.interactionMs;
    compareBudget(failures, entry, budget, longTaskBudget);
  }
  return failures;
}

function compareBudget(failures, entry, budget, longTaskBudget) {
  if (!budget) return;
  if (budget.elapsedMs !== undefined && entry.elapsedMs > budget.elapsedMs) {
    failures.push(
      `${entry.id} elapsed ${entry.elapsedMs}ms > ${budget.elapsedMs}ms`,
    );
  }
  if (
    budget.lastGraphUpdateMs !== undefined &&
    entry.lastGraphUpdateMs > budget.lastGraphUpdateMs
  ) {
    failures.push(
      `${entry.id} graph update ${entry.lastGraphUpdateMs}ms > ${budget.lastGraphUpdateMs}ms`,
    );
  }
  if (
    budget.maxRenderCountDelta !== undefined &&
    entry.renderCountDelta > budget.maxRenderCountDelta
  ) {
    failures.push(
      `${entry.id} render count delta ${entry.renderCountDelta} > ${budget.maxRenderCountDelta}`,
    );
  }
  if (entry.longTaskMaxMs > longTaskBudget) {
    failures.push(
      `${entry.id} long task ${entry.longTaskMaxMs}ms > ${longTaskBudget}ms`,
    );
  }
}

function structuralSignature(report) {
  return {
    cases: (report.cases ?? []).map((entry) => ({
      id: entry.id,
      status: entry.status,
      cacheState: entry.cacheState,
      model: entry.model,
      semanticVertices: entry.semanticVertices,
      semanticEdges: entry.semanticEdges,
      semanticCells: entry.semanticCells,
      wallCount: entry.wallCount,
      drawingHelperLabels: entry.drawingHelperLabels,
    })),
    interactions: (report.interactions ?? []).map((entry) => ({
      id: entry.id,
      status: entry.status,
      scenario: entry.scenario,
      model: entry.model,
    })),
  };
}

function checkOutput(path, snapshot, longTaskBudgets) {
  if (!existsSync(path)) {
    return { ok: false, message: `timed benchmark snapshot missing: ${path}` };
  }
  const expected = JSON.parse(readFileSync(path, "utf8"));
  const structureOk =
    stableJson(structuralSignature(expected)) ===
    stableJson(structuralSignature(snapshot));
  const failures = [
    ...featureFailures(snapshot.cases ?? [], "case"),
    ...featureFailures(snapshot.interactions ?? [], "interaction"),
    ...budgetFailures(
      snapshot.cases ?? [],
      snapshot.interactions ?? [],
      longTaskBudgets,
    ),
  ];
  return {
    ok: structureOk && failures.length === 0,
    message:
      structureOk && failures.length === 0
        ? "timed benchmark structure, semantic floors, and budgets pass"
        : [
            structureOk
              ? "timed benchmark structural snapshot is current"
              : "timed benchmark structural snapshot is stale",
            ...failures,
          ].join("; "),
  };
}

const args = parseArgs(process.argv.slice(2));
const longTaskBudgets = LONG_TASK_BUDGET_PROFILES[args.machineClass];
const benchmarkServer = await ensureBenchmarkServer();
const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const startedAt = performance.now();

try {
  const cases = [];
  cases.push(
    await runLoadCase(page, "bar-x-cold", "cold", async () => {
      await page.goto(BENCHMARK_URL, { waitUntil: "domcontentloaded" });
    }),
  );
  cases.push(
    await runLoadCase(page, "bar-x-warm", "warm", async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
    }),
  );
  const interactions = await runInteractions(page);
  const failures = [
    ...featureFailures(cases, "case"),
    ...featureFailures(interactions, "interaction"),
    ...budgetFailures(cases, interactions, longTaskBudgets),
  ];
  const result = {
    ok: failures.length === 0,
    benchmark: "timed-browser-v1",
    reportKind: "timed-browser-benchmark",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    benchmarkUrl: BENCHMARK_URL,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    browser: { name: "chromium", version: browser.version() },
    machineClass: args.machineClass,
    longTaskBudgets,
    buildHash: createHash("sha256")
      .update(readFileSync(resolve(process.cwd(), "dist", "index.html")))
      .digest("hex"),
    cachePolicy:
      "cold uses a fresh browser context; warm reloads the same production page with browser and persistent caches available",
    totalElapsedMs: round(performance.now() - startedAt),
    cases,
    interactions,
    failures,
  };

  // Baseline generation is deliberately gated by semantic correctness. A
  // faster screenshot with missing walls or labels is not a valid baseline.
  if (args.write && result.ok) {
    mkdirSync(dirname(args.write), { recursive: true });
    writeFileSync(args.write, stableJson(result), "utf8");
  } else if (args.write && !result.ok) {
    result.failures.push(
      "baseline was not written because feature floors failed",
    );
  }
  if (args.report) {
    mkdirSync(dirname(args.report), { recursive: true });
    writeFileSync(args.report, stableJson(result), "utf8");
  }

  const check = args.check
    ? checkOutput(args.check, result, longTaskBudgets)
    : undefined;
  const output = { ...result, ...(check ? { check } : {}) };
  console.log(stableJson(output));
  if (!result.ok || (check && !check.ok)) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  await benchmarkServer.dispose();
}
