/**
 * The scripted feature tour recorded for the README.
 *
 * Edit this file to change what the video shows; `record.ts` only drives it.
 * Beats are deliberate: every click is followed by a hold long enough for a
 * viewer to read what changed before the pointer moves on.
 */

import type { Page } from "playwright";

import type { Cursor, Point } from "./cursor.ts";

export const VIEWPORT = { width: 1440, height: 810 };

interface ScenarioContext {
  page: Page;
  cursor: Cursor;
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

export async function runScenario({ page, cursor }: ScenarioContext) {
  const runButton = page.getByRole("button", { name: "Run", exact: true });
  const pauseButton = page.getByRole("button", { name: "Pause", exact: true });
  const stepButton = page.getByRole("button", { name: "Step", exact: true });
  const resetButton = page.getByRole("button", { name: "Reset", exact: true });
  const speedSelect = page.getByLabel("Playback speed");
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
  await cursor.pause(1200);

  // --- Act 1: slow the clock down, run, and pause mid-flight ---------------
  await cursor.moveTo({ x: 320, y: 300 }, 900);
  await cursor.pause(800);

  await cursor.select(speedSelect, "0.25");
  await cursor.pause(600);

  await cursor.click(runButton);
  await untilStatus("running");
  await cursor.pause(900);

  // Pause early rather than after the panel tour below: the tour takes longer
  // than this program runs, and pausing a finished program is not a thing.
  await cursor.click(pauseButton);
  await untilStatus("paused");
  await cursor.pause(900);

  // Walk the three panels. Holding the runtime still while the pointer moves
  // also gives the viewer a frame stable enough to actually read.
  await cursor.moveToLocator(fiberTree, 900);
  await cursor.pause(1300);
  await cursor.moveToLocator(executionLog, 800);
  await cursor.pause(1300);
  await cursor.moveToLocator(timeline, 800);
  await cursor.pause(1300);

  // --- Act 2: step the runtime forward one event at a time -----------------
  for (let i = 0; i < 4; i++) {
    await cursor.click(stepButton, { duration: 300 });
    await cursor.pause(700);
  }

  await cursor.click(runButton);
  await untilStatus("finished");
  await cursor.pause(2000);

  // --- Act 3: edit the program and re-run it -------------------------------
  await cursor.click(resetButton);
  await cursor.pause(800);

  await cursor.select(speedSelect, "1");
  await cursor.pause(400);

  const delay = await locateText(page, "1.5");
  await cursor.moveTo({ x: delay.x + 2, y: delay.y }, 800);
  await cursor.pause(300);
  await page.mouse.down();
  await page.mouse.up();
  await cursor.pause(500);
  // Select the three characters of "1.5" and retype the duration, so the video
  // shows a live editor rather than a syntax-highlighted screenshot.
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowRight");
  await cursor.pause(400);
  await page.keyboard.type("4", { delay: 120 });
  await cursor.pause(1400);

  await cursor.click(runButton);
  await untilStatus("finished");
  await cursor.pause(2000);

  // --- Act 4: a second program, to show the catalogue ----------------------
  await cursor.click(resetButton);
  await cursor.pause(600);

  await cursor.select(programSelect, "structuredInterruption");
  await cursor.pause(1600);

  await cursor.click(runButton);
  await untilStatus("finished");
  await cursor.pause(1200);

  // Ends on the fiber tree, where the interrupted children are the point of
  // this program.
  await cursor.moveToLocator(fiberTree, 900);
  await cursor.pause(2500);
}
