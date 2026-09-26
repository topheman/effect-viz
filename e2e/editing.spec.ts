import {
  expect,
  logRows,
  openApp,
  playbackStatus,
  programSelect,
  runButton,
  test,
} from "./utils";

test("an edited program runs as edited", async ({ page }) => {
  await openApp(page);
  await programSelect(page).selectOption("retryExponentialBackoff");
  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });

  // The effect only succeeds on its fifth attempt, which three retries never
  // reach.
  await page
    .locator(".view-line")
    .filter({ visible: true, hasText: "Schedule.recurs(5)" })
    .click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("3");
  await expect(
    page.locator(".view-line").filter({ hasText: "Schedule.recurs(3)" }),
  ).toBeVisible();

  await runButton(page).click();
  // The status reads `finished` from the first run until this one starts.
  await expect(playbackStatus(page)).not.toHaveText("finished");
  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 60_000,
  });

  const rows = (await logRows(page)).map((row) => row.text);
  expect(rows.filter((row) => row.startsWith("retry:attempt "))).toHaveLength(
    3,
  );
  expect(rows).toContain("effect:ended flaky-task [failure]");
});
