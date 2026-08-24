import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: {
    // E2E exercises the same optimized chunks that ship to users. Building here
    // also keeps `playwright test` self-contained outside the release workflow.
    command:
      "corepack pnpm build && corepack pnpm preview --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
