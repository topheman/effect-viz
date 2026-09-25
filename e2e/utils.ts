import { readFile } from "node:fs/promises";

import { expect, type Page, test as base } from "@playwright/test";

/**
 * The onboarding version the app is built with, read from the same `.env` the
 * build reads. Seeding the tour as finished under an older version would bring
 * back the steps added since.
 */
async function onboardingVersion(): Promise<number> {
  const env = await readFile(new URL("../.env", import.meta.url), "utf8");
  const match = /^VITE_ONBOARDING_VERSION=(\d+)/m.exec(env);
  return match ? Number(match[1]) : 1;
}

/** Playwright's `test`, with the onboarding tour marked as done before any page loads. */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(
      (version: number) => {
        localStorage.setItem(
          "effect-flow-onboarding",
          JSON.stringify({
            completed: "info",
            version,
            date: new Date().toISOString(),
          }),
        );
      },
      await onboardingVersion(),
    );
    await use(context);
  },
});

export { expect };

export const runButton = (page: Page) =>
  page.getByRole("button", { name: "Run", exact: true });

export const playbackStatus = (page: Page) =>
  page.getByTestId("playback-status");

/**
 * Opens the app and waits until a program can run. Run stays disabled while
 * the WebContainer boots, which takes 5 to 15 seconds from a cold start.
 */
export async function openApp(page: Page) {
  await page.goto("/");
  await expect(runButton(page)).toBeEnabled({ timeout: 60_000 });
}
