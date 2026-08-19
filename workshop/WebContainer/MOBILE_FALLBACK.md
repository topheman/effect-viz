# Mobile, Safari, and Offline Fallback

## Why a Fallback Path?

WebContainer does not run reliably on mobile devices (boot often fails at `pnpm install`) or Safari (desktop and iOS). Play can fail on Safari without devtools open due to WebAssembly instantiation issues. To provide a usable experience, the app uses a fallback path when the user agent indicates a mobile device or Safari.

The same fallback is also used when offline. WebContainer boots via a cross-origin iframe to `stackblitz.com/headless` (needed for its `SharedArrayBuffer` sandbox); every request after that is issued by that iframe's own document, not this app's, so our service worker can never see or cache any of it — there's no `vite.config.ts` rule that could help. StackBlitz's own reload-while-offline story isn't reliable either ([webcontainer-core#992](https://github.com/stackblitz/webcontainer-core/issues/992)), so offline reuses the same readonly/in-browser path as mobile and Safari rather than getting stuck on a broken boot.

## What the Fallback Provides

| Feature          | Supported (WebContainer)             | Fallback (Mobile / Safari / Offline)       |
| ---------------- | ------------------------------------ | ------------------------------------------ |
| Editor           | Editable                             | Readonly                                   |
| Execution        | WebContainer (`pnpm run`, etc.)      | In-browser Effect (`runFallbackPlay`)      |
| Monaco types     | From `node_modules/effect` + app libs | From `fallback-types.d.ts` + `public/app/` |
| Sync to container | Yes                                 | No                                         |

## Type Split

Types for the Monaco editor are split as follows:

- **`public/fallback-types.d.ts`**: Effect module stubs only (Effect, Fiber, Exit, Context, etc.). Used for the `effect` import when WebContainer is not available.
- **`public/app/`**: tracedRunner, trace, traceEmitter, crypto — emitted by `npm run build:tracedrunner`. These stay in sync with the source.

This split ensures tracedRunner-related types remain up to date via the build pipeline, while Effect stubs are maintained manually in `fallback-types.d.ts` since they are minimal and stable.

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
