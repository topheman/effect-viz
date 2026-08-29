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
 * Three things make this harder than a CSS selector. Monaco splits a line
 * across a span per token, so the text being searched for is rarely inside a
 * single node; it renders only the lines near the viewport, so anything below
 * the fold is absent from the DOM entirely; and the page holds a second,
 * zero-sized editor whose content would otherwise match first.
 *
 * `within` disambiguates: pass a longer string that contains `needle` when the
 * needle alone would match somewhere else on screen. Searching for "5" in the
 * retry program finds `if (n < 5)` long before `Schedule.recurs(5)`.
 */
async function locateText(
  page: Page,
  needle: string,
  { within }: { within?: string } = {},
): Promise<Point | null> {
  return page.evaluate(
    ({ needle, within }: { needle: string; within?: string }) => {
      const editor = [...document.querySelectorAll(".view-lines")].find(
        (el) => el.getBoundingClientRect().height > 0,
      );
      if (!editor) return null;

      // Monaco renders indentation and gaps as non-breaking spaces, so a needle
      // typed with ordinary spaces never matches the DOM text. Substituting one
      // character for another keeps every offset below valid.
      const normalise = (value: string) => value.replace(/\u00A0/g, " ");

      const context = normalise(within ?? needle);
      const offsetInContext = within ? context.indexOf(normalise(needle)) : 0;
      if (offsetInContext < 0) return null;

      for (const line of editor.querySelectorAll(".view-line")) {
        const text = normalise(line.textContent ?? "");
        const at = text.indexOf(context);
        if (at < 0) continue;

        // Map a character offset in the line onto the text node that holds it.
        const target = at + offsetInContext;
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let seen = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const length = node.textContent?.length ?? 0;
          if (seen + length > target) {
            const range = document.createRange();
            range.setStart(node, target - seen);
            // The needle can spill into the next span; clamping to this node is
            // enough, because only the left edge of the rect is used.
            range.setEnd(node, Math.min(length, target - seen + needle.length));
            const rect = range.getBoundingClientRect();
            return { x: rect.left, y: rect.top + rect.height / 2 };
          }
          seen += length;
        }
      }
      return null;
    },
    { needle, within },
  );
}

/**
 * Scrolls the editor until a piece of text is rendered, then returns its
 * position. Monaco virtualises, so a target below the fold has to be brought
 * into the DOM before it can be pointed at.
 */
async function revealText(
  page: Page,
  cursor: Cursor,
  needle: string,
  options: { within?: string } = {},
): Promise<Point> {
  const found = await locateText(page, needle, options);
  if (found) return found;

  // The wheel acts on whatever is under the pointer, so it has to be over the
  // editor before scrolling, not wherever the last beat left it.
  const editorBox = await page
    .locator(".view-lines")
    .filter({ visible: true })
    .first()
    .boundingBox();
  if (editorBox) {
    await cursor.moveTo({
      x: editorBox.x + editorBox.width / 2,
      y: editorBox.y + editorBox.height / 3,
    });
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    await cursor.scroll(300, { steps: 4 });
    const point = await locateText(page, needle, options);
    if (point) return point;
  }
  throw new Error(
    `Cannot reach "${needle}" in the editor. Scrolling only goes down from ` +
      "where the editor already is, so a target above the fold is out of reach.",
  );
}

/**
 * Hovers an identifier and holds until Monaco has a type to show.
 *
 * The widget opens well before it has an answer: the first hover of a session
 * waits on the TypeScript worker to load the program, and reads "Loading..."
 * for about two seconds meanwhile. Waiting on the content instead of guessing a
 * dwell keeps the beat as short as the language service allows, and stops the
 * video moving on while the tooltip is still empty.
 */
