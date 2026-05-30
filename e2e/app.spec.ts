import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";

async function firstPresent(candidates: Locator[]): Promise<Locator | null> {
  for (const candidate of candidates) {
    if ((await candidate.count()) > 0) {
      return candidate.first();
    }
  }

  return null;
}

async function firstVisible(candidates: Locator[]): Promise<Locator | null> {
  for (const candidate of candidates) {
    const count = await candidate.count();

    for (let index = 0; index < Math.min(count, 5); index += 1) {
      const option = candidate.nth(index);

      if (await option.isVisible().catch(() => false)) {
        return option;
      }
    }
  }

  return null;
}

async function textOf(locator: Locator): Promise<string> {
  return ((await locator.textContent()) ?? "").replace(/\s+/g, " ").trim();
}

async function setRadius(control: Locator, value: string): Promise<void> {
  const metadata = await control.evaluate((element) => {
    const input = element as HTMLInputElement;

    return {
      role: element.getAttribute("role") ?? "",
      type: input.type ?? "",
    };
  });

  if (metadata.role === "slider" || metadata.type === "range") {
    await control.focus();
    await control.press("ArrowRight");
    return;
  }

  await control.fill(value);
  await control.blur();
}

async function radiusControl(page: Page): Promise<Locator | null> {
  return firstVisible([
    page.getByRole("spinbutton", { name: /radius/i }),
    page.getByRole("slider", { name: /radius/i }),
    page.getByLabel(/radius/i),
    page.getByTestId("radius-input"),
    page.getByTestId("radius-control"),
  ]);
}

async function visibleNodeCount(page: Page): Promise<Locator | null> {
  return firstVisible([
    page.getByTestId("node-count"),
    page.getByRole("status", { name: /node count|nodes/i }),
    page.getByText(/nodes?\s*:\s*\d+/i),
  ]);
}

async function sceneStats(page: Page): Promise<{
  mode?: string;
  renderedNodes?: number;
  renderedEdgeSegments?: number;
  renderedCells?: number;
  renderedNodeLabels?: number;
  renderedEdgeLabels?: number;
  drawCalls?: number;
  frame?: number;
  renderCount?: number;
  frameSamples?: Array<{ frame: number; deltaMs: number }>;
}> {
  return page.evaluate(() => {
    const stats = (
      window as Window & {
        __coxeterSceneStats?: {
          mode: string;
          renderedNodes: number;
          renderedEdgeSegments: number;
          renderedCells: number;
          renderedNodeLabels: number;
          renderedEdgeLabels: number;
          drawCalls: number;
          frame: number;
          renderCount: number;
          frameSamples: Array<{ frame: number; deltaMs: number }>;
        };
      }
    ).__coxeterSceneStats;

    return stats
      ? {
          mode: stats.mode,
          renderedNodes: stats.renderedNodes,
          renderedEdgeSegments: stats.renderedEdgeSegments,
          renderedCells: stats.renderedCells,
          renderedNodeLabels: stats.renderedNodeLabels,
          renderedEdgeLabels: stats.renderedEdgeLabels,
          drawCalls: stats.drawCalls,
          frame: stats.frame,
          renderCount: stats.renderCount,
          frameSamples: stats.frameSamples,
        }
      : {};
  });
}

test("loads the app shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /coxeter viewer 5d/i }),
  ).toBeVisible();
});

test("renders a nonblank scene on desktop and mobile viewports", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 820 },
    { width: 390, height: 760 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByTestId("scene-canvas").locator("canvas"),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const stats = await sceneStats(page);
        return Math.min(
          stats.renderedNodes ?? 0,
          stats.renderedEdgeSegments ?? 0,
          stats.drawCalls ?? 0,
          stats.renderCount ?? 0,
        );
      })
      .toBeGreaterThan(0);
  }
});

test("renderer exposes benchmark-friendly scene stats", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByTestId("scene-canvas").locator("canvas"),
  ).toBeVisible();

  await expect
    .poll(async () => {
      const stats = await sceneStats(page);
      return {
        nodes: stats.renderedNodes ?? 0,
        edges: stats.renderedEdgeSegments ?? 0,
        drawCalls: stats.drawCalls ?? 0,
      };
    })
    .toMatchObject({ nodes: expect.any(Number), edges: expect.any(Number) });

  await expect
    .poll(async () => (await sceneStats(page)).renderedNodes ?? 0)
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await sceneStats(page)).renderedEdgeSegments ?? 0)
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await sceneStats(page)).drawCalls ?? 0)
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await sceneStats(page)).renderCount ?? 0)
    .toBeGreaterThan(0);

  const canvasShell = page.getByTestId("scene-canvas");
  await expect(canvasShell).toHaveAttribute("data-rendered-nodes", /\d+/);
  await expect(canvasShell).toHaveAttribute("data-rendered-edges", /\d+/);
});

