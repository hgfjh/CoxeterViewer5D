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
    normalizedId.includes("/src/fibering/") ||
    normalizedId.endsWith("/src/davis/fullQuotient.ts")
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
    normalizedId.includes("/src/topology/")
  ) {
    return "math-core";
  }

  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: {
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
