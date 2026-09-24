# Mobile, Safari, and Offline Fallback

## Why a Fallback Path?

WebContainer does not run reliably on mobile devices (boot often fails at `pnpm install`) or Safari (desktop and iOS). Play can fail on Safari without devtools open due to WebAssembly instantiation issues. To provide a usable experience, the app uses a fallback path when the user agent indicates a mobile device or Safari.

The same fallback is also used when offline. WebContainer boots via a cross-origin iframe to `stackblitz.com/headless` (needed for its `SharedArrayBuffer` sandbox); every request after that is issued by that iframe's own document, not this app's, so our service worker can never see or cache any of it — there's no `vite.config.ts` rule that could help. StackBlitz's own reload-while-offline story isn't reliable either ([webcontainer-core#992](https://github.com/stackblitz/webcontainer-core/issues/992)), so offline reuses the same readonly/in-browser path as mobile and Safari rather than getting stuck on a broken boot.

## What the Fallback Provides

| Feature          | Supported (WebContainer)             | Fallback (Mobile / Safari / Offline)       |
| ---------------- | ------------------------------------ | ------------------------------------------ |
| Editor           | Editable                             | Readonly                                   |
| Execution        | WebContainer (`pnpm run`, etc.)      | In-browser Effect (`runFallbackPlay`)      |
| Monaco types     | From `node_modules/effect` + app libs | From `effect-types.json` + `public/app/` |
| Sync to container | Yes                                 | No                                         |

## Type Split

Types for the Monaco editor are split as follows:

- **`public/effect-types.json`**: the installed `effect` package's own declarations, one entry per module at its `node_modules/effect/dist/dts/` path. `npm run build:effect-types` (`scripts/extract-effect-dts.mjs`) writes it on every `dev` and `build`, so it follows the version in `package.json`. The service worker precaches it along with `public/app/`, so the types are there offline too. Monaco resolves `effect` through the same paths as on the WebContainer path, so both editors see the same types.
- **`public/app/`**: the `@/runtime` and trace types, emitted by `npm run build:runtime`.

The declarations stay one file per module instead of being bundled. effect makes `Option`, `Either` and `Context` tags yieldable in `Effect.gen` through `declare module "./Effect.js"` augmentations, and a single-file bundle cannot keep them: rollup-plugin-dts leaves them pointing at modules that no longer exist, dts-bundle-generator and api-extractor reject effect's `export * as` namespaces outright.

The types are fetched after the boot has already set the status to `fallback`, so Play is available while they load; a failed fetch only costs the editor its types.

## WebContainer Support Detection

WebContainer support is determined via **user agent** (not media queries), plus a network check:

- **`canSupportWebContainer()`** returns `true` when the browser can run WebContainer (Chrome, Firefox, non-Safari Chromium).
- **`useCanSupportWebContainer()`** is the React hook version.
- **`shouldUseFallback()`** is what `useWebContainerBoot` actually checks: `true` when `!canSupportWebContainer()` (mobile: Android, iPhone, iPad, iPod, webOS, BlackBerry, IEMobile, Opera Mini; or Safari, desktop and iOS) **or** `navigator.onLine === false`.

See `src/lib/mobileDetection.ts` for `canSupportWebContainer()`, `useCanSupportWebContainer()`, `shouldUseFallback()`, `isMobileUserAgent()`, and `isSafariUserAgent()`.

## Future: Conditional Imports

In a future step, we can:

- Conditionally import WebContainer-related code only when `canSupportWebContainer()`
- Conditionally import fallback type acquisition only when using fallback

This would reduce bundle size and avoid loading WebContainer code on mobile and Safari.
