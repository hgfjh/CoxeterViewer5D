import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

async function expectDecagon(page: Page) {
  const scene = page.getByTestId("scene-canvas");
  await expect(scene.locator("canvas")).toBeVisible();
  // The five wall arcs and their midpoint helpers also appear in bar X.
  await expect(scene).toHaveAttribute("data-rendered-nodes", "20");
  await expect(scene).toHaveAttribute("data-rendered-edges", "15");
  await expect(scene).toHaveAttribute("data-rendered-cells", "1");
  await expect(scene).toHaveAttribute("data-node-labels", "10");
  // One additional W_i annotation is allowed for the selected wall, as in
  // the timed-browser floor. Wall midpoint helpers get no node labels.
  await expect(scene).toHaveAttribute("data-edge-labels", /^(10|11)$/);

  for (const [label, count] of Object.entries({
    Vertices: 10,
    Edges: 10,
    Cells: 1,
    Walls: 5,
  })) {
    const stat = page.locator(".stats-row .stat").filter({
      has: page.getByText(label, { exact: true }),
    });
    await expect(stat).toContainText(new RegExp(`${label}\\s*${count}$`));
  }
}

test("runs the real viewer and lawful search from the Pages project subpath", async ({
  page,
  request,
  baseURL,
}) => {
  const failures: string[] = [];
  const assetTypes = new Set<string>();
  const base = new URL(baseURL!);
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("requestfailed", (req) => {
    failures.push(`${req.url()} ${req.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400 || !url.href.startsWith(base.href)) {
      failures.push(`${response.status()} ${url.href}`);
    }
    if (response.ok() && url.pathname.startsWith(`${base.pathname}assets/`)) {
      assetTypes.add(response.headers()["content-type"].split(";")[0]);
    }
  });

  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "CoxeterViewer5D" }),
  ).toBeVisible();
  await expectDecagon(page);
  expect(assetTypes).toEqual(new Set(["text/javascript", "text/css"]));
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(false);
  expect((await request.get(new URL("/", base).href)).status()).toBe(404);
  expect((await request.get("./assets/no-such-chunk.js")).status()).toBe(404);

  const picker = page.getByLabel("Source Coxeter system");
  const models = page.getByRole("group", { name: "Mathematical model" });
  await expect(picker).toHaveValue("I2_5");
  await models.getByRole("button", { name: "Davis complex" }).click();
  const scene = page.getByTestId("scene-canvas");
  await expect(scene).toHaveAttribute("data-rendered-cells", "1");
  await expect(scene).toHaveAttribute("data-rendered-nodes", "10");
  await expect(scene).toHaveAttribute("data-rendered-edges", "10");
  await picker.selectOption("A2");
  await expect(scene).toHaveAttribute("data-rendered-nodes", "6");
  await expect(scene).toHaveAttribute("data-rendered-edges", "6");
  await expect(scene).toHaveAttribute("data-rendered-cells", "1");
  await picker.selectOption("I2_5");
  await models.getByRole("button", { name: "bar X compression" }).click();
  await expectDecagon(page);

  // Change a semantic render layer and check the label floor on restoration.
  const labels = page.getByRole("checkbox", { name: "Show edge labels" });
  await labels.uncheck();
  await expect(scene).toHaveAttribute("data-edge-labels", "0");
  await labels.check();
  await expect(scene).toHaveAttribute("data-edge-labels", /^(10|11)$/);

  const discovery = page.getByRole("region", {
    name: "Automatic torsion-free cover discovery",
  });
  await expect(discovery).toContainText(
    "Automatic GAP/Sage discovery requires the desktop app or the CLI",
  );
  await discovery
    .getByRole("button", { name: "Find torsion-free cover" })
    .click();
  await expect(discovery).toContainText(
    /Automatic GAP\/Sage cover discovery runs in the desktop app/,
  );
  await discovery
    .getByText("Search bounds and fallback import", { exact: true })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    discovery.getByRole("button", { name: "Export search request" }).click(),
  ]);
  expect(
    JSON.parse(readFileSync((await download.path())!, "utf8")),
  ).toMatchObject({
    artifactType: "coxeter-torsion-free-discovery-request",
    sourceSystem: { name: "I2(5)" },
  });

  await page
    .getByRole("group", { name: "Interface mode" })
    .getByRole("button", { name: "Research", exact: true })
    .click();
  const [worker] = await Promise.all([
    page.waitForEvent("worker", (worker) =>
      /\/searchWorker-[\w-]+\.js$/.test(worker.url()),
    ),
    page
      .getByRole("button", { name: "Find largest lawful subcomplex" })
      .click(),
  ]);
  expect(worker.url()).toMatch(`${base.href}assets/searchWorker-`);
  await expect(page.getByText(/Proven optimum: 1 lawful cells\./)).toBeVisible({
    timeout: 15_000,
  });

  await page.reload();
  await expect(page).toHaveURL(base.href);
  await expectDecagon(page);
  expect(failures).toEqual([]);
});

test("keeps the mathematical controls available without WebGL 2", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl2") return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });

  await page.goto("./");
  expect(errors).toEqual([]);
  await expect(page.getByRole("alert")).toContainText(
    "The 3D view needs WebGL 2",
  );
  await expect(page.getByTestId("scene-canvas").locator("canvas")).toHaveCount(
    0,
  );
  const picker = page.getByLabel("Source Coxeter system");
  await picker.selectOption("A2");
  await expect(picker).toHaveValue("A2");
  expect(errors).toEqual([]);
});
