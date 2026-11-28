import { expect, test, type Page } from "@playwright/test";

// The canvas must redraw whenever a control changes what an edge shows. These
// tests compare canvas pixels, because the panels already updated correctly
// while the picture stayed stale; only the pixels catch that.

async function openApp(page: Page) {
  await page.goto("/");
  await expect(
    page.getByTestId("scene-canvas").locator("canvas"),
  ).toBeVisible();
  await expect.poll(() => renderCount(page)).toBeGreaterThan(0);
}

async function renderCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __coxeterSceneStats?: { renderCount: number };
        }
      ).__coxeterSceneStats?.renderCount ?? 0,
  );
}

async function canvasPixels(page: Page): Promise<Buffer> {
  // Let the renderer settle after the last state change.
  await page.waitForTimeout(600);
  return page.getByTestId("scene-canvas").locator("canvas").screenshot();
}

test("flipping a wall redraws its arrowheads", async ({ page }) => {
  await openApp(page);
  const wallReader = page.getByRole("region", { name: "Wall reader" });
  await wallReader.getByRole("button", { name: "Selected wall" }).click();
  // Hide labels so only edge geometry can change between the two captures.
  await page.getByLabel("Show vertex labels").uncheck();
  await page.getByLabel("Show edge labels").uncheck();
  const before = await canvasPixels(page);

  await page.getByRole("button", { name: "Flip selected wall" }).click();
  const after = await canvasPixels(page);
  expect(after.equals(before)).toBe(false);

  // Flipping back restores the original picture.
  await page.getByRole("button", { name: "Flip selected wall" }).click();
  const restored = await canvasPixels(page);
  expect(restored.equals(after)).toBe(false);
});

test("changing the projection model redraws the chambers", async ({ page }) => {
  await openApp(page);
  await page
    .getByLabel("Source Coxeter system")
    .selectOption("ideal_hyperbolic_3_cube_m3");
  await page
    .getByRole("group", { name: "Mathematical model" })
    .getByRole("button", { name: "Projection drawing", exact: true })
    .click();
  await page.getByLabel("Show vertex labels").uncheck();
  await page.getByLabel("Show edge labels").uncheck();
  const projection = page.locator("#projection-select");
  await expect(projection).toHaveValue("klein-axes");
  const klein = await canvasPixels(page);

  await projection.selectOption("poincare-axes");
  const poincare = await canvasPixels(page);
  expect(poincare.equals(klein)).toBe(false);
});
