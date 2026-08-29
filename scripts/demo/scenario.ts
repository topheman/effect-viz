/**
 * The scripted feature tour recorded for the README.
 *
 * Edit this file to change what the video shows; `record.ts` only drives it.
 * Beats are deliberate: every click is followed by a hold long enough for a
 * viewer to read what changed before the pointer moves on.
 *
 * The tour is budgeted to stay under a minute, so each act earns its place by
 * showing something the others do not. `mark()` prints where the acts fall, to
 * make trimming a matter of measurement rather than guesswork.
 */

import type { Page } from "playwright";

import type { Cursor, Point } from "./cursor.ts";

export const VIEWPORT = { width: 1440, height: 810 };

interface ScenarioContext {
  page: Page;
  cursor: Cursor;
  /** Records the elapsed time at an act boundary. */
  mark: (label: string) => void;
}

/**
 * The grab point of the resize separator above the Timeline panel.
 *
 * Returns a point rather than a locator because the separator is a zero-height
 * element, which Playwright does not count as visible. The layout holds several
 * separators under library-generated ids, so this one is found structurally: it
 * is the sibling immediately before the panel that holds the Timeline.
 */
async function timelineHandlePoint(page: Page): Promise<Point> {
  const point = await page.evaluate(() => {
    // Panels nest, and every ancestor of the Timeline contains its text too.
    // Document order puts ancestors first, so the innermost match is the last.
    const timelinePanels = [
      ...document.querySelectorAll('[data-slot="resizable-panel"]'),
    ].filter((panel) => {
      const rect = panel.getBoundingClientRect();
      // The mobile layout is rendered too, collapsed to zero size.
      if (rect.width === 0 || rect.height === 0) return false;
      return panel.textContent?.includes("Visualize concurrency, delays");
    });

    const handle = timelinePanels.at(-1)?.previousElementSibling;
    if (handle?.getAttribute("role") !== "separator") return null;

    const rect = handle.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top };
  });

  if (!point) throw new Error("Cannot find the Timeline resize handle");
  return point;
}

/**
 * Finds where a piece of text sits on screen inside Monaco.
 *
 * Monaco splits a line across many spans and re-renders them on scroll, so a
 * CSS selector cannot address a token. Walking the text nodes and measuring a
 * `Range` finds the token wherever the editor happened to put it.
 */
async function locateText(page: Page, needle: string): Promise<Point> {
  const box = await page.evaluate((text: string) => {
    const lines = document.querySelector(".view-lines");
    if (!lines) return null;

    const walker = document.createTreeWalker(lines, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(text) ?? -1;
      if (index < 0) continue;

      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + text.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left, y: rect.top + rect.height / 2 };
    }
    return null;
  }, needle);

  if (!box) throw new Error(`Cannot find "${needle}" in the editor`);
  return box;
}

export async function runScenario({ page, cursor, mark }: ScenarioContext) {
  const runButton = page.getByRole("button", { name: "Run", exact: true });
  const pauseButton = page.getByRole("button", { name: "Pause", exact: true });
  const stepButton = page.getByRole("button", { name: "Step", exact: true });
  const resetButton = page.getByRole("button", { name: "Reset", exact: true });
  const speedSelect = page.getByLabel("Playback speed");
  const infoButton = page.locator('[data-onboarding-step="info"]');
  // The program picker is rendered twice, for the desktop and mobile layouts.
  const programSelect = page
    .locator('select[data-onboarding-step="programSelect"]')
    .first();
  const status = page.getByTestId("playback-status");
  // Each panel title exists several times over: the desktop and mobile layouts
  // are both rendered, and only one of them is on screen.
  const panelTitle = (name: string) =>
    page.getByText(name, { exact: true }).filter({ visible: true }).first();
  const fiberTree = panelTitle("Fiber Tree");
  const executionLog = panelTitle("Execution Log");
  const timeline = panelTitle("Timeline");

  /** Blocks until the playback bar reports a state, so beats never race the run. */
  const untilStatus = (state: string, timeout = 60_000) =>
    status.filter({ hasText: new RegExp(`^${state}$`) }).waitFor({ timeout });

  // The WebContainer boots before anything can run, and Run stays disabled
  // until it is ready, which makes it the readiness signal.
  await runButton.waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      !document.querySelector<HTMLButtonElement>('button[aria-label="Run"]')
        ?.disabled,
    undefined,
    { timeout: 120_000 },
  );
  mark("ready");
  await cursor.pause(900);

  // --- Act 1: slow the clock, run, and read the three views ----------------
  await cursor.select(speedSelect, "0.25");
  await cursor.pause(400);

  await cursor.click(runButton);
  await untilStatus("running");
  await cursor.pause(600);

  // Paused first: the panel tour takes longer than this program runs, and a
  // still frame is the one a viewer can actually read.
  await cursor.click(pauseButton);
  await untilStatus("paused");
  await cursor.pause(600);

  await cursor.moveToLocator(fiberTree);
  await cursor.pause(900);
  await cursor.moveToLocator(executionLog);
  await cursor.pause(900);
  await cursor.moveToLocator(timeline);
  await cursor.pause(900);

  // Panels are resizable: give the timeline lanes more room.
  await cursor.drag(await timelineHandlePoint(page), { x: 0, y: -25 });
  await cursor.pause(700);
  mark("act 1 — run and inspect");

  // --- Act 2: step the runtime forward one event at a time -----------------
  for (let i = 0; i < 3; i++) {
    await cursor.click(stepButton);
    await cursor.pause(550);
  }

  await cursor.click(runButton);
  await untilStatus("finished");
  await cursor.pause(1200);
  mark("act 2 — pause and step");

  // --- Act 3: edit the program and re-run it -------------------------------
  await cursor.click(resetButton);
  await cursor.pause(500);

  await cursor.select(speedSelect, "1");
  await cursor.pause(300);

  const delay = await locateText(page, "1.5");
  await cursor.moveTo({ x: delay.x + 2, y: delay.y });
  await cursor.pause(250);
  await page.mouse.down();
  await page.mouse.up();
  await cursor.pause(400);
  // Select the three characters of "1.5" and retype the duration, so the video
  // shows a live editor rather than a syntax-highlighted screenshot.
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowRight");
  await cursor.pause(300);
  await page.keyboard.type("4", { delay: 110 });
  await cursor.pause(900);

  await cursor.click(runButton);
  await untilStatus("finished");
  await cursor.pause(1400);
  mark("act 3 — edit and re-run");

  // --- Act 4: a second program, ending on its interrupted fibers -----------
  await cursor.click(resetButton);
  await cursor.pause(400);

  await cursor.select(programSelect, "structuredInterruption");
  await cursor.pause(1100);

  await cursor.click(runButton);
  await untilStatus("finished");
  await cursor.pause(800);

  await cursor.moveToLocator(fiberTree);
  await cursor.pause(1800);
  mark("act 4 — second program");

  // --- Close on the about box, the way the hand-made video did -------------
  await cursor.click(infoButton);
  await cursor.pause(2600);
  mark("act 5 — about");
}
