/**
 * Builds the runtime bundle for the WebContainer inner project.
 * Output: dist/runtime/ (then copied to public/app via build:runtime)
 */
import path from "path";

import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false, // Don't copy public/ into output (we only want runtime.js)
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/runtime/index.ts"),
      formats: ["es"],
      fileName: "runtime",
    },
    outDir: "dist/runtime",
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
