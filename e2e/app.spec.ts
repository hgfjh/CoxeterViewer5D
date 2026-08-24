import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";

interface WallExperiment {
  kind: string;
  sourceSystem: { name: string };
  torsionFreeCoverDiscovery?: {
    status: string;
    request: { artifactType: string };
  };
  coverCompression: {
    hatX: {
      vertices: unknown[];
      directedLiftEdges: unknown[];
      generatorBigonCells: unknown[];
      liftedRelationCells: unknown[];
    };
    barX: {
      vertices: unknown[];
      geometricEdges: unknown[];
      relationCells: unknown[];
    };
    certificate: { status: string };
  };
  wallSystem: { walls: Array<{ id: string }> };
  coorientation: { wallSigns: Record<string, 1 | -1> };
  view: {
    wallDisplayMode: "all" | "selected";
    showInducedDirections: boolean;
    colorEdgesByWall: boolean;
    barRelationFamily?: string;
  };
  optimization?: {
    status: string;
    objectiveValue: number | null;
    certificate: { optimalityProven: boolean };
  };
  virtualAlgebraicFibering?: {
    status: string;
    primitiveHomomorphism: {
      rawImage: string;
      normalizationDivisor: number | null;
      primitiveImage: boolean;
      generatorValues: Array<{
        generatorId: string;
        primitiveValue: number;
      }>;
    };
    wallHomomorphism: {
      cocycle: { relationChecks: Array<{ passed: boolean }> };
    };
    plMorse: {
      failedCheckIds: string[];
      auxiliaryDiagnostics: Array<{ id: string; passed: boolean }>;
    };
    result: { virtualAlgebraicFibration: boolean };
  };
  fullDavisVirtualAlgebraicFibering?: {
    kind: string;
    certificate?: {
      schemaVersion: number;
      kind: string;
      fullCellPoset?: { certificate: { status: string } };
      triangulation?: { status: string };
      hashes: { artifactSha256?: string };
    };
  };
}

const modelLabels = [
  "Davis complex",
  "hat X cover",
  "bar X compression",
  "Defining graph Gamma",
  "Projection drawing",
] as const;

async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "CoxeterViewer5D" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("scene-canvas").locator("canvas"),
  ).toBeVisible();
  await expect.poll(() => renderedSceneCount(page)).toBeGreaterThan(0);
}

async function renderedSceneCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __coxeterSceneStats?: {
            renderedNodes: number;
            renderedEdgeSegments: number;
            renderCount: number;
          };
        }
      ).__coxeterSceneStats?.renderCount ?? 0,
  );
}

function modelSwitch(page: Page): Locator {
  return page.getByRole("group", { name: "Mathematical model" });
}

async function chooseModel(page: Page, label: (typeof modelLabels)[number]) {
  const button = modelSwitch(page).getByRole("button", {
    name: label,
    exact: true,
  });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

function workflow(page: Page): Locator {
  return page.getByRole("list", { name: "Cover and wall workflow" });
}

function panel(page: Page, title: RegExp): Locator {
  return page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: title }),
  });
}

async function switchToResearch(page: Page): Promise<void> {
  await page
    .getByRole("group", { name: "Interface mode" })
    .getByRole("button", { name: "Research", exact: true })
    .click();
}

async function expectStat(
  page: Page,
  label: string,
  value: number,
): Promise<void> {
  const stat = page
    .locator(".stats-row .stat")
    .filter({ has: page.getByText(label, { exact: true }) });
  await expect(stat).toContainText(new RegExp(`${label}\\s*${value}`));
}

async function downloadExperiment(page: Page): Promise<WallExperiment> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export experiment" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.coxeter-experiment\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  return JSON.parse(readFileSync(path!, "utf8")) as WallExperiment;
}