test("opens the Tumarkin eight-facet catalogue without adding fake examples", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /15 eight-facet 5D cases/i }).click();
  await expect(
    page.getByLabel(/Tumarkin eight-facet catalogue/i),
  ).toBeVisible();
  await expect(page.getByText(/Showing 15\/15/i)).toBeVisible();
  await expect(
    page
      .getByText(/Certified bundled Coxeter-system JSON is available/i)
      .first(),
  ).toBeVisible();

  await page.getByLabel(/Search catalogue/i).fill("08");
  await expect(page.getByText(/Tumarkin G11411 #8/i)).toBeVisible();
  await expect(page.getByText(/Tumarkin G11411 #1/i)).toHaveCount(0);
});

test("changing radius updates the node count when controls are available", async ({
  page,
}) => {
  await page.goto("/");

  const control = await radiusControl(page);
  const nodeCount = await visibleNodeCount(page);

  if (!control || !nodeCount) {
    test.skip(
      true,
      "Radius control or node count is not implemented in the scaffold yet.",
    );
    return;
  }

  const before = await textOf(nodeCount);
  const currentValue = await control.inputValue().catch(() => "");
  const nextValue = currentValue === "3" ? "4" : "3";

  await setRadius(control, nextValue);

  await expect.poll(() => textOf(nodeCount)).not.toBe(before);
});

test("rank-two cell toggle updates the visible cell count when exposed", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel(/example/i).selectOption("A2");
  await page.getByRole("button", { name: /local chamber/i }).click();
  await page.getByLabel(/local depth/i).selectOption("3");
  await page.getByLabel(/far shells/i).selectOption("fade-far");

  const toggle = await firstVisible([
    page.getByRole("checkbox", {
      name: /rank[-\s]?two.*cells|davis.*cells|cells/i,
    }),
    page.getByRole("switch", {
      name: /rank[-\s]?two.*cells|davis.*cells|cells/i,
    }),
    page.getByRole("button", {
      name: /rank[-\s]?two.*cells|davis.*cells|cells/i,
    }),
    page.getByTestId("rank-two-cells-toggle"),
  ]);
  const cellCount = await firstVisible([
    page.getByTestId("rank-two-cell-count"),
    page.getByRole("status", {
      name: /cell count|rank[-\s]?two cells|visible cells/i,
    }),
    page.getByText(/cells?\s*:\s*\d+/i),
  ]);

  if (!toggle || !cellCount) {
    test.skip(
      true,
      "Rank-two cell toggle or visible cell count is not implemented yet.",
    );
    return;
  }

  const before = await textOf(cellCount);

  await toggle.click();

  await expect.poll(() => textOf(cellCount)).not.toBe(before);
});

test("label toggles expose compact vertex and edge labels", async ({
  page,
}) => {
  await page.goto("/");

  const vertexLabels = page.getByRole("checkbox", {
    name: /group-element labels/i,
  });
  const edgeLabels = page.getByRole("checkbox", {
    name: /generator labels on edges/i,
  });

  await expect(vertexLabels).toBeVisible();
  await expect(vertexLabels).toBeChecked();
  await expect(edgeLabels).toBeVisible();
  await expect(edgeLabels).toBeChecked();

  await vertexLabels.click();
  await edgeLabels.click();

  await expect(vertexLabels).not.toBeChecked();
  await expect(edgeLabels).not.toBeChecked();
});

test("theme and viewer-only controls keep the canvas central", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /dark mode/i }).click();
  await expect(page.locator("main.app-shell")).toHaveAttribute(
    "data-theme",
    "dark",
  );

  await page.getByRole("button", { name: /viewer only/i }).click();
  await expect(page.locator("main.app-shell")).toHaveClass(/viewer-only/);
  await expect(page.getByLabel(/viewer controls/i)).toBeHidden();
  await expect(page.getByRole("button", { name: /^show ui$/i })).toBeVisible();

  await page.getByRole("button", { name: /^show ui$/i }).click();
  await expect(page.locator("main.app-shell")).not.toHaveClass(/viewer-only/);
  await expect(page.getByLabel(/viewer controls/i)).toBeVisible();
});