async function hoverType(
  page: Page,
  cursor: Cursor,
  point: Point,
  { hold = 900, timeout = 8_000 }: { hold?: number; timeout?: number } = {},
) {
  await cursor.moveTo(point);
  await page
    .waitForFunction(
      () => {
        const widget = [...document.querySelectorAll(".monaco-hover")].find(
          (el) => el.getBoundingClientRect().height > 0,
        );
        const text = widget?.textContent?.trim();
        return Boolean(text) && text !== "Loading...";
      },
      undefined,
      { timeout },
    )
    .catch(() => {
      // A missing tooltip is not worth failing a recording over; the beat just
      // reads as a pause over the code.
    });
  await cursor.pause(hold);
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

  /** Blocks until the playback bar reports a state, so beats never race the run. */
  const untilStatus = (state: string, timeout = 60_000) =>
    status.filter({ hasText: new RegExp(`^${state}$`) }).waitFor({ timeout });

  const untilNotStatus = (state: string, timeout = 30_000) =>
    status
      .filter({ hasNotText: new RegExp(`^${state}$`) })
      .waitFor({ timeout });

  /**
   * Runs the program and waits for *this* run to end.
   *
   * Waiting for `finished` on its own is only safe from a standing start. Press
   * Run on a program that has already finished and the status still reads
   * `finished` at the moment of the press, so the wait would return before the
   * new run had produced anything, and the beat after it would describe the
   * previous run's results. Watching the status leave that state first anchors
   * the wait to this press; from `idle` or `paused` it passes straight through.
   */
  const runToCompletion = async () => {
    await cursor.click(runButton);
    await untilNotStatus("finished");
    await untilStatus("finished");
  };

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

  // --- Act 1: run it once at full speed and read the three views -----------
  await cursor.click(runButton);

  // Panels are resizable, and the Basic Example needs the room: at the default
  // split the third fiber lane is cut off by the time axis. Fifty pixels puts
  // all three on screen. Done while the program is still running, so the lanes
  // arrive into a panel that already fits them.
  await cursor.drag(
    await timelineHandlePoint(page),
    { x: 0, y: -50 },
    { duration: 700 },
  );
  await cursor.pause(250);

  // Ask the editor for a type. The first answer of a session takes seconds to
  // come back, which is why the beat is held on the content rather than on a
  // timer; it also warms the language service for the edit in act 3.
  await hoverType(
    page,
    cursor,
    await revealText(page, cursor, "worker1", { within: "const worker1" }),
    { hold: 700 },
  );

  await untilStatus("finished");
  await cursor.pause(300);

  await cursor.moveToLocator(fiberTree);
  await cursor.pause(520);
  await cursor.moveToLocator(executionLog);
  await cursor.pause(560);
  mark("act 1 — run and inspect");

  // --- Act 2: same program, slower clock, then step through it -------------
  // The speed change lands between two runs of the same program on purpose:
  // the only thing that differs is how long it takes, which is the point.
  await cursor.select(speedSelect, "0.5");

  await cursor.click(runButton);
  await untilStatus("running");
  await cursor.pause(600);

  await cursor.click(pauseButton);
  await untilStatus("paused");
  await cursor.pause(500);

  for (let i = 0; i < 2; i++) {
    await cursor.click(stepButton);
    await cursor.pause(380);
  }

  await runToCompletion();
  await cursor.pause(700);
  mark("act 2 — slow down and step");

  // --- Act 3: the editor is live, and the runtime says so ------------------
  await cursor.click(resetButton);
  await cursor.pause(400);
  await cursor.select(speedSelect, "1");

  // Renaming a span keeps the run the same length, and the new names come back
  // out of the runtime in the execution log — which is the point being made.
  // Double-clicking selects one `task`; selecting every occurrence puts a caret
  // on the second worker too, so one three-letter edit renames both spans.
  const span = await revealText(page, cursor, "task", {
    within: "worker-1-task",
  });
  await cursor.doubleClick({ x: span.x + 3, y: span.y });
  await cursor.pause(250);
  await page.keyboard.press("ControlOrMeta+Shift+L");
  await cursor.pause(650);
  await page.keyboard.type("job", { delay: 110 });
  await cursor.pause(550);

  await runToCompletion();
  await cursor.pause(650);
  mark("act 3 — edit and re-run");

  // --- Act 4: break the retry policy and watch the run go red --------------
  await cursor.click(resetButton);
  await cursor.pause(250);

  await cursor.select(programSelect, "retryExponentialBackoff");
  await cursor.pause(350);

  await runToCompletion();
  await cursor.pause(450);

  // `flakyEffect` only succeeds once n >= 5, and the `if (n < 5)` guard is left
  // alone, so cutting the schedule to three retries makes failure certain.
  const recurs = await revealText(page, cursor, "5", {
    within: "Schedule.recurs(5)",
  });
  await cursor.doubleClick({ x: recurs.x + 3, y: recurs.y });
  await cursor.pause(300);
  await page.keyboard.type("3", { delay: 110 });
  await cursor.pause(450);

  await runToCompletion();
  await cursor.pause(700);

  await cursor.moveToLocator(fiberTree);
  await cursor.pause(950);
  mark("act 4 — break the retry policy");

  // --- Close on the about box, the way the hand-made video did -------------
  await cursor.click(infoButton);
  await cursor.pause(1500);
  mark("act 5 — about");
}
