import {
  expect,
  logRows,
  openApp,
  playbackStatus,
  runButton,
  test,
} from "./utils";

// Runs in the `iphone` project (playwright.config.ts), an iPhone SE: the
// narrowest common phone, which turned sideways stays under both the `md` width
// and the 500px `short:` height the landscape layout needs.

test("a phone gets a read-only editor and still runs the examples", async ({
  page,
}) => {
  await openApp(page);

  const editor = page.locator(".view-lines").filter({ visible: true });
  // Monaco draws the source after the page is ready, and WebKit on a slow
  // machine takes more than the default 5 seconds.
  await expect(editor).toContainText("rootEffect", { timeout: 30_000 });
  const source = await editor.textContent();
  await editor.locator(".view-line").nth(2).tap();
  await page.keyboard.type("broken");
  await expect(editor).toHaveText(source ?? "");

  await runButton(page).tap();
  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });
  expect((await logRows(page)).map((row) => row.text)).toContain(
    "effect:ended finalization [success]",
  );
});

test("a phone in landscape shows one view at a time", async ({
  page,
  viewport,
}) => {
  const { width, height } = viewport!;
  await page.setViewportSize({ width: height, height: width });
  await openApp(page);
  await runButton(page).tap();
  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });

  await page.getByRole("tab", { name: "Execution Log" }).tap();
  expect(await logRows(page)).not.toEqual([]);

  await page.getByRole("tab", { name: "Timeline" }).tap();
  expect(await logRows(page)).toEqual([]);
  await expect(page.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
