import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a production build: see e2e/README.md.
 *
 * `E2E_BASE_URL` points the tests at a server that is already running, such as
 * the deployed app, and skips starting one.
 */
const PORT = 4180;
const externalBaseURL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: true,
  reporter: "list",
  // Each test boots its own WebContainer, which takes 5 to 15 seconds before
  // the program even starts.
  timeout: 120_000,
  use: {
    baseURL: externalBaseURL ?? `http://127.0.0.1:${PORT}`,
    colorScheme: "dark",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 810 },
      },
    },
  ],
  // The preview server serves dist/ with the COOP/COEP headers the WebContainer
  // needs (`server.headers` in vite.config.ts). A taken port fails the run
  // rather than testing whatever else is listening there.
  webServer: externalBaseURL
    ? undefined
    : {
        command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: false,
      },
});
