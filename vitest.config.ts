import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Most suites are pure math; only the files that touch the DOM opt into
    // jsdom with a `// @vitest-environment jsdom` pragma.  Loading jsdom for
    // every file cost ~300 s of environment setup per full run.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Several suites spawn tsx/python subprocesses; under a parallel full run
    // the 5 s default made them flaky.
    testTimeout: 30_000,
  },
});
