import { createRequire } from "node:module";
import path from "path";

import { strict as effectStrict } from "@effect/tsgo/oxlint-presets";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, lazyPlugins } from "vite-plus";

import {
  effectPaths,
  effectTypesLayout,
} from "./src/effects/effectTypesLayout";
import { runtimeWatchPlugin } from "./vite-plugin-runtime-watch";

/** The package.json of the `effect` this build resolves. */
const effectPackageJson = createRequire(import.meta.url)("effect/package.json");

/**
 * The version of `effect` this build resolves, injected into the WebContainer's
 * package.json (`PACKAGE_JSON` in src/services/webcontainer.ts). The container
 * installs effect itself, so without this the two run paths could install
 * different versions and trace the same program differently — see #17 and #18.
 */
const effectVersion = effectPackageJson.version as string;

// https://vite.dev/config/
export default defineConfig({
  define: {
    __EFFECT_VERSION__: JSON.stringify(effectVersion),
    __EFFECT_PATHS__: JSON.stringify(
      effectPaths(effectTypesLayout(effectPackageJson)),
    ),
  },
  plugins: lazyPlugins(() => [
    runtimeWatchPlugin(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
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
        // Service worker will NOT call skipWaiting; updates will only activate when all tabs are closed.
        // This provides "prompt-only" updates, requiring a full reload (see snackbar notification).
        skipWaiting: false,
        // Editor types for the fallback path, which is also the offline path.
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,woff2}",
          "effect-types.json",
          "app/**/*.d.ts",
        ],
        // effect-types.json is ~4.2 MB, over the 2 MiB default.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            // Note: jsdelivr serves versioned paths like monaco-editor@0.55.1/...
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/monaco-editor@.*/i,
            handler: "CacheFirst",
            options: {
              // Bumped from "monaco-editor-cdn", whose entries are unreadable.
              cacheName: "monaco-editor-cdn-v2",
              // Refetch as CORS so the cached response stays readable. Monaco arrives
              // through a plain <script src>, so the request is no-cors and a plain
              // fetch yields an opaque response - which cache.match() then refuses to
              // return under the COEP: require-corp header WebContainer needs. See #21.
              fetchOptions: {
                mode: "cors",
                credentials: "omit",
              },
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                // 200 only: an opaque response reports status 0, and caching one
                // poisons the whole cache under COEP.
                statuses: [200],
              },
            },
          },
          // No rules for c/t/nr.staticblitz.com: WebContainer boots via a cross-origin
          // iframe, so those requests never reach this app's service worker to cache.
          // See workshop/WebContainer/MOBILE_FALLBACK.md.
        ],
      },
    }),
  ]),
  base: "./",
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
    allowedHosts: [".ngrok-free.app"],
  },
  optimizeDeps: {
    include: ["ansi-to-react"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    // e2e/ holds the Playwright tests (`pnpm run e2e`).
    include: ["src/**/*.test.{ts,tsx}"],
  },
  staged: {
    "*": "effect-tsgo vp check --fix",
  },
  fmt: {
    // Prettier's width, which the code was written to.
    printWidth: 80,
    // Build output, see `lint.ignorePatterns`, and skills installed from upstream.
    ignorePatterns: ["public/app/", ".agents/"],
    sortImports: {},
    overrides: [
      {
        // Snippets in docs are often generator bodies, which Oxfmt parses as
        // plain scripts and rewrites `yield* x` as `yield * x`.
        files: ["**/*.md"],
        options: { embeddedLanguageFormatting: "off" },
      },
    ],
  },
  lint: {
    // Effect diagnostics: every rule the language service enables by default, as
    // errors. Only the Effect-patched Oxlint that `effect-tsgo vp` starts knows the
    // `effecttsgo` plugin, so run `pnpm run check` rather than a bare `vp check`.
    extends: [effectStrict],
    // public/app is the runtime bundle copy-runtime.mjs lifts out of dist, so it is
    // build output like dist itself, and only exists on a machine that has built.
    ignorePatterns: ["dist", "public/app"],
    plugins: ["oxc", "typescript", "unicorn", "react"],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "testing-library", specifier: "eslint-plugin-testing-library" },
      {
        name: "better-tailwindcss",
        specifier: "eslint-plugin-better-tailwindcss",
      },
    ],
    categories: { correctness: "error" },
    settings: {
      "better-tailwindcss": { entryPoint: "./src/index.css" },
    },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      // Off in the Effect presets, on through the correctness category otherwise.
      "effecttsgo/any-unknown-in-error-context": "off",
      "effecttsgo/unsafe-effect-type-assertion": "off",
      // ESLint's and typescript-eslint's recommended rules outside the correctness category.
      "no-case-declarations": "error",
      "no-empty": "error",
      "no-fallthrough": "error",
      "no-prototype-builtins": "error",
      "no-regex-spaces": "error",
      "no-unused-expressions": "error",
      "no-useless-escape": "error",
      "typescript/ban-ts-comment": "error",
      "typescript/no-empty-object-type": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-array-constructor": "error",
      "typescript/no-namespace": "error",
      "typescript/no-require-imports": "error",
      "typescript/no-unnecessary-type-constraint": "error",
      "typescript/no-unsafe-function-type": "error",
      "typescript/prefer-namespace-keyword": "error",
      "typescript/triple-slash-reference": "error",
      // React hooks, with the React Compiler's rules.
      "react/rules-of-hooks": "error",
      "react/exhaustive-deps": "error",
      "react/error-boundaries": "error",
      "react/globals": "error",
      "react/immutability": "error",
      "react/incompatible-library": "error",
      "react/preserve-manual-memoization": "error",
      "react/purity": "error",
      "react/refs": "error",
      "react/set-state-in-effect": "error",
      "react/set-state-in-render": "error",
      "react/static-components": "error",
      "react/unsupported-syntax": "error",
      "react/use-memo": "error",
      "react/void-use-memo": "error",
      "react/only-export-components": ["error", { allowConstantExport: true }],
      "better-tailwindcss/enforce-consistent-class-order": "error",
      "better-tailwindcss/enforce-consistent-line-wrapping": "error",
      "better-tailwindcss/no-conflicting-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-unnecessary-whitespace": "error",
      "better-tailwindcss/no-unknown-classes": "error",
      "testing-library/await-async-events": [
        "error",
        { eventModule: "userEvent" },
      ],
      "testing-library/await-async-queries": "error",
      "testing-library/await-async-utils": "error",
      "testing-library/no-await-sync-events": [
        "error",
        { eventModules: ["fire-event"] },
      ],
      "testing-library/no-await-sync-queries": "error",
      "testing-library/no-container": "error",
      "testing-library/no-debugging-utils": "error",
      "testing-library/no-dom-import": ["error", "react"],
      "testing-library/no-global-regexp-flag-in-query": "error",
      "testing-library/no-manual-cleanup": "error",
      "testing-library/no-node-access": "error",
      "testing-library/no-promise-in-fire-event": "error",
      "testing-library/no-render-in-lifecycle": "error",
      "testing-library/no-unnecessary-act": "error",
      "testing-library/no-wait-for-multiple-assertions": "error",
      "testing-library/no-wait-for-side-effects": "error",
      "testing-library/no-wait-for-snapshot": "error",
      "testing-library/prefer-find-by": "error",
      "testing-library/prefer-presence-queries": "error",
      "testing-library/prefer-query-by-disappearance": "error",
      "testing-library/prefer-screen-queries": "error",
      "testing-library/render-result-naming-convention": "error",
    },
    overrides: [
      {
        // Asserting on a mocked or stubbed method reads it unbound.
        files: ["src/**/*.test.{ts,tsx}"],
        rules: { "typescript/unbound-method": "off" },
      },
      {
        // Playwright locators (`page.getByRole`, ...) read like Testing Library
        // queries destructured from `render`, which those rules flag, and a
        // Playwright fixture's `use` callback reads like React's `use` hook.
        files: ["scripts/demo/**/*.ts", "e2e/**/*.ts", "playwright.config.ts"],
        env: { node: true },
        rules: {
          "testing-library/await-async-events": "off",
          "testing-library/await-async-queries": "off",
          "testing-library/await-async-utils": "off",
          "testing-library/no-await-sync-events": "off",
          "testing-library/no-await-sync-queries": "off",
          "testing-library/no-container": "off",
          "testing-library/no-debugging-utils": "off",
          "testing-library/no-dom-import": "off",
          "testing-library/no-global-regexp-flag-in-query": "off",
          "testing-library/no-manual-cleanup": "off",
          "testing-library/no-node-access": "off",
          "testing-library/no-promise-in-fire-event": "off",
          "testing-library/no-render-in-lifecycle": "off",
          "testing-library/no-unnecessary-act": "off",
          "testing-library/no-wait-for-multiple-assertions": "off",
          "testing-library/no-wait-for-side-effects": "off",
          "testing-library/no-wait-for-snapshot": "off",
          "testing-library/prefer-find-by": "off",
          "testing-library/prefer-presence-queries": "off",
          "testing-library/prefer-query-by-disappearance": "off",
          "testing-library/prefer-screen-queries": "off",
          "testing-library/render-result-naming-convention": "off",
          "react/rules-of-hooks": "off",
        },
      },
    ],
    options: { typeAware: true, typeCheck: true },
  },
});
