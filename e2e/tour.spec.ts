import { expect, test, type Page } from "@playwright/test";

const TOUR_KEY = "coxeterViewer.tour.v1";

function tourCard(page: Page) {
  return page.getByRole("dialog", { name: /./ }).filter({
    has: page.locator(".tour-progress"),
  });
}

function modelButton(page: Page, name: string) {
  return page
    .getByRole("group", { name: "Mathematical model" })
    .getByRole("button", { name, exact: true });
}

async function readTourRecord(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), TOUR_KEY);
}

test("the tour stays closed under automation unless the URL asks for it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "CoxeterViewer5D" }),
  ).toBeVisible();
  await expect(page.getByTestId("guided-tour")).toHaveCount(0);
});

test("walks every step on the ideal 3-cube and records completion", async ({
  page,
}) => {
  await page.goto("/?tour=1");
  const card = tourCard(page);
  await expect(card).toContainText("What CoxeterViewer5D is for");
  await expect(card).toContainText("1 of 13");

  await card.getByRole("button", { name: "Start tour" }).click();
  await expect(card).toContainText("Choose a Coxeter system");
  await expect(page.locator("#example-select")).toHaveValue(
    "ideal_hyperbolic_3_cube_m3",
  );

  await card.getByRole("button", { name: "Next" }).click();
  await expect(card).toContainText("The defining graph Γ");
  await expect(modelButton(page, "Defining graph Gamma")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await card.getByRole("button", { name: "Next" }).click();
  await expect(card).toContainText("The Davis complex near the identity");
  await expect(modelButton(page, "Davis complex")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#radius-input")).toHaveValue("3");
  // The spotlight is drawn around a real element, not centred on nothing.
  await expect(page.locator(".tour-spotlight")).toBeVisible();

  // Back returns to the previous step without reloading the example.
  await card.getByRole("button", { name: "Back" }).click();
  await expect(card).toContainText("The defining graph Γ");
  await card.getByRole("button", { name: "Next" }).click();

  const expectations: Array<[string, (() => Promise<void>) | undefined]> = [
    ["Ball radius", undefined],
    ["Inspector and caveats", undefined],
    [
      "Projection drawing",
      () =>
        expect(modelButton(page, "Projection drawing")).toHaveAttribute(
          "aria-pressed",
          "true",
        ),
    ],
    [
      "A finite cover: hat X",
      () =>
        expect(modelButton(page, "hat X cover")).toHaveAttribute(
          "aria-pressed",
          "true",
        ),
    ],
    [
      "Compress to bar X",
      () =>
        expect(page.getByLabel("Relation family in bar X")).toHaveValue("all"),
    ],
    [
      "Walls",
      () =>
        expect(page.getByLabel("Relation family in bar X")).toHaveValue(
          "shared-complex",
        ),
    ],
    ["Lawful cells", undefined],
    [
      "Links and the fibering certificate",
      () =>
        expect(
          page.locator('[data-tour="induced-orientation"]'),
        ).toHaveJSProperty("open", true),
    ],
    ["Research mode and further reading", undefined],
  ];
  for (const [title, check] of expectations) {
    await card.getByRole("button", { name: "Next" }).click();
    await expect(card).toContainText(title);
    if (check) await check();
  }

  await card.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByTestId("guided-tour")).toHaveCount(0);
  expect(await readTourRecord(page)).toBe("finished");
});

test("Escape skips the tour and the help button reopens it", async ({
  page,
}) => {
  await page.goto("/?tour=1");
  const card = tourCard(page);
  await expect(card).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("guided-tour")).toHaveCount(0);
  expect(await readTourRecord(page)).toBe("skipped");
  // Skipping before the first step leaves the default example in place.
  await expect(page.locator("#example-select")).toHaveValue("I2_5");

  await page.getByRole("button", { name: "Start guided tour" }).click();
  await expect(tourCard(page)).toContainText("1 of 13");
  await tourCard(page).getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByTestId("guided-tour")).toHaveCount(0);
});

test("the tour card fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?tour=1");
  const card = tourCard(page);
  await card.getByRole("button", { name: "Start tour" }).click();
  await expect(card).toContainText("Choose a Coxeter system");
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(390);
});