test("keyboard viewer-only toggle restores rail scroll positions", async ({
  page,
}) => {
  await page.goto("/");

  const controlsRail = page.getByLabel(/viewer controls/i);
  const detailsRail = page.getByLabel(/graph details/i);
  const sceneCanvas = page.getByTestId("scene-canvas");
  const fullUiBox = await sceneCanvas.boundingBox();
  expect(fullUiBox?.width ?? 0).toBeGreaterThan(100);
  const before = await Promise.all([
    controlsRail.evaluate((element) => {
      element.scrollTop = Math.min(240, element.scrollHeight);
      return element.scrollTop;
    }),
    detailsRail.evaluate((element) => {
      element.scrollTop = Math.min(320, element.scrollHeight);
      return element.scrollTop;
    }),
  ]);

  await page.keyboard.press("u");
  await expect(page.locator("main.app-shell")).toHaveClass(/viewer-only/);
  await expect
    .poll(async () => (await sceneCanvas.boundingBox())?.width ?? 0)
    .toBeGreaterThan((fullUiBox?.width ?? 0) + 100);
  await page.keyboard.press("u");
  await expect(page.locator("main.app-shell")).not.toHaveClass(/viewer-only/);
  await expect
    .poll(async () =>
      Math.abs(
        ((await sceneCanvas.boundingBox())?.width ?? 0) -
          (fullUiBox?.width ?? 0),
      ),
    )
    .toBeLessThanOrEqual(2);

  await expect
    .poll(async () =>
      Promise.all([
        controlsRail.evaluate((element) => element.scrollTop),
        detailsRail.evaluate((element) => element.scrollTop),
      ]),
    )
    .toEqual(before);
});

test("keyboard shortcuts toggle labels without using form focus", async ({
  page,
}) => {
  await page.goto("/");

  const vertexLabels = page.getByRole("checkbox", {
    name: /group-element labels/i,
  });

  await expect(vertexLabels).toBeChecked();
  await page.keyboard.press("l");
  await expect(vertexLabels).not.toBeChecked();
});

test("local link and focus controls are exposed", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /local link/i }),
  ).toBeVisible();
  await expect(page.getByText(/spherical simplices/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /focus selected node/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /root view at selected node/i }),
  ).toBeVisible();
});

test("on-graph view exposes a local neighborhood around the selected node", async ({
  page,
}) => {
  await page.goto("/");

  const onGraph = page.getByTestId("view-on-graph");
  await expect(onGraph).toBeVisible();
  await onGraph.click();

  await expect(onGraph).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await sceneStats(page)).mode).toBe("on-graph");
  await expect(page.getByLabel(/local depth/i)).toBeVisible();
  await expect(page.getByText(/local chamber 3d shows/i)).toBeVisible();
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute(
    "data-cell-render-mode",
    "in-graph",
  );
});

test("compact 5-cube defaults to a decluttered local chamber view", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel(/example/i).selectOption("compact_5_cube_gamma1");
  await expect.poll(async () => (await sceneStats(page)).mode).toBe("on-graph");
  await expect(
    page.getByRole("button", { name: /local chamber/i }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("group", { name: /label scope/i })
      .getByRole("button", { name: /focused/i }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/local chamber neighborhood/i)).toBeVisible();
  await expect(page.getByLabel(/far shells/i)).toHaveValue("hide-far");
  await expect(page.getByLabel(/cell drawing/i)).toHaveValue("in-graph");
});

test("generator stepping updates the selected word breadcrumb", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /local chamber/i }).click();

  await page
    .getByLabel(/step by generator/i)
    .getByRole("button", { name: /^s0$/ })
    .click();
  await expect(page.getByLabel(/selected word breadcrumb/i)).toContainText(
    /e\s*\/\s*s0/i,
  );
  await expect(page.getByText(/selected chamber w:0/i)).toBeVisible();
});

