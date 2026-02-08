/// <reference types="vitest/config" />
import path from "path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.ico", "favicon-*.png", "apple-touch-icon-*.png"],
      manifest: {
        name: "EffectViz",
        short_name: "EffectViz",
        description: "Effect runtime visualizer",
        theme_color: "#242424",
        background_color: "#242424",
        display: "standalone",
        icons: [
          {
            src: "favicon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "favicon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        // Let the new SW activate even when an old (e.g. autoUpdate) SW still controls
        // the page; otherwise the waiting SW never gets SKIP_WAITING from the old app.
        // Set to false later to restore prompt-only updates (5s snackbar).
        skipWaiting: true,
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,woff2}",
          "editor-bundled-definitions.d.ts",
        ],
      },
    }),
  ],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
  },
});
