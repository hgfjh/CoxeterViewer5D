import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function chunkForModule(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, "/");

  if (normalizedId.includes("/node_modules/three/")) {
    return "vendor-three";
  }
  if (
    normalizedId.includes("/node_modules/react/") ||
    normalizedId.includes("/node_modules/react-dom/")
  ) {
    return "vendor-react";
  }
  if (normalizedId.includes("/node_modules/lucide-react/")) {
    return "vendor-icons";
  }

  // The 51-entry nine-facet catalogue would push the shared examples chunk
  // past the size budget, so it gets a chunk of its own.
  if (normalizedId.includes("/src/examples/mazheng_5d_9facet_")) {
    return "examples-nine-facet";
  }
  if (normalizedId.includes("/src/examples/")) {
    return "examples";
  }
  if (normalizedId.includes("/src/render/")) {
    return "viewer-renderer";
  }
  if (
    normalizedId.includes("/src/compression/") ||
    normalizedId.includes("/src/walls/") ||
    normalizedId.includes("/src/torsionFree/") ||
    normalizedId.includes("/src/parallel/") ||
    normalizedId.includes("/src/fibering/") ||
    normalizedId.endsWith("/src/davis/fullQuotient.ts") ||
    normalizedId.endsWith("/src/davis/generalizedCompression.ts")
  ) {
    return "research-cover-walls";
  }
  if (
    normalizedId.includes("/src/game/") ||
    normalizedId.includes("/src/quotient/") ||
    normalizedId.includes("/src/app/experiments")
  ) {
    return "research-import-adapters";
  }
  if (
    normalizedId.includes("/src/cayley/") ||
    normalizedId.includes("/src/coxeter/") ||
    normalizedId.includes("/src/davis/") ||
    normalizedId.includes("/src/geometry/") ||
    normalizedId.includes("/src/topology/") ||
    // Shared helpers (hashing, small utilities) sit below every research
    // chunk; leaving them unassigned lets Rollup place them in a research
    // chunk, which then imports itself back through math-core.
    normalizedId.includes("/src/utils/")
  ) {
    return "math-core";
  }

  return undefined;
}

// Cross-origin isolation makes SharedArrayBuffer available, which the worker
// pool needs to share packed action rows instead of copying them per worker.
// The app loads no cross-origin subresources, so require-corp costs nothing.
// Static hosts must send the same two headers (see README).
const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  server: {
    headers: crossOriginIsolationHeaders,
    watch: {
      // Cargo rewrites and locks compiled DLLs while `tauri dev` is running.
      // Vite should watch web source files, not Rust build artifacts.
      ignored: ["**/src-tauri/target/**"],
    },
  },
  optimizeDeps: {
    include: ["lucide-react", "react", "react-dom/client", "three"],
  },
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks: chunkForModule,
      },
    },
  },
});
