import { expect, test, type Page } from "@playwright/test";

function inspector(page: Page) {
  return page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: /Focus Inspector/ }),
  });
}

async function chooseModel(page: Page, name: string) {
  await page
    .getByRole("group", { name: "Mathematical model" })
    .getByRole("button", { name, exact: true })
    .click();
}

test("draws the ideal-cube unit cell and shares its selection with bar X", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "CoxeterViewer5D" }),
  ).toBeVisible();
  await page
    .getByLabel("Source Coxeter system")
    .selectOption("ideal_hyperbolic_3_cube_m3");
  // The shared-complex reading of bar X has a vertex picker, used below to
  // read back the selection.
  await chooseModel(page, "bar X compression");
  await page
    .getByLabel("Relation family in bar X")
    .selectOption("shared-complex");
  await chooseModel(page, "Davis complex");

  const davisView = page.getByRole("group", { name: "Davis view" });
  const ball = davisView.getByRole("button", { name: "Ball", exact: true });
  const unitCell = davisView.getByRole("button", { name: "Unit cell" });
  await expect(ball).toHaveAttribute("aria-pressed", "true");
  await unitCell.click();
  await expect(unitCell).toHaveAttribute("aria-pressed", "true");

  await expect(
    page.getByRole("list", { name: "Drawing status" }),
  ).toContainText(/Unit cell: 24 chambers, \d+ gluing pairs/);
  await expect(inspector(page)).toContainText(
    "Fundamental domain of H: one chamber per coset",
  );

  // Neighbouring copies are drawing-only: the vertex count stays the same.
  const vertices = page
    .locator(".stats-row .stat")
    .filter({ has: page.getByText("Vertices", { exact: true }) })
    .locator("strong");
  const before = await vertices.innerText();
  await page.getByLabel("Show neighbouring copies").check();
  await expect(vertices).toHaveText(before);

  const chamberSelect = page.getByLabel("Unit-cell chamber");
  await chamberSelect.selectOption({ label: "(12)" });
  // Domain chambers carry the bar X vertex id itself.
  const vertexId = await chamberSelect.inputValue();
  expect(vertexId).toMatch(/^bar:v:/);
  await expect(inspector(page)).toContainText(
    "(12), the chamber of the unit cell over this bar X vertex.",
  );

  await chooseModel(page, "bar X compression");
  await page.getByText("Inspect induced orientation").click();
  await expect(page.locator("#morse-vertex-selection")).toHaveValue(vertexId);
  await expect(page.getByRole("group", { name: "Davis view" })).toHaveCount(0);
});
