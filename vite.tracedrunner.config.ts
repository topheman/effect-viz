/**
 * Builds the tracedRunner bundle for the WebContainer inner project.
 * Output: dist/tracedrunner/ (then copied to public/app via build:tracedrunner)
 */
import path from "path";

import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false, // Don't copy public/ into output (we only want tracedRunner.js)
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/runtime/tracedRunner.ts"),
      formats: ["es"],
      fileName: "tracedRunner",
    },
    outDir: "dist/tracedrunner",
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
