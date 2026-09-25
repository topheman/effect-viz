import { readFile } from "node:fs/promises";

import {
  expect,
  type Locator,
  type Page,
  test as base,
} from "@playwright/test";

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

/**
 * Playwright's `test`, with the onboarding tour marked as done before any page
 * loads, and failing any test during which the app logs an error or throws.
 */
export const test = base.extend<{ appErrors: void }>({
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

  appErrors: [
    async ({ baseURL, page }, use) => {
      const origin = new URL(baseURL ?? "").origin;
      const errors: string[] = [];
      page.on("console", (message) => {
        // The WebContainer's StackBlitz frames log their own errors.
        if (
          message.type() === "error" &&
          message.location().url.startsWith(origin)
        ) {
          errors.push(message.text());
        }
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use();
      expect(errors, "errors from the app").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const runButton = (page: Page) =>
  page.getByRole("button", { name: "Run", exact: true });

export const pauseButton = (page: Page) =>
  page.getByRole("button", { name: "Pause", exact: true });

export const stepButton = (page: Page) =>
  page.getByRole("button", { name: "Step", exact: true });

export const resetButton = (page: Page) =>
  page.getByRole("button", { name: "Reset", exact: true });

/**
 * The desktop and mobile layouts are both rendered, and only one is on screen.
 * Role locators skip the hidden copy by themselves; these need telling.
 */
const onScreen = (locator: Locator) =>
  locator.filter({ visible: true }).first();

export const playbackStatus = (page: Page) =>
  onScreen(page.getByTestId("playback-status"));

export const programSelect = (page: Page) =>
  onScreen(page.locator('select[data-onboarding-step="programSelect"]'));

export const speedSelect = (page: Page) =>
  onScreen(page.getByLabel("Playback speed"));

export const logOptions = (page: Page) =>
  onScreen(page.locator('[data-onboarding-step="logOptions"]'));

/** Opens the explanation on the first log row that reads `text` and returns it. */
export async function explainRow(page: Page, text: string) {
  const button = onScreen(page.getByText(text, { exact: true })).locator(
    "xpath=following-sibling::button",
  );
  await button.click();
  return page.locator(`#${await button.getAttribute("aria-controls")}`);
}

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
