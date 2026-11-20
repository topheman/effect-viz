import {
  changesButton,
  expect,
  logRows,
  openApp,
  playbackStatus,
  runButton,
  startProgram,
  stepButton,
  logRow,
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

test("a phone in landscape follows a change's row to the log tab", async ({
  page,
  viewport,
}) => {
  const { width, height } = viewport!;
  await page.setViewportSize({ width: height, height: width });
  await openApp(page);
  await startProgram(page, "racing");
  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });

  await page.getByRole("tab", { name: "Fiber Tree" }).tap();
  await changesButton(page).tap();
  await page.getByRole("button", { name: "Row 2 in the Execution Log" }).tap();

  await expect(
    page.getByRole("tab", { name: "Execution Log" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(logRow(page, 2)).toHaveAttribute("data-targeted");
  await expect(logRow(page, 2)).toBeInViewport();
});

// On the fallback path a yielded fiber can resume well after its suspend
// (always in WebKit, under load in Chromium), so the trace must say why a fiber
// suspends rather than leave it to timestamps.
test("a phone shows the change Cooperative Interleaving makes", async ({
  page,
}) => {
  await openApp(page);
  await startProgram(page, "interleaving");
  await expect(playbackStatus(page)).toHaveText("finished", {
    timeout: 30_000,
  });

  await expect(changesButton(page)).toHaveText(/v3 → v4 · 1/);
});

test("a phone opens the version pill", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: /^Effect \d/ }).tap();
  await expect(
    page.getByRole("navigation", { name: "Effect versions" }).getByRole("link"),
  ).toBeVisible();
});

// The phone runs programs in the browser rather than in a WebContainer, so this
// covers the other run path than playback.spec.ts's paused start.
test("a phone started with Step logs only the root's fork", async ({
  page,
}) => {
  await openApp(page);
  await stepButton(page).tap();
  await expect(playbackStatus(page)).toHaveText("paused", { timeout: 30_000 });
  const texts = async () => (await logRows(page)).map((row) => row.text);
  const started = await texts();
  expect(started).toHaveLength(1);
  expect(started[0]).toMatch(/^fiber:forked #\d+ \(root\)$/);

  await stepButton(page).tap();
  await expect
    .poll(async () => (await texts()).at(1))
    .toMatch(/^effect:started /);
  await expect(playbackStatus(page)).toHaveText("paused");
});
