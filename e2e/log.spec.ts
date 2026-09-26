import {
  expect,
  explainRow,
  logOptions,
  logRows,
  openApp,
  playbackStatus,
  startProgram,
  test,
} from "./utils";

async function runToEnd(page: Parameters<typeof openApp>[0], key: string) {
  await openApp(page);
  await startProgram(page, key);
  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });
}

test("explains the finalizer order", async ({ page }) => {
  await runToEnd(page, "basicFinalizers");
  await expect(await explainRow(page, "finalizer finalizer-3")).toHaveText(
    "Finalizers run in reverse order of registration.",
  );
});

test("filters hide their group of events", async ({ page }) => {
  await runToEnd(page, "nestedForks");
  const texts = async () => (await logRows(page)).map((row) => row.text);
  const scheduling = /^fiber:(suspend|resume) /;
  expect((await texts()).some((row) => scheduling.test(row))).toBe(true);

  await logOptions(page).click();
  await page.getByRole("checkbox", { name: /^Scheduling/ }).uncheck();
  await page.getByRole("checkbox", { name: /^Spans/ }).uncheck();
  await page.keyboard.press("Escape");

  const rows = await texts();
  expect(rows.filter((row) => scheduling.test(row))).toEqual([]);
  expect(rows.filter((row) => row.startsWith("effect:"))).toEqual([]);
  expect(rows.filter((row) => row.startsWith("fiber:forked "))).toHaveLength(4);
});

test("explains a span that interruption ended", async ({ page }) => {
  await runToEnd(page, "structuredInterruption");
  await expect(await explainRow(page, "effect:ended child-1")).toHaveText(
    "Interruption ends the open span as a failure.",
  );
});
