import {
  expect,
  logRows,
  openApp,
  pauseButton,
  playbackStatus,
  programSelect,
  resetButton,
  runButton,
  speedSelect,
  stepButton,
  test,
} from "./utils";

/**
 * Starts the Basic Example at a quarter of its speed and waits for its workers
 * to start: a 1.5 second program then lasts six, which leaves room to act on it
 * mid-run. Picking a speed runs the stopped program.
 */
async function startSlowBasic(page: Parameters<typeof openApp>[0]) {
  await openApp(page);
  await speedSelect(page).selectOption("0.25");
  await expect
    .poll(async () => (await logRows(page)).map((row) => row.text), {
      timeout: 30_000,
    })
    .toContain("effect:started worker-1-task");
}

const texts = async (page: Parameters<typeof openApp>[0]) =>
  (await logRows(page)).map((row) => row.text);

test("changing speed mid-run retunes the run without restarting it", async ({
  page,
}) => {
  await startSlowBasic(page);
  // A restart would draw a new log, with new fiber ids.
  const before = await texts(page);

  await speedSelect(page).selectOption("1");
  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });
  expect((await texts(page)).slice(0, before.length)).toEqual(before);
});

test("a paused run moves only when stepped", async ({ page }) => {
  await startSlowBasic(page);
  await pauseButton(page).click();
  await expect(playbackStatus(page)).toHaveText("paused");

  const paused = await texts(page);
  // Unpaused, the run would log its workers' suspends within this second.
  await page.waitForTimeout(1_000);
  expect(await texts(page)).toEqual(paused);

  await stepButton(page).click();
  await expect
    .poll(async () => (await texts(page)).length)
    .toBeGreaterThan(paused.length);
  await expect(playbackStatus(page)).toHaveText("paused");
});

test("Step on a finished run starts a fresh one, paused", async ({ page }) => {
  await openApp(page);
  await runButton(page).click();
  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });
  const finished = await texts(page);

  await stepButton(page).click();
  await expect(playbackStatus(page)).toHaveText("paused");
  // The status turns `paused` before the new run is up, so wait for its first
  // event before resuming it.
  await expect.poll(async () => (await texts(page)).length).toBeGreaterThan(0);
  expect((await texts(page)).length).toBeLessThan(finished.length);

  await runButton(page).click();
  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });
});

test("Reset mid-run stops the run, and the next one runs whole", async ({
  page,
}) => {
  await startSlowBasic(page);
  await resetButton(page).click();

  await expect(playbackStatus(page)).toHaveText("idle");
  await expect
    .poll(async () => (await texts(page)).length, { timeout: 5_000 })
    .toBe(0);

  await speedSelect(page).selectOption("1");
  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });
  expect(await texts(page)).toContain("effect:ended finalization [success]");
});

test("switching program mid-run leaves nothing of the previous run", async ({
  page,
}) => {
  await startSlowBasic(page);
  await programSelect(page).selectOption("multiStep");

  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });
  const rows = await texts(page);
  expect(rows).toContain("effect:ended step-3-cleanup [success]");
  expect(
    rows.filter((row) => /initialization|worker-\d-task/.test(row)),
  ).toEqual([]);
});
