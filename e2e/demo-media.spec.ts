import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const screenshotDir = "docs/screenshots";

async function waitForRenderedScene(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __coxeterSceneStats?: {
                renderCount: number;
                renderedNodes: number;
              };
            }
          ).__coxeterSceneStats?.renderCount ?? 0,
      ),
    )
    .toBeGreaterThan(0);
}

async function waitForCells(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __coxeterSceneStats?: { renderedCells: number };
            }
          ).__coxeterSceneStats?.renderedCells ?? 0,
      ),
    )
    .toBeGreaterThan(0);
}

async function capture(page: Page, path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, animations: "disabled" });
}

test.describe("public alpha demo screenshots", () => {
  test.use({ viewport: { width: 1440, height: 920 } });

  test("records the A2 hexagon relation demo", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/example/i).selectOption("A2");
    await page
      .getByRole("group", { name: /view presets/i })
      .getByRole("button", { name: /rank-two cells/i })
      .click();
    await page
      .getByLabel(/coxeter pair matrix/i)
      .getByRole("button", { name: /s0-s1/i })
      .click();

    await expect(page.getByText(/pair s0-s1 has m=3/i)).toBeVisible();
    await waitForRenderedScene(page);
    await waitForCells(page);
    await capture(page, `${screenshotDir}/hexagon-a2-rank-two-m3.png`);
  });

  test("records the A3 rank-three cell demo", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/example/i).selectOption("A3");
    await page
      .getByLabel(/viewer controls/i)
      .getByRole("button", { name: /open 3D y_gamma model/i })
      .click();
    await page
      .getByLabel(/Narrated Y_Gamma focus presets/i)
      .getByRole("button", { name: /one rank-three cell/i })
      .click();

    await expect(page.getByText(/Y_Gamma\(A3\)/).first()).toBeVisible();
    await expect(page.getByText(/rank-three/i).first()).toBeVisible();
    await waitForRenderedScene(page);
    await waitForCells(page);
    await capture(page, `${screenshotDir}/a3-rank-three-square-hexagon.png`);
  });

  test("records the P2 Y_Gamma m=5 relation demo", async ({ page }) => {
    await page.goto("/");
    await page
      .getByLabel(/example/i)
      .selectOption("compact_5_prism_makarov_p2");
    await page
      .getByLabel(/viewer controls/i)
      .getByRole("button", { name: /open 3D y_gamma model/i })
      .click();
    const m5Relation = page
      .getByLabel(/Y_Gamma relation picker/i)
      .getByRole("button", { name: /m=5/i })
      .first();

    await expect(m5Relation).toBeVisible();
    await m5Relation.click();
    await expect(m5Relation).toHaveAttribute("data-active", "true");
    await waitForRenderedScene(page);
    await waitForCells(page);
    await capture(page, `${screenshotDir}/y-gamma-p2-m5-relation.png`);
  });

  test("records the I2(5) quotient/game demo", async ({ page }) => {
    await page.goto("/");
    const workflow = page.locator("section.panel").filter({
      has: page.getByRole("heading", { name: /research workflow/i }),
    });

    await workflow.getByRole("button", { name: /quotient/i }).click();
    await workflow.getByRole("button", { name: /load demo quotient/i }).click();
    await workflow.getByRole("button", { name: /ascending link/i }).click();

    await expect(
      page.getByText(/I2\(5\) quotient \(identity subgroup\)/),
    ).toBeVisible();
    await expect(page.getByText(/cocycle i2-5-height-cocycle/i)).toBeVisible();
    await expect(page.getByText(/ascending/i).first()).toBeVisible();
    await waitForRenderedScene(page);
    await capture(page, `${screenshotDir}/i2-5-quotient-game-cocycle.png`);
  });
});