test("local-link chord focuses a rank-two relation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/example/i).selectOption("A2");
  await page.getByRole("button", { name: /local chamber/i }).click();
  await page.getByLabel(/local depth/i).selectOption("3");
  await page.getByLabel(/far shells/i).selectOption("fade-far");

  const pairFilters = page.getByRole("group", {
    name: /local link pair filters/i,
  });
  await pairFilters
    .getByRole("button", { name: /focus s0-s1 rank-two cells/i })
    .click();

  await expect(page.getByLabel(/cell focus/i)).toHaveValue("selected-cell");
  await expect(page.getByLabel("Neighborhood", { exact: true })).toHaveValue(
    "cell-boundary",
  );
  const relationPanel = page.getByLabel(/graph details/i);
  await expect(relationPanel.getByText(/pair s0-s1 has m=3/i)).toBeVisible();
  await expect(relationPanel.getByText(/hexagon/i).first()).toBeVisible();
});

test("rank-two cell focus uses graph-bounded cells and selected pair filtering", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel(/example/i).selectOption("A2");
  await page
    .getByRole("group", { name: /view presets/i })
    .getByRole("button", { name: /rank-two cells/i })
    .click();

  await expect(page.getByLabel(/cell drawing/i)).toHaveValue("in-graph");
  await expect(page.getByLabel(/cell focus/i)).toHaveValue("selected-pair");
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute(
    "data-cell-render-mode",
    "in-graph",
  );

  await page
    .getByLabel(/coxeter pair matrix/i)
    .getByRole("button", { name: /s0-s1/i })
    .click();
  await expect(page.getByLabel(/cell focus/i)).toHaveValue("selected-cell");
  await expect(page.getByLabel("Neighborhood", { exact: true })).toHaveValue(
    "cell-boundary",
  );
  await expect(page.getByTestId("rank-two-cell-count")).toBeVisible();
});

test("opens the one-vertex Y_Gamma base complex for game access", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel(/viewer controls/i)
    .getByRole("button", { name: /open 3D y_gamma model/i })
    .click();

  await expect(page.getByText(/Y_Gamma/i).first()).toBeVisible();
  await expect(page.getByTestId("scene-canvas")).toBeVisible();
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute(
    "data-cell-render-mode",
    "in-graph",
  );
  await expect(
    page.getByText(/Y_Gamma fundamental-domain cell complex/i).first(),
  ).toBeVisible();
  await expect(page.getByText(/oriented arrow/i).first()).toBeVisible();
  await expect
    .poll(async () => (await sceneStats(page)).renderedCells ?? 0)
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("heading", { name: /Y_Gamma Cell Inventory/i }),
  ).toBeVisible();
  await expect(page.getByText(/not distinct affine vertices/i)).toBeVisible();
  await expect(page.getByText(/Game \/ Quotient/i)).toBeVisible();
  await expect(
    page.getByText(/quotient complex: no torsion-free/i),
  ).toBeVisible();
  await expect(page.getByText(/Boundary checks/i).first()).toBeVisible();
});

test("research workflow loads the I2(5) quotient/game demo", async ({
  page,
}) => {
  await page.goto("/");

  const workflow = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /research workflow/i }),
  });
  await expect(
    page.getByRole("heading", { name: /research workflow/i }),
  ).toBeVisible();
  await workflow.getByRole("button", { name: /quotient/i }).click();
  await workflow.getByRole("button", { name: /load demo quotient/i }).click();

  await expect(
    page.getByText(/I2\(5\) quotient \(identity subgroup\)/),
  ).toBeVisible();
  await expect(page.getByText(/cocycle i2-5-height-cocycle/i)).toBeVisible();
  await expect(
    page.getByText(/1\/1 rank-two boundary checks passed/i),
  ).toBeVisible();

  await workflow.getByRole("button", { name: /ascending link/i }).click();
  await expect(page.getByText(/ascending/i).first()).toBeVisible();
  await expect
    .poll(async () => (await sceneStats(page)).renderedEdgeSegments ?? 0)
    .toBeGreaterThan(0);

  const download = page.waitForEvent("download");
  await workflow
    .getByRole("button", { name: /export reproducible bundle/i })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.coxeter-experiment\.json$/);
});

test("research workflow rank-three lens opens the A3 Y_Gamma focus", async ({
  page,
}) => {
  await page.goto("/");

  const workflow = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /research workflow/i }),
  });
  await workflow.getByRole("button", { name: /rank-three cell/i }).click();

  await expect(page.getByText(/Y_Gamma\(A3\)/).first()).toBeVisible();
  await expect(page.getByText(/rank-three/i).first()).toBeVisible();
  await expect
    .poll(async () => (await sceneStats(page)).renderedCells ?? 0)
    .toBeGreaterThan(0);
});

