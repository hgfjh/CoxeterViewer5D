import { expect, type Page, test } from "@playwright/test";

async function openIdealCubeBarX(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "CoxeterViewer5D" }),
  ).toBeVisible();
  await page
    .getByLabel("Source Coxeter system")
    .selectOption("ideal_hyperbolic_3_cube_m3");
  await page
    .getByRole("group", { name: "Mathematical model" })
    .getByRole("button", { name: "bar X compression", exact: true })
    .click();
  await expect(page.getByLabel("Relation family in bar X")).toHaveValue("0:1");
}

test("reads all 48 ideal-cube hexagons in the bar X cell atlas", async ({
  page,
}) => {
  await openIdealCubeBarX(page);
  const coverView = page.getByRole("group", { name: "Cover view" });
  const threeD = coverView.getByRole("button", { name: "3D", exact: true });
  const atlasButton = coverView.getByRole("button", { name: "Cell atlas" });
  await expect(threeD).toHaveAttribute("aria-pressed", "true");

  await atlasButton.click();
  await expect(atlasButton).toHaveAttribute("aria-pressed", "true");
  const atlas = page.getByRole("region", { name: "bar X cell atlas" });
  await expect(atlas).toBeVisible();
  await expect(atlas).toContainText(
    "Each relation cell drawn separately from its exact boundary word",
  );
  const cards = atlas.locator(".cell-atlas-card");
  await expect(cards).toHaveCount(48);
  await expect(page.getByTestId("cell-atlas-count")).toHaveText(
    "48 of 48 cells",
  );
  await expect(
    atlas.getByRole("heading", { name: "t12–t13, m = 3 · 4 cells" }),
  ).toBeVisible();

  // Selecting a cell outside the 3D family filter (0:1) moves the filter to
  // the cell's family, so the inspector can describe it.
  const family = atlas.locator('[data-family-id="0:2"]');
  const card = family.locator(".cell-atlas-card").first();
  const cellId = await card.getAttribute("data-cell-id");
  expect(cellId).toBeTruthy();
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Relation family in bar X")).toHaveValue("0:2");
  await expect(
    page.locator("section.panel").filter({
      has: page.getByRole("heading", { name: /Focus Inspector/ }),
    }),
  ).toContainText(cellId!);

  // Hovering a corner lights every cell containing that vertex: 12 of 48.
  await card.locator(".cell-atlas-corner").first().hover();
  await expect(atlas.locator(".cell-atlas-card.is-highlighted")).toHaveCount(
    12,
  );
  await expect(atlas.locator(".cell-atlas-hover")).toContainText(
    "lies in 12 of 48 relation cells",
  );

  await page
    .getByLabel("Cell atlas relation family")
    .selectOption({ label: "t12–t14, m = 3 · 4 cells" });
  await expect(cards).toHaveCount(4);
  await page.getByLabel("Filter cells by vertex label").fill("(12)(34)");
  await expect(page.getByTestId("cell-atlas-count")).toHaveText(
    /^\d of 48 cells$/,
  );

  await threeD.click();
  await expect(atlas).toHaveCount(0);
  await expect(page.getByTestId("scene-canvas")).toBeVisible();
});

test("hat X atlas skips generator bigons and says so", async ({ page }) => {
  await openIdealCubeBarX(page);
  await page
    .getByRole("group", { name: "Mathematical model" })
    .getByRole("button", { name: "hat X cover", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Cover view" })
    .getByRole("button", { name: "Cell atlas" })
    .click();
  const atlas = page.getByRole("region", { name: "hat X cell atlas" });
  await expect(page.getByTestId("cell-atlas-count")).toHaveText(
    "288 of 288 cells",
  );
  await expect(atlas).toContainText("144 generator bigons not shown");
});
