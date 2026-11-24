import { defineConfig } from "@playwright/test";
import config from "./playwright.config.ts";
import { pagesBase, pagesOrigin } from "./scripts/pages_site.mjs";

const baseURL = pagesOrigin + pagesBase;

export default defineConfig({
  ...config,
  testMatch: "pages.smoke.ts",
  use: { ...config.use, baseURL },
  webServer: {
    command: "node scripts/pages_site.mjs",
    url: baseURL,
    reuseExistingServer: false,
  },
});
