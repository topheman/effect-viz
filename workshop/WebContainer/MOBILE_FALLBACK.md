# Mobile Fallback

## Why a Fallback Path?

WebContainer does not boot correctly on mobile devices. The boot sequence typically fails at the `pnpm install` step. To provide a usable experience on phones and tablets, the app uses a fallback path when the user agent indicates a mobile device.

## What the Fallback Provides

| Feature          | Desktop (WebContainer)              | Mobile (Fallback)                          |
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

## Mobile Detection

Mobile is detected via **user agent** (not media queries), matching common mobile substrings: Android, iPhone, iPad, iPod, webOS, BlackBerry, IEMobile, Opera Mini.

See `src/lib/mobileDetection.ts` for `isMobileUserAgent()` and `useIsMobile()`.

## Future: Conditional Imports

In a future step, we can:

- Conditionally import WebContainer-related code only on desktop
- Conditionally import fallback type acquisition only on mobile

This would reduce bundle size and avoid loading WebContainer code on mobile.
