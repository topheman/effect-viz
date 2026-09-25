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
  context: async ({ baseURL, context }, use) => {
    await context.addInitScript(
      ({ origin, version }: { origin: string; version: number }) => {
        // Init scripts run in every frame, including the page's initial
        // about:blank, whose opaque origin throws on any localStorage access,
        // and the WebContainer's StackBlitz iframes.
        if (location.origin !== origin) return;
        localStorage.setItem(
          "effect-viz-onboarding",
          JSON.stringify({
            completed: "info",
            version,
            date: new Date().toISOString(),
          }),
        );
      },
      {
        origin: new URL(baseURL ?? "").origin,
        version: await onboardingVersion(),
      },
    );
    await use(context);
  },
});

export { expect };

export const runButton = (page: Page) =>
  page.getByRole("button", { name: "Run", exact: true });

export const pauseButton = (page: Page) =>
  page.getByRole("button", { name: "Pause", exact: true });

export const stepButton = (page: Page) =>
  page.getByRole("button", { name: "Step", exact: true });

// The status and the picker are rendered twice, for the desktop and mobile
// layouts; `first()` is the one the desktop viewport shows.
export const playbackStatus = (page: Page) =>
  page.getByTestId("playback-status").first();

export const programSelect = (page: Page) =>
  page.locator('select[data-onboarding-step="programSelect"]').first();

/**
 * Starts a program from a freshly opened app. Picking a program runs it; the
 * one already selected is started with Run, since picking it again changes
 * nothing.
 */
export async function startProgram(page: Page, key: string) {
  if ((await programSelect(page).inputValue()) === key) {
    await runButton(page).click();
  } else {
    await programSelect(page).selectOption(key);
  }
}

export interface LogRow {
  /** The row as a user reads it, with `[success]` or `[failure]` appended to a span's end, which only the icon shows. */
  text: string;
  /** Horizontal position of the row's icon, which moves right with fiber depth. */
  indent: number;
}

/**
 * The visible Execution Log rows, in order. Each row starts with an icon that
 * is the log's only `role="img"`, so the rows are found from it.
 */
export async function logRows(page: Page): Promise<LogRow[]> {
  return page.getByRole("img").evaluateAll((icons) =>
    icons
      .filter((icon) => icon.checkVisibility())
      .map((icon) => {
        const label = icon.getAttribute("aria-label") ?? "";
        const result = /\((success|failure)\)$/.exec(label)?.[1];
        const text = icon.nextElementSibling?.textContent ?? "";
        return {
          text: result ? `${text} [${result}]` : text,
          indent: icon.getBoundingClientRect().left,
        };
      }),
  );
}

/**
 * Opens the app and waits until a program can run. Run stays disabled while
 * the WebContainer boots, which takes 5 to 15 seconds from a cold start.
 */
export async function openApp(page: Page) {
  await page.goto("/");
  await expect(runButton(page)).toBeEnabled({ timeout: 60_000 });
}