test("experiment log saves and exports deterministic bundles", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /local chamber/i }).click();
  await page.getByRole("button", { name: /show research panels/i }).click();
  await page.getByLabel(/note/i).fill("checking lifted local cell panels");
  await page.getByRole("button", { name: /save run/i }).click();
  await expect(page.getByText(/1 saved run in this browser/i)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /export experiment/i }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.coxeter-experiment\.json$/);
  const path = await file.path();
  expect(path).toBeTruthy();
  const payload = JSON.parse(readFileSync(path ?? "", "utf8"));
  expect(payload).toMatchObject({
    schemaVersion: 1,
    summary: { runCount: 1 },
  });
});

test("view presets update the storytelling panel", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /what am i seeing/i }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: /view presets/i })
    .getByRole("button", { name: /global/i })
    .click();
  await expect(page.getByText(/finite-radius cayley ball/i)).toBeVisible();
  await page
    .getByRole("group", { name: /view presets/i })
    .getByRole("button", { name: /rank-two cells/i })
    .click();
  await expect(page.getByText(/exact rank-two davis cells/i)).toBeVisible();
  await page.getByLabel(/example/i).selectOption("hyperbolic_toy_rank2");
  await page
    .getByRole("group", { name: /view presets/i })
    .getByRole("button", { name: /geometric projection/i })
    .click();
  await expect(page.getByText(/geometric mode/i)).toBeVisible();
});

test("exports local neighborhood and view sidecar metadata", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /local chamber/i }).click();

  const localDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /export local neighborhood/i })
    .click();
  const localFile = await localDownload;
  expect(localFile.suggestedFilename()).toMatch(/local\.json$/);
  const localPath = await localFile.path();
  expect(localPath).toBeTruthy();
  const localText = readFileSync(localPath ?? "", "utf8");
  expect(JSON.parse(localText)).toMatchObject({
    kind: "coxeter-local-neighborhood-view",
    view: { graphView: "on-graph" },
  });

  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await page.getByRole("button", { name: /export view bundle/i }).click();
  await expect
    .poll(() => downloads.some((name) => name.endsWith(".view.json")))
    .toBe(true);
});

test("geometric mode reports a disabled warning when the selected example has no geometry", async ({
  page,
}) => {
  await page.goto("/");

  const geometricMode = await firstPresent([
    page.getByRole("tab", { name: /geometric/i }),
    page.getByRole("radio", { name: /geometric/i }),
    page.getByRole("button", { name: /geometric/i }),
    page.getByTestId("mode-geometric"),
  ]);

  if (!geometricMode) {
    test.skip(true, "Geometric mode control is not implemented yet.");
    return;
  }

  if (await geometricMode.isEnabled()) {
    await geometricMode.click();
  }

  await expect
    .poll(async () =>
      Boolean(
        await firstVisible([
          page
            .getByRole("alert")
            .filter({ hasText: /no geometry|missing geometry|disabled/i }),
          page.getByTestId("geometry-warning"),
          page.getByText(
            /geometric mode.*(disabled|unavailable)|no geometry|missing geometry/i,
          ),
        ]),
      ),
    )
    .toBe(true);
});

test("toy hyperbolic example enables geometric projection mode", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel(/example/i).selectOption("hyperbolic_toy_rank2");
  const geometricMode = page.getByTestId("mode-geometric");

  await expect(geometricMode).toBeEnabled();
  await page.getByLabel(/projection/i).selectOption("poincare-pca");
  await geometricMode.click();
  await expect(geometricMode).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText(/projection, not exact hyperbolic geometry/i),
  ).toBeVisible();
});

test("invalid JSON import shows a validation error when import UI is exposed", async ({
  page,
}) => {
  await page.goto("/");

  const importInput = await firstPresent([
    page.getByTestId("import-json-input"),
    page.getByLabel(/import.*json|load.*json|example json/i),
  ]);

  if (!importInput) {
    test.skip(true, "JSON import input is not implemented yet.");
    return;
  }

  await importInput.setInputFiles({
    name: "invalid-coxeter-system.json",
    mimeType: "application/json",
    buffer: Buffer.from("{ not valid json"),
  });

  await expect
    .poll(async () =>
      Boolean(
        await firstVisible([
          page
            .getByRole("alert")
            .filter({ hasText: /invalid json|parse|validation|schema/i }),
          page.getByTestId("import-error"),
          page.getByText(/invalid json|parse error|validation error|schema/i),
        ]),
      ),
    )
    .toBe(true);
});
