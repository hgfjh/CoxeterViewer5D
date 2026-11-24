import { defineConfig, mergeConfig } from "vite";
import { pagesBase, pagesOutput } from "./scripts/pages_site.mjs";
import viewerConfig from "./vite.config.ts";

export default defineConfig(
  mergeConfig(viewerConfig, {
    base: pagesBase,
    // The app imports its example and certificate data from src/examples.
    // public/ also holds standalone CLI inputs, so publishing it would copy
    // duplicate examples and could pick up local research files.
    publicDir: false,
    build: { outDir: pagesOutput, sourcemap: false },
  }),
);
