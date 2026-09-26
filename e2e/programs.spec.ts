import {
  expect,
  type LogRow,
  logRows,
  openApp,
  pauseButton,
  playbackStatus,
  programSelect,
  startProgram,
  stepButton,
  test,
} from "./utils";

/**
 * Every example program, run to its end, with the behaviour it exists to teach.
 * Rows are matched on span, finalizer and retry labels, which the programs
 * choose, and never on fiber ids or on the fibers operators fork for
 * themselves, which belong to the runtime.
 */

/** Position of the first row that reads exactly `text`; fails when there is none. */
function at(rows: LogRow[], text: string): number {
  const index = rows.findIndex((row) => row.text === text);
  expect(index, `row "${text}"`).toBeGreaterThanOrEqual(0);
  return index;
}

function inOrder(rows: LogRow[], ...texts: string[]) {
  const positions = texts.map((text) => at(rows, text));
  expect(positions, texts.join(" → ")).toEqual(
    [...positions].sort((a, b) => a - b),
  );
}

const count = (rows: LogRow[], pattern: RegExp) =>
  rows.filter((row) => pattern.test(row.text)).length;

const programs: Record<string, (rows: LogRow[]) => void> = {
  basic: (rows) => {
    inOrder(
      rows,
      "effect:ended initialization [success]",
      "effect:started worker-1-task",
      "effect:started worker-2-task",
      "effect:ended worker-1-task [success]",
      "effect:ended worker-2-task [success]",
      "effect:ended finalization [success]",
    );
  },

  multiStep: (rows) => {
    inOrder(
      rows,
      "effect:ended step-1-prepare [success]",
      "effect:started step-2-process",
      "effect:ended step-2-process [success]",
      "effect:started step-3-cleanup",
      "effect:ended step-3-cleanup [success]",
    );
  },

  nestedForks: (rows) => {
    const indents = ["parent-init", "child-init", "grandchild-task"].map(
      (label) => rows[at(rows, `effect:started ${label}`)].indent,
    );
    expect(indents[1], "child indented past parent").toBeGreaterThan(
      indents[0],
    );
    expect(indents[2], "grandchild indented past child").toBeGreaterThan(
      indents[1],
    );
    at(rows, "effect:ended grandchild-task [success]");
  },

  interleaving: (rows) => {
    expect(
      rows
        .filter((row) => row.text.startsWith("effect:started"))
        .map((row) => row.text.replace("effect:started ", "")),
    ).toEqual([
      "A-step-1",
      "B-step-1",
      "A-step-2",
      "B-step-2",
      "A-step-3",
      "B-step-3",
    ]);
  },

  racing: (rows) => {
    at(rows, "effect:ended race-join [success]");
    // The slow runner loses and is interrupted.
    expect(count(rows, /^fiber:interrupted /)).toBeGreaterThanOrEqual(1);
  },

  boundedConcurrency: (rows) => {
    let open = 0;
    let mostOpen = 0;
    for (const { text } of rows) {
      if (/^effect:started task-\d$/.test(text)) open++;
      if (/^effect:ended task-\d /.test(text)) open--;
      mostOpen = Math.max(mostOpen, open);
    }
    expect(mostOpen, "tasks running at once").toBe(2);
    for (const id of [1, 2, 3, 4, 5]) {
      at(rows, `effect:ended task-${id} [success]`);
    }
  },

  structuredInterruption: (rows) => {
    // Interrupting the parent reaches both children, which it never names.
    at(rows, "effect:ended child-1 [failure]");
    at(rows, "effect:ended child-2 [failure]");
    at(rows, "finalizer parent-cleanup");
    at(rows, "finalizer child-1-cleanup");
    at(rows, "finalizer child-2-cleanup");
    expect(count(rows, /^fiber:interrupted /)).toBeGreaterThanOrEqual(3);
  },

  failureAndRecovery: (rows) => {
    inOrder(
      rows,
      "effect:ended setup [success]",
      "effect:ended risky-step [failure]",
      "effect:ended recovery [success]",
    );
  },

  retry: (rows) => {
    expect(count(rows, /^retry:attempt #\d+ flaky-task /)).toBe(2);
    at(rows, "effect:ended flaky-task [success]");
  },

  retryExponentialBackoff: (rows) => {
    expect(count(rows, /^retry:attempt #\d+ flaky-task /)).toBe(4);
    at(rows, "effect:ended flaky-task [success]");
  },

  timeout: (rows) => {
    at(rows, "effect:ended quick-task [success]");
    // The deadline interrupts the slow task, which ends its span as a failure.
    at(rows, "effect:ended slow-task [failure]");
  },

  basicFinalizers: (rows) => {
    inOrder(
      rows,
      "effect:ended step-2 [success]",
      "finalizer finalizer-3",
      "finalizer finalizer-2",
      "finalizer finalizer-1",
    );
  },

  acquireRelease: (rows) => {
    inOrder(
      rows,
      "acquire connection",
      "effect:ended use-connection [success]",
      "finalizer connection:release",
    );
  },

  loggerWithRequirements: (rows) => {
    at(rows, "effect:ended log-message [success]");
  },
};

test("covers every program in the picker", async ({ page }) => {
  await openApp(page);
  const options = await programSelect(page)
    .locator("option")
    .evaluateAll((all) =>
      all.map((option) => (option as HTMLOptionElement).value),
    );
  expect(options.toSorted()).toEqual(
    [...Object.keys(programs), "deadlock"].toSorted(),
  );
});

for (const [key, check] of Object.entries(programs)) {
  test(`${key} runs to the end`, async ({ page }) => {
    await openApp(page);
    await startProgram(page, key);
    await expect(playbackStatus(page)).toHaveText("finished", {
      timeout: 30_000,
    });
    check(await logRows(page));
  });
}

test("deadlock leaves Step nothing to run", async ({ page }) => {
  await openApp(page);
  await startProgram(page, "deadlock");
  // A deadlocked run still reads as running: only a step can find out that
  // nothing is left to release.
  await expect
    .poll(
      async () => count(await logRows(page), /^effect:started waits-for-/),
      { timeout: 30_000 },
    )
    .toBe(2);
  await pauseButton(page).click();

  // Each step's outcome arrives asynchronously, and only a step that finds
  // nothing runnable disables the button.
  await expect(async () => {
    if (await stepButton(page).isEnabled()) {
      await stepButton(page).click({ timeout: 1_000 });
    }
    await expect(stepButton(page)).toBeDisabled({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(playbackStatus(page)).toHaveText("paused");
  expect(count(await logRows(page), /^effect:ended /)).toBe(0);
});
