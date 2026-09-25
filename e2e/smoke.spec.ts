import { expect, openApp, playbackStatus, runButton, test } from "./utils";

test("runs the Basic Example to the end", async ({ page }) => {
  await openApp(page);
  // The picker is rendered twice, for the desktop and mobile layouts.
  await expect(
    page.locator('select[data-onboarding-step="programSelect"]').first(),
  ).toHaveValue("basic");

  await runButton(page).click();

  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });
});
