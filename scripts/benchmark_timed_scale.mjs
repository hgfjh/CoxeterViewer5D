// Scale scenarios for the timed browser benchmark.
//
// The core suite (benchmark_timed.mjs) pins semantics on the 10-vertex I2(5)
// default.  These scenarios exercise the sizes where interaction latency is
// actually felt: a compact 5D example at radius 8, a rapid radius drag,
// projection-mode picking, and the S4 cover of the ideal 3-cube.  Each entry
// records wall-clock time, long tasks, and the per-derivation main-thread cost
// that the app reports on window.__coxeterPerf (src/app/perfMarks.ts).

const DEFAULT_EXAMPLE_5D = "compact_5_prism_makarov";
const IDEAL_CUBE_EXAMPLE = "ideal_hyperbolic_3_cube_m3";

async function perfSnapshot(page) {
  return page.evaluate(() => structuredClone(globalThis.__coxeterPerf ?? {}));
}

function perfDelta(before, after) {
  const delta = {};
  for (const [name, entry] of Object.entries(after)) {
    const prior = before[name] ?? { count: 0, totalMs: 0 };
    const count = entry.count - prior.count;
    if (count > 0) {
      delta[name] = {
        count,
        totalMs: Number((entry.totalMs - prior.totalMs).toFixed(2)),
      };
    }
  }
  return delta;
}

async function inventory(page) {
  return page.evaluate(() => {
    const values = {};
    for (const stat of globalThis.document.querySelectorAll(
      ".stats-row .stat",
    )) {
      const label = stat.querySelector("span")?.textContent?.trim();
      const value = Number(stat.querySelector("strong")?.textContent?.trim());
      if (label && Number.isFinite(value)) values[label] = value;
    }
    return {
      vertices: values.Vertices ?? 0,
      edges: values.Edges ?? 0,
      renderCount: Number(globalThis.__coxeterSceneStats?.renderCount ?? 0),
      // The worker may still be generating a ball while the old scene is
      // displayed; "Generating radius ..." marks that state.
      generating: Boolean(
        globalThis.document.querySelector(".viewer-progress"),
      ),
    };
  });
}

/** Wait until the vertex/edge inventory and render count stop changing. */
async function settle(
  page,
  { minVertices = 1, quietMs = 400, timeoutMs = 60_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let previous = await inventory(page);
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    await page.waitForTimeout(50);
    const current = await inventory(page);
    const same =
      current.vertices === previous.vertices &&
      current.edges === previous.edges &&
      current.renderCount === previous.renderCount;
    if (!same) {
      previous = current;
      stableSince = Date.now();
    } else if (
      !current.generating &&
      current.vertices >= minVertices &&
      Date.now() - stableSince >= quietMs
    ) {
      return current;
    }
  }
  throw new Error(`scene did not settle: ${JSON.stringify(previous)}`);
}

async function setRadius(page, radius) {
  await page.evaluate((value) => {
    const input = globalThis.document.querySelector("#radius-input");
    const setter = Object.getOwnPropertyDescriptor(
      globalThis.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, radius);
}

async function clickModel(page, label) {
  await page
    .getByRole("group", { name: "Mathematical model" })
    .getByRole("button", { name: label, exact: true })
    .click();
}

export async function runScaleSuite(page, helpers) {
  const {
    benchmarkUrl,
    startLongTaskTrace,
    finishLongTaskTrace,
    browserHeapBytes,
  } = helpers;
  const results = [];

  async function scenario(id, description, setup, action, settleOptions) {
    try {
      await setup();
      const settledBefore = await settle(page);
      const perfBefore = await perfSnapshot(page);
      const token = await startLongTaskTrace(page);
      const started = Date.now();
      await action(settledBefore);
      const after = await settle(page, settleOptions);
      const elapsedMs = Date.now() - started - (settleOptions?.quietMs ?? 400);
      const longTasks = await finishLongTaskTrace(page, token);
      results.push({
        id,
        status: "measured",
        description,
        elapsedMs: Math.max(0, elapsedMs),
        vertices: after.vertices,
        edges: after.edges,
        longTaskCount: longTasks.count,
        longTaskTotalMs: Number(longTasks.totalMs.toFixed(1)),
        longTaskMaxMs: Number(longTasks.maxMs.toFixed(1)),
        jsHeapUsedBytes: await browserHeapBytes(page),
        derivations: perfDelta(perfBefore, await perfSnapshot(page)),
      });
    } catch (error) {
      results.push({
        id,
        status: "failed",
        description,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Cold start: JavaScript bytes fetched before the default scene is usable.
  await page.goto(benchmarkUrl, { waitUntil: "load" });
  await settle(page);
  results.push({
    id: "cold-start-javascript",
    status: "measured",
    description:
      "JavaScript resources loaded by the time the default scene settles",
    ...(await page.evaluate(() => {
      const scripts = performance
        .getEntriesByType("resource")
        .filter((entry) => entry.name.endsWith(".js"));
      return {
        scriptCount: scripts.length,
        decodedBytes: scripts.reduce(
          (sum, entry) => sum + entry.decodedBodySize,
          0,
        ),
        transferBytes: scripts.reduce(
          (sum, entry) => sum + entry.transferSize,
          0,
        ),
      };
    })),
  });

  const reset5D = async (radius) => {
    await page.goto(benchmarkUrl, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.selectOption("#example-select", DEFAULT_EXAMPLE_5D);
    await settle(page);
    await clickModel(page, "Davis complex");
    await settle(page);
    await setRadius(page, radius);
  };

  await scenario(
    "davis-5d-radius-8",
    "compact 5-prism, Davis complex, radius 3 -> 8",
    () => reset5D(3),
    () => setRadius(page, 8),
    { minVertices: 100 },
  );
  await scenario(
    "radius-drag-1-to-8",
    "seven radius steps fired back to back, settle at radius 8",
    () => reset5D(1),
    async () => {
      for (let radius = 2; radius <= 8; radius += 1)
        await setRadius(page, radius);
    },
    { minVertices: 100 },
  );
  await scenario(
    "projection-node-click",
    "projection drawing at radius 8, click the scene centre",
    async () => {
      await reset5D(8);
      await settle(page, { minVertices: 100 });
      await clickModel(page, "Projection drawing");
    },
    async () => {
      const box = await page.getByTestId("scene-canvas").boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    },
    { minVertices: 100 },
  );
  await scenario(
    "ideal-cube-s4-cover-switch",
    "switch to the ideal 3-cube example (builds its S4 cover)",
    async () => {
      await page.goto(benchmarkUrl, { waitUntil: "domcontentloaded" });
    },
    () => page.selectOption("#example-select", IDEAL_CUBE_EXAMPLE),
  );
  return results;
}
