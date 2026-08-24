import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const screenshotDir = "docs/screenshots";

async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByTestId("scene-canvas").locator("canvas"),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __coxeterSceneStats?: { renderCount: number };
            }
          ).__coxeterSceneStats?.renderCount ?? 0,
      ),
    )
    .toBeGreaterThan(0);
}

async function chooseModel(page: Page, name: string): Promise<void> {
  const button = page
    .getByRole("group", { name: "Mathematical model" })
    .getByRole("button", { name, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function capture(page: Page, path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, animations: "disabled" });
}

test.describe("cover, compression, and wall workflow media", () => {
  test.use({ viewport: { width: 1440, height: 920 } });

  test("records the finite presentation cover hat X", async ({ page }) => {
    await openApp(page);
    await chooseModel(page, "hat X cover");
    await expect(page.getByText(/10 edges, 1 relation cells/)).toBeVisible();
    await capture(page, `${screenshotDir}/cover-walls-01-hat-x.png`);
  });

  test("records the compressed complex with its five walls", async ({
    page,
  }) => {
    await openApp(page);
    await expect(page.getByText(/5 opposite-edge classes/)).toBeVisible();
    await expect(
      page.getByLabel("Select a wall").locator("option"),
    ).toHaveCount(5);
    await capture(page, `${screenshotDir}/cover-walls-02-bar-x-walls.png`);
  });

  test("records a selected wall after its coorientation is flipped", async ({
    page,
  }) => {
    await openApp(page);
    await page.getByLabel("Select a wall").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Flip selected wall" }).click();
    await expect(page.getByText(/W2, an abstract wall in bar X/)).toBeVisible();
    await capture(page, `${screenshotDir}/cover-walls-03-flipped-wall.png`);
  });

  test("records the proven largest lawful subcomplex", async ({ page }) => {
    await openApp(page);
    await page
      .getByRole("button", { name: "Find largest lawful subcomplex" })
      .click();
    await expect(
      page.getByText(/Proven optimum: 1 lawful cells\./),
    ).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByRole("group", { name: "Interface mode" })
      .getByRole("button", { name: "Research", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Data + Status" }),
    ).toBeVisible();
    await capture(
      page,
      `${screenshotDir}/cover-walls-04-largest-lawful-subcomplex.png`,
    );
  });
});
