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
    normalizedId.includes("/src/app/yGamma") ||
    normalizedId.includes("/src/topology/")
  ) {
    return "research-ygamma-topology";
  }
  if (
    normalizedId.includes("/src/game/") ||
    normalizedId.includes("/src/quotient/") ||
    normalizedId.includes("/src/app/experiments")
  ) {
    return "research-quotient-game";
  }
  if (
    normalizedId.includes("/src/cayley/") ||
    normalizedId.includes("/src/coxeter/") ||
    normalizedId.includes("/src/davis/") ||
    normalizedId.includes("/src/geometry/")
  ) {
    return "math-core";
  }

  return undefined;
}

export default defineConfig({
  plugins: [react()],
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
