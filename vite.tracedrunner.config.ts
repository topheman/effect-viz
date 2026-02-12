/**
 * Builds the tracedRunner bundle for the WebContainer inner project.
 * Output: dist/tracedRunner.js (ESM, minify disabled to preserve export names)
 */
import path from "path";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/runtime/tracedRunner.ts"),
      formats: ["es"],
      fileName: "tracedRunner",
    },
    outDir: "public",
    emptyOutDir: false, // Don't clear public (other assets there)
    minify: false,
    rollupOptions: {
      external: ["effect"],
      output: {
        format: "es",
        preserveModules: false,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
