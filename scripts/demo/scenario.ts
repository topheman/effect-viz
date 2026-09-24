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

import type { Frame, Locator, Page } from "playwright";

import type { Cursor, Point } from "./cursor.ts";
import { appFrame, type Finger, rotate } from "./phone.ts";

export const VIEWPORT = { width: 1440, height: 810 };

interface ScenarioContext {
  page: Page;
  cursor: Cursor;
  /** Records the elapsed time at an act boundary. */
  mark: (label: string) => void;
}

interface PhoneScenarioContext {
  page: Page;
  finger: Finger;
  mark: (label: string) => void;
}

/**
 * The grab point of the resize separator just before a panel: above it in a
 * column, to its left in a row.
 *
 * Returns a point rather than a locator because separators are zero-sized
 * elements, which Playwright does not count as visible. The layout holds
 * several under library-generated ids, so the one wanted is found structurally:
 * it is the sibling immediately before the panel that holds `panelText`.
 */
async function handleBefore(page: Page, panelText: string): Promise<Point> {
  const point = await page.evaluate((panelText: string) => {
    // Panels nest, and every ancestor of a panel contains its text too.
    // Document order puts ancestors first, so the innermost match is the last.
    const panels = [
      ...document.querySelectorAll('[data-slot="resizable-panel"]'),
    ].filter((panel) => {
      const rect = panel.getBoundingClientRect();
      // The mobile layout is rendered too, collapsed to zero size.
      if (rect.width === 0 || rect.height === 0) return false;
      return panel.textContent?.includes(panelText);
    });

    const handle = panels.at(-1)?.previousElementSibling;
    if (handle?.getAttribute("role") !== "separator") return null;

    const rect = handle.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, panelText);

  if (!point)
    throw new Error(`Cannot find the resize handle before "${panelText}"`);
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
export async function locateText(
  page: Page | Frame,
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
  const logList = page
    // The console's log list shares these classes, minus the overflow-x.
    .locator("div.overflow-x-hidden.overflow-y-auto.font-mono")
    .filter({ visible: true })
    .first();
  const logOptions = page
    .locator('[data-onboarding-step="logOptions"]')
    .filter({ visible: true })
    .first();
  /** The explain button on a log row, numbered as the log numbers it. */
  const explainButton = (row: number) =>
    logList
      .locator(":scope > div")
      .nth(row - 1)
      .getByRole("button", { name: "Explain this event" });

  /** Blocks until the playback bar reports a state, so beats never race the run. */
  const untilStatus = (state: string, timeout = 60_000) =>
    status.filter({ hasText: new RegExp(`^${state}$`) }).waitFor({ timeout });

  /**
   * Blocks until the Timeline has bars on it.
   *
   * `running` is reported by the playback bar as soon as the runtime starts,
   * which is a beat before the run's first events have crossed out of the
   * container and been drawn. A beat that changes what execution looks like has
   * to wait for that, or it lands on an empty panel.
   */
  const untilTimelineDrawn = (timeout = 30_000) =>
    page
      .getByText("No events to display")
      .filter({ visible: true })
      .first()
      .waitFor({ state: "hidden", timeout });

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
  await cursor.pause(650);

  // --- Act 1: run it once at full speed and read the three views -----------
  await cursor.click(runButton);

  // Panels are resizable, and the Basic Example needs the room: at the default
  // split the third fiber lane is cut off by the time axis. Fifty pixels puts
  // all three on screen. Done while the program is still running, so the lanes
  // arrive into a panel that already fits them.
  await cursor.drag(
    await handleBefore(page, "Visualize concurrency, delays"),
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
  await cursor.pause(250);

  await cursor.moveToLocator(fiberTree);
  await cursor.pause(460);
  await cursor.moveToLocator(executionLog);
  await cursor.pause(500);
  mark("act 1 — run and inspect");

  // --- Act 2: slow the clock mid-run, then step through it -----------------
  // Picking a speed on a stopped program starts the run itself, so there is no
  // Run press here.
  await cursor.select(speedSelect, "0.5");
  await untilStatus("running");
  await untilTimelineDrawn();

  // The second pick lands on the live program: the run does not restart, it
  // changes slope where it stands. It follows the first with no beat between
  // them because the whole Basic Example is only about 1.5 virtual seconds
  // long — every beat below has to fit in what is left of it, and a change that
  // lands near the end has nothing left to be visible in.
  await cursor.select(speedSelect, "0.25");

  // No beat between the pick and the pause: the slower slope stays on screen
  // for the second the pointer takes to travel to Pause, and pausing early
  // leaves enough of the program for the steps below to walk through.
  await cursor.click(pauseButton);
  await untilStatus("paused");
  await cursor.pause(400);

  // Several presses, not one: a single step reads as a twitch, while a run of
  // them shows the ladder — one event released per press, the log growing a
  // line at a time. Stepping costs no wall clock, because a paused program only
  // advances when it is told to, so this is the one beat the 1.5 virtual
  // seconds of the Basic Example do not have to pay for.
  for (let i = 0; i < 3; i++) {
    // Stepping off the end of the program does not stop: from `finished`, Step
    // starts a fresh gated run, which would blank the panels mid-act.
    if ((await status.textContent())?.trim() !== "paused") break;
    await cursor.click(stepButton);
    await cursor.pause(430);
  }

  // The act ends here, paused part way through: resuming would cost five
  // seconds of watching a quarter-speed run reach an end act 1 already showed,
  // and act 3 switches program, which tears the paused run down anyway.
  await cursor.pause(600);
  mark("act 2 — slow down mid-run, then step");

  // --- Act 3: the log explains what the runtime did -----------------------
  // Choosing a program runs it, so there is no Run press. Nested Forks is the
  // program where indenting by fiber depth reads best: each fork steps the log
  // one column to the right. It runs at the quarter speed act 2 left behind,
  // which stretches its half second into two that the staircase can be seen
  // building in.
  await cursor.select(programSelect, "nestedForks");
  await untilStatus("finished");
  await cursor.pause(500);

  // The explanations are a sentence each, and the log shares the top row with
  // the Fiber Tree, which needs little width for four fibers. Widening the log
  // keeps each explanation to a line.
  await cursor.drag(
    await handleBefore(page, "Step-by-step execution events"),
    { x: -150, y: 0 },
    { duration: 700 },
  );

  // The log follows the run to its end, while the hints worth reading are at
  // the top, where the forks happen. Small wheel ticks read as a glide; large
  // ones jump several rows a frame and look like the log failing to render.
  await cursor.moveToLocator(logList);
  const scrolled = await logList.evaluate((el) => el.scrollTop);
  await cursor.scroll(-scrolled, { steps: Math.ceil(scrolled / 30) });
  await cursor.pause(300);

  for (const row of [2, 4]) {
    await cursor.click(explainButton(row));
    await cursor.pause(1300);
  }

  // Hiding the scheduling events leaves the fork staircase and the spans.
  await cursor.click(logOptions);
  await cursor.pause(500);
  await cursor.click(page.getByRole("checkbox", { name: /^Scheduling/ }));
  await cursor.pause(700);
  await page.keyboard.press("Escape");
  await cursor.moveToLocator(logList);
  await cursor.pause(1100);
  mark("act 3 — explain and filter the log");

  // --- Act 4: break the retry policy and watch the run go red --------------
  // Back to full speed on the live run: it retunes where it stands, and the
  // retries are meant to be read at the pace of act 1.
  await cursor.select(programSelect, "retryExponentialBackoff");
  await cursor.select(speedSelect, "1");
  await untilStatus("finished");
  await cursor.pause(350);

  // `flakyEffect` only succeeds once n >= 5, and the `if (n < 5)` guard is left
  // alone, so cutting the schedule to three retries makes failure certain.
  const recurs = await revealText(page, cursor, "5", {
    within: "Schedule.recurs(5)",
  });
  await cursor.doubleClick({ x: recurs.x + 3, y: recurs.y });
  // The pointer sits on the digit it selected; moving it off shows the
  // selection, and then the edit, instead of hiding both under the glyph.
  await cursor.moveTo({ x: recurs.x + 40, y: recurs.y + 45 }, 350);
  await cursor.pause(300);
  await page.keyboard.type("3", { delay: 110 });
  await cursor.pause(350);

  await runToCompletion();
  await cursor.pause(550);

  await cursor.moveToLocator(fiberTree);
  await cursor.pause(600);
  mark("act 4 — break the retry policy");
}

/**
 * The mobile half: the same app on a phone, where the editor is read-only and
 * a tap stands in for every hover. It ends on the about box, the way the
 * hand-made video did.
 */
export async function runPhoneScenario({
  page,
  finger,
  mark,
}: PhoneScenarioContext) {
  const { app } = finger;
  // The desktop and mobile layouts are both rendered; only one is on screen.
  const visible = (locator: Locator) =>
    locator.filter({ visible: true }).first();
  const runButton = visible(
    app.getByRole("button", { name: "Run", exact: true }),
  );
  const status = visible(app.getByTestId("playback-status"));
  const logList = visible(
    app.locator("div.overflow-x-hidden.overflow-y-auto.font-mono"),
  );
  const tab = (name: string) => visible(app.getByRole("tab", { name }));

  await runButton.waitFor({ state: "visible", timeout: 60_000 });
  while (!(await runButton.isEnabled())) await finger.pause(100);

  // The editor mounts after Run is enabled, and the boot log below it keeps
  // growing for a moment, pushing it around. Ready is when the word about to
  // be tapped has held still for a few frames: a tap on a line that moved
  // under the finger can land on a fold arrow instead.
  const { frame, origin } = await appFrame(page);
  const findTarget = () =>
    locateText(frame, "worker1", { within: "const worker1" });
  let target: Point | null = null;
  for (let tries = 0, still = 0; still < 3 && tries < 100; tries++) {
    const next = await findTarget();
    still = next && target && next.y === target.y ? still + 1 : 0;
    target = next;
    await finger.pause(100);
  }
  if (!target) throw new Error("Cannot find `worker1` in the phone's editor");
  mark("ready");
  await finger.pause(600);

  // --- A tap shows a type ---------------------------------------------------
  // Touch has no hover, so a tap that places the caret opens the type card.
  // It shows the fiber type effect's own declarations infer, even though a
  // phone never gets the compiler the desktop editor runs on. The word sits
  // low enough in the editor for the card to open above it unclipped.
  await finger.tap({ x: origin.x + target.x + 20, y: origin.y + target.y });
  await frame
    .waitForFunction(
      () => {
        const widget = [...document.querySelectorAll(".monaco-hover")].find(
          (el) => el.getBoundingClientRect().height > 0,
        );
        const text = widget?.textContent?.trim();
        return Boolean(text) && text !== "Loading...";
      },
      undefined,
      { timeout: 8_000 },
    )
    .catch(() => {});
  await finger.lift();
  await finger.pause(2200);
  mark("phone — tap for a type");

  // --- Run in portrait: the three views stack -------------------------------
  // The card is sticky, and would float over the visualizer. On a device the
  // tap on Run is what dismisses it, so it goes as the finger comes down.
  await frame.press(".monaco-editor textarea >> visible=true", "Escape");
  await finger.tap(runButton);
  await status.filter({ hasText: /^finished$/ }).waitFor({ timeout: 30_000 });
  await finger.lift();
  await finger.pause(900);
  mark("phone — run in portrait");

  // --- Landscape: one view at a time, behind tabs ---------------------------
  await rotate(page, "landscape");
  await finger.pause(800);

  // A tap anywhere on a row opens its explanation; the icon is too small a
  // target for a finger.
  await finger.tap(logList.locator(":scope > div").nth(3));
  await finger.pause(1500);
  await finger.tap(tab("Timeline"));
  await finger.pause(1200);
  await finger.tap(tab("Fiber Tree"));
  await finger.pause(900);
  mark("phone — landscape tabs");

  // --- And back ---------------------------------------------------------------
  await finger.lift();
  await rotate(page, "portrait");
  await finger.pause(1100);
  await finger.tap(visible(app.locator('[data-onboarding-step="info"]')));
  await finger.lift();
  await finger.pause(1500);
  mark("phone — back to portrait, about");
}