test("opens on the I2(5) bar-X wall workflow with all five models", async ({
  page,
}) => {
  await openApp(page);

  await expect(page.getByLabel("Source Coxeter system")).toHaveValue("I2_5");
  for (const label of modelLabels) {
    await expect(
      modelSwitch(page).getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  }
  await expect(
    modelSwitch(page).getByRole("button", {
      name: "bar X compression",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: "bar X compression viewer" }),
  ).toBeVisible();

  const steps = workflow(page).getByRole("listitem");
  await expect(steps.nth(0)).toContainText(
    "1. Certify a torsion-free subgroup",
  );
  await expect(steps.nth(0)).toContainText(
    "Certified from the materialized action (index 10)",
  );
  await expect(steps.nth(1)).toContainText(
    "2. Materialize a manageable finite cover",
  );
  await expect(steps.nth(1)).toContainText(
    "I2(5) quotient (identity subgroup)",
  );
  await expect(steps.nth(2)).toContainText("3. Compress to bar X");
  await expect(steps.nth(2)).toContainText("10 edges, 1 relation cells");
  await expect(steps.nth(3)).toContainText("4. Find walls");
  await expect(steps.nth(3)).toContainText("5 opposite-edge classes");
  await expect(steps.nth(4)).toContainText("5. Coorient walls");
  await expect(steps.nth(4)).toContainText("Coherent directions");
  await expect(steps.nth(5)).toContainText("6. Keep lawful cells");
  await expect(steps.nth(5)).toContainText("1 of 1 retained");
  await expect(steps.nth(6)).toContainText("7. Certify a primitive map to Z");
  await expectStat(page, "Vertices", 10);
  await expectStat(page, "Edges", 10);
  await expectStat(page, "Cells", 1);
  await expectStat(page, "Walls", 5);
});

test("makes bounded automatic cover discovery the primary cover action", async ({
  page,
}) => {
  await openApp(page);
  const coversPanel = panel(page, /Covers \+ Walls/);
  await expect(
    coversPanel.getByRole("button", { name: "Find torsion-free cover" }),
  ).toBeVisible();
  await expect(coversPanel).toContainText("Necessary index divisor");
  await expect(coversPanel).toContainText(/10/);
  await expect(coversPanel).toContainText(
    "finite image -> composite -> small GAP fallback",
  );

  await coversPanel
    .getByRole("button", { name: "Find torsion-free cover" })
    .click();
  await expect(coversPanel).toContainText(/desktop app/i);

  await coversPanel
    .getByText("Search bounds and fallback import", { exact: true })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    coversPanel.getByRole("button", { name: "Export search request" }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  const request = JSON.parse(readFileSync(path!, "utf8"));
  expect(request).toMatchObject({
    schemaVersion: 1,
    artifactType: "coxeter-torsion-free-discovery-request",
    sourceSystem: { name: "I2(5)" },
    search: {
      backend: "auto",
      maxIndex: 256,
      maxModuleCandidates: 96,
      maxCompositeModules: 4,
      maxCongruencePrime: 31,
      maxCongruenceImageOrder: 100000,
    },
  });
});

test("imports a discovery artifact only after independent certification", async ({
  page,
}) => {
  await openApp(page);
  const coversPanel = panel(page, /Covers \+ Walls/);
  await coversPanel
    .getByText("Search bounds and fallback import", { exact: true })
    .click();
  await coversPanel
    .getByLabel("Import discovery result")
    .setInputFiles("tests/fixtures/torsion-free-discovery/i2_5.passed.json");
  await expect(coversPanel).toContainText(
    /Imported and independently certified a torsion-free cover of index 10/,
  );
  await expect(
    modelSwitch(page).getByRole("button", { name: "hat X cover", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await switchToResearch(page);
  const statusPanel = panel(page, /Data \+ Status/);
  await expect(
    statusPanel.getByText("Torsion-free evidence", { exact: true }),
  ).toBeVisible();
  await expect(
    statusPanel.getByText("supplied-passed", { exact: true }).first(),
  ).toBeVisible();
});

test("navigates hat X, bar X, Gamma, and the Davis source without losing the scene", async ({
  page,
}) => {
  await openApp(page);

  await chooseModel(page, "hat X cover");
  await expect(
    page.getByRole("region", { name: "hat X cover viewer" }),
  ).toBeVisible();
  await expectStat(page, "Vertices", 10);
  await expectStat(page, "Edges", 20);
  await expectStat(page, "Cells", 10);

  await chooseModel(page, "bar X compression");
  await expectStat(page, "Vertices", 10);
  await expectStat(page, "Edges", 10);
  await expectStat(page, "Walls", 5);

  await chooseModel(page, "Defining graph Gamma");
  await expect(
    page.getByRole("region", { name: "Defining graph Gamma viewer" }),
  ).toBeVisible();
  await expectStat(page, "Vertices", 2);
  await expectStat(page, "Edges", 1);
  await expectStat(page, "Cells", 0);

  await chooseModel(page, "Davis complex");
  await expect(
    page.getByRole("region", { name: "Davis complex viewer" }),
  ).toBeVisible();
  await expect.poll(() => renderedSceneCount(page)).toBeGreaterThan(0);
});

test("selects and flips a wall without changing the underlying wall system", async ({
  page,
}) => {
  await openApp(page);
  await switchToResearch(page);

  const wallReader = page.getByRole("region", { name: "Wall reader" });
  await expect(wallReader).toBeVisible();
  await expect(
    wallReader.getByRole("button", { name: "All walls" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(wallReader.getByLabel("Show wall arcs")).toBeChecked();
  await expect(wallReader.getByLabel("Color dual edges by wall")).toBeChecked();
  await expect(wallReader.getByLabel("Show induced edge arrows")).toBeChecked();
  await expect(wallReader).toContainText(
    "Arrowheads show the direction induced on dual edges",
  );
  await expect
    .poll(() =>
      page.getByTestId("scene-canvas").getAttribute("data-rendered-edges"),
    )
    .toBe("15");

  await wallReader.getByRole("button", { name: "Selected wall" }).click();

  const wallSelect = page.getByLabel("Select a wall");
  await expect(wallSelect.locator("option")).toHaveCount(5);
  await wallSelect.selectOption({ index: 1 });
  const wallId = await wallSelect.inputValue();
  await expect(panel(page, /Focus Inspector/)).toContainText(
    /W2, an abstract wall in bar X/,
  );

  const before = await downloadExperiment(page);
  expect(before.view).toMatchObject({
    wallDisplayMode: "selected",
    showInducedDirections: true,
    colorEdgesByWall: true,
  });
  await page.getByRole("button", { name: "Flip selected wall" }).click();
  const after = await downloadExperiment(page);

  expect(after.wallSystem.walls.map((wall) => wall.id)).toEqual(
    before.wallSystem.walls.map((wall) => wall.id),
  );
  expect(after.coorientation.wallSigns[wallId]).toBe(
    -before.coorientation.wallSigns[wallId],
  );
  await expect(wallReader).toContainText(/W2 has sign [+-]/);

  await wallReader.getByLabel("Show induced edge arrows").uncheck();
  const arrowsHidden = await downloadExperiment(page);
  expect(arrowsHidden.view.showInducedDirections).toBe(false);
});

test("proves the largest lawful subcomplex for the default decagon", async ({
  page,
}) => {
  await openApp(page);
  await switchToResearch(page);

  await page
    .getByRole("button", { name: "Find largest lawful subcomplex" })
    .click();
  await expect(panel(page, /Covers \+ Walls/)).toContainText(
    /Proven optimum: 1 lawful cells\./,
    { timeout: 15_000 },
  );

  const experiment = await downloadExperiment(page);
  expect(experiment.optimization).toMatchObject({
    status: "optimal",
    objectiveValue: 1,
    certificate: { optimalityProven: true },
  });
});

test("teaching and research disclosure keep labels and caveats understandable", async ({
  page,
}) => {
  await openApp(page);

  await expect(page.getByRole("heading", { name: "Start Here" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Data + Status" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Notebook + Export" }),
  ).toHaveCount(0);

  const vertexLabels = page.getByRole("checkbox", {
    name: "Show vertex labels",
  });
  const edgeLabels = page.getByRole("checkbox", { name: "Show edge labels" });
  await expect(vertexLabels).toBeChecked();
  await expect(edgeLabels).toBeChecked();
  await vertexLabels.uncheck();
  await edgeLabels.uncheck();
  await expect(vertexLabels).not.toBeChecked();
  await expect(edgeLabels).not.toBeChecked();

  const caveats = panel(page, /^Caveats$/);
  const caveatDetails = caveats.locator("details");
  await expect(caveatDetails).not.toHaveAttribute("open", "");
  await caveatDetails.locator("summary").click();
  await expect(caveats.getByRole("listitem").first()).toBeVisible();
  await expect(caveats).toContainText(/drawing|hypotheses|combinatorial/i);

  await switchToResearch(page);
  await expect(page.getByRole("heading", { name: "Start Here" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Data + Status" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Notebook + Export" }),
  ).toBeVisible();
  await expect(page.getByText("Compression", { exact: true })).toBeVisible();
  await expect(page.getByText("passed", { exact: true })).toBeVisible();
});

test("U expands the viewer and restores the complete interface", async ({
  page,
}) => {
  await openApp(page);
  const shell = page.locator(".app-shell");
  const controls = page.getByLabel("Viewer controls");
  const inspector = page.getByLabel("Inspector and research tools");
  const canvas = page.getByTestId("scene-canvas");
  const initialWidth = (await canvas.boundingBox())?.width ?? 0;

  await page.keyboard.press("u");
  await expect(shell).toHaveClass(/viewer-only/);
  await expect(controls).toBeHidden();
  await expect(inspector).toBeHidden();
  await expect
    .poll(async () => (await canvas.boundingBox())?.width ?? 0)
    .toBeGreaterThan(initialWidth + 100);

  await page.keyboard.press("u");
  await expect(shell).not.toHaveClass(/viewer-only/);
  await expect(controls).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect
    .poll(async () =>
      Math.abs(((await canvas.boundingBox())?.width ?? 0) - initialWidth),
    )
    .toBeLessThanOrEqual(4);
});

test("exports exact cover data and a one-shot PNG", async ({ page }) => {
  await openApp(page);
  await switchToResearch(page);

  const experiment = await downloadExperiment(page);
  expect(experiment.kind).toBe("wall-coorientation-experiment");
  expect(experiment.torsionFreeCoverDiscovery).toMatchObject({
    status: "ready",
    request: {
      artifactType: "coxeter-torsion-free-discovery-request",
    },
  });
  expect(experiment.sourceSystem.name).toBe("I2(5)");
  expect(experiment.coverCompression.certificate.status).toBe("passed");
  expect(experiment.coverCompression.hatX.vertices).toHaveLength(10);
  expect(experiment.coverCompression.hatX.directedLiftEdges).toHaveLength(20);
  expect(experiment.coverCompression.hatX.generatorBigonCells).toHaveLength(20);
  expect(experiment.coverCompression.hatX.liftedRelationCells).toHaveLength(10);
  expect(experiment.coverCompression.barX.vertices).toHaveLength(10);
  expect(experiment.coverCompression.barX.geometricEdges).toHaveLength(10);
  expect(experiment.coverCompression.barX.relationCells).toHaveLength(1);
  expect(experiment.wallSystem.walls).toHaveLength(5);

  const [png] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PNG" }).click(),
  ]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  const pngPath = await png.path();
  expect(pngPath).not.toBeNull();
  const bytes = readFileSync(pngPath!);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(bytes.byteLength).toBeGreaterThan(1_000);
});

test("rejects an invalid finite-cover import without breaking the viewer", async ({
  page,
}) => {
  await openApp(page);

  await page.getByLabel("Import an existing finite action").setInputFiles({
    name: "invalid-cover.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":1,"name":"Incomplete cover"}'),
  });

  const coversPanel = panel(page, /Covers \+ Walls/);
  const importWarning = coversPanel
    .locator(".warning-inline")
    .filter({ hasText: "Invalid quotient complex" });
  await expect(importWarning).toBeVisible();
  await expect(importWarning).toContainText(
    /generatorRank|vertices|edges|twoCells|must|required/i,
  );
  await expect(
    page.getByRole("heading", { name: "CoxeterViewer5D" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("scene-canvas").locator("canvas"),
  ).toBeVisible();
});

test("uses an imported finite action as the source for every model", async ({
  page,
}) => {
  await openApp(page);
  const imported = JSON.parse(
    readFileSync("src/examples/I2_5_identity_quotient.json", "utf8"),
  );
  imported.name = "Imported finite action";
  imported.sourceSystem.name = "Imported I2 source";

  await page.getByLabel("Import an existing finite action").setInputFiles({
    name: "imported-cover.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });

  await expect(page.getByTestId("active-source-system")).toContainText(
    "Imported I2 source (from the finite action)",
  );
  await chooseModel(page, "Defining graph Gamma");
  await expect(panel(page, /Focus Inspector/)).toContainText(
    "Imported I2 source",
  );

  await chooseModel(page, "Davis complex");
  await expect(panel(page, /Focus Inspector/)).toContainText(
    "Imported I2 source",
  );
});

test("keeps all certified eight-facet examples reachable without crowding the picker", async ({
  page,
}) => {
  await openApp(page);
  const catalogue = page.locator(
    '#example-select optgroup[label="Certified eight-facet catalogue"] option',
  );
  await expect(catalogue).toHaveCount(16);

  await page
    .getByLabel("Source Coxeter system")
    .selectOption("tumarkin_5d_8facet_g12221_01");
  await expect(page.getByTestId("active-source-system")).toContainText(
    "Tumarkin 5D eight-facet G12221",
  );
  await expect(
    modelSwitch(page).getByRole("button", {
      name: "Davis complex",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("loads the ideal 3-cube with its certified index-24 S4 cover", async ({
  page,
}) => {
  await openApp(page);

  await page
    .getByLabel("Source Coxeter system")
    .selectOption("ideal_hyperbolic_3_cube_m3");

  await expect(
    page.locator(
      '#example-select optgroup[label="Core and featured examples"] option[value="ideal_hyperbolic_3_cube_m3"]',
    ),
  ).toHaveCount(1);

  await expect(page.getByTestId("active-source-system")).toContainText(
    "Regular ideal hyperbolic Coxeter 3-cube",
  );
  await expect(page.getByTestId("active-source-system")).toContainText(
    "from the finite action",
  );
  await expect(workflow(page).getByRole("listitem").nth(1)).toContainText(
    "Regular ideal 3-cube S4-kernel cover (24 sheets)",
  );

  const relationReader = page.getByRole("region", {
    name: "bar X relation reader",
  });
  const relationFamily = page.getByLabel("Relation family in bar X");
  await expect(relationReader).toBeVisible();
  await expect(relationFamily).toHaveValue("0:1");
  await expect(relationReader).toContainText("4 of 48 cells");
  await expect(relationReader).toContainText("4 hexagons");
  await expectStat(page, "Cells", 4);

  await relationFamily.selectOption("all");
  await expect(relationReader).toContainText("48 hexagons");
  await expect(relationReader).toContainText("same 24 vertices");
  await expectStat(page, "Cells", 48);
  await expect
    .poll(async () =>
      Number(
        (await page
          .getByTestId("scene-canvas")
          .getAttribute("data-rendered-cells")) ?? 0,
      ),
    )
    .toBe(48);

  await relationFamily.selectOption("shared-complex");
  await expect(page.getByRole("region", { name: "Wall reader" })).toBeVisible();

  await chooseModel(page, "hat X cover");
  await expect(
    page.getByRole("region", { name: "hat X cover viewer" }),
  ).toBeVisible();
  await expectStat(page, "Vertices", 24);

  await chooseModel(page, "Defining graph Gamma");
  await expect(panel(page, /Focus Inspector/)).toContainText(
    "Regular ideal hyperbolic Coxeter 3-cube",
  );
});

test("reads four or 48 ideal-cube hexagons on one shared quotient skeleton", async ({
  page,
}) => {
  await openApp(page);
  await page
    .getByLabel("Source Coxeter system")
    .selectOption("ideal_hyperbolic_3_cube_m3");
  await chooseModel(page, "bar X compression");

  const selector = page.getByLabel("Relation family in bar X");
  await expect(selector).toHaveValue("0:1");
  await expect(selector.locator("option")).toHaveCount(14);
  await expect(
    page.getByRole("region", { name: "bar X relation reader" }),
  ).toContainText("24/(2 x 3) = 4 hexagons");
  await expectStat(page, "Vertices", 24);
  await expectStat(page, "Edges", 72);
  await expectStat(page, "Cells", 4);
  await expect
    .poll(async () =>
      Number(
        await page
          .getByTestId("scene-canvas")
          .getAttribute("data-rendered-cells"),
      ),
    )
    .toBe(4);

  await selector.selectOption("all");
  await expectStat(page, "Vertices", 24);
  await expectStat(page, "Edges", 72);
  await expectStat(page, "Cells", 48);
  await expect(
    page.getByRole("region", { name: "bar X relation reader" }),
  ).toContainText("48 exact hexagons remain attached");
  await expect
    .poll(async () =>
      Number(
        await page
          .getByTestId("scene-canvas")
          .getAttribute("data-rendered-cells"),
      ),
    )
    .toBe(48);

  await selector.selectOption("shared-complex");
  await expect(
    page.getByRole("region", { name: "bar X relation reader" }),
  ).toContainText("same compressed complex");
  await expect(page.getByLabel("Show wall arcs")).toBeChecked();
});

test("exports the full Davis quotient Morse certificate", async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await page
    .getByLabel("Source Coxeter system")
    .selectOption("ideal_hyperbolic_3_cube_m3");
  const card = page.getByRole("region", {
    name: "Virtual algebraic fibering certificate",
  });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Check full Davis quotient" }).click();
  await expect(card).toContainText(
    /Found a coorientation|Search is|Exhausted the coorientation/,
    {
      timeout: 60_000,
    },
  );
  await expect(card).toContainText("Full quotient cells", {
    timeout: 60_000,
  });
  await card
    .getByText("Certificate stages and evidence", { exact: true })
    .click();
  await expect(card).toContainText("Complete Davis quotient cell poset");
  await expect(card).toContainText("Compatible pulling triangulation");
  await expect(card).toContainText("Full ascending and descending links");

  await card
    .getByRole("button", { name: "Export fibering certificate" })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-last-browser-export",
    /virtual-fibering\.certificate\.json$/,
  );

  await switchToResearch(page);
  const experiment = await downloadExperiment(page);
  expect(experiment.fullDavisVirtualAlgebraicFibering).toMatchObject({
    kind: "full-davis-coorientation-search",
    certificate: {
      schemaVersion: 2,
      kind: "full-davis-virtual-algebraic-fibering-certificate",
      fullCellPoset: { certificate: { status: "passed" } },
      triangulation: { status: "passed" },
      hashes: { artifactSha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
    },
  });
});

test("certifies the smaller lawful complex before building the full Davis quotient", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openApp(page);
  await page
    .getByLabel("Source Coxeter system")
    .selectOption("ideal_hyperbolic_3_cube_m3");
  const card = page.getByRole("region", {
    name: "Virtual algebraic fibering certificate",
  });
  await card
    .getByRole("button", { name: "Run lawful-first certification" })
    .click();
  await expect(card).toContainText("Track A: lawful 2-complex", {
    timeout: 30_000,
  });
  await expect(card).toContainText("exact metric-link check");
  await expect(card).toContainText("finite generation transferred to H");
  await expect(card.getByText("Track B: complete Davis quotient")).toHaveCount(
    0,
  );
});
