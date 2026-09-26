# End-to-end tests

Playwright tests that run the real pipeline: the WebContainer boots, a program runs under the instrumented runtime, and its trace reaches the UI. The Vitest suite runs in jsdom with mocks and sees none of this.

```sh
npm run playwright:install   # once per machine
npm run e2e
```

`npm run e2e` builds the app, serves `dist/` with `vite preview` on port 4180, and runs the tests in Chromium, plus the phone tests in WebKit as an iPhone SE. The port is fixed and must be free: the run fails rather than testing whatever else is listening there. Tests run against a build because `StrictMode` runs every effect twice in development.

To test a server that is already running, the deployed app for instance, skip both the build and the server:

```sh
E2E_BASE_URL=https://effect-viz.vercel.app npx playwright test
```

Each test boots its own WebContainer, which takes 5 to 15 seconds and needs network access to StackBlitz. The suite is opt-in and does not run in CI.

Tests assert on what a user sees: the playback status, log rows, fiber lanes. They never reach into runtime internals, so they keep passing across a runtime upgrade that preserves behaviour.

These tests share no code with the demo recorder in `scripts/demo/`. A helper useful to both is copied.
