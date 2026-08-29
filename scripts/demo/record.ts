/**
 * Records the README demo video by replaying `scenario.ts` in a real browser.
 *
 * Record against a production build. The WebContainer boots much faster there
 * than under the dev server, and that boot is dead time at the head of the
 * video.
 *
 *   npm run build && npm run preview
 *   npm run demo:record
 *
 * The dev server works too, via `--url`. Both send the
 * `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers the
 * WebContainer needs: Vite applies the `server.headers` from `vite.config.ts`
 * to the preview server as well.
 *
 * Flags:
 *   --url=<url>     app to record (default http://localhost:4173)
 *   --headed        show the browser while it plays
 *   --keep-webm     keep the raw Playwright capture next to the mp4
 */

import { spawnSync } from "node:child_process";
import { mkdir, readdir, rm, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { Cursor, installCursor } from "./cursor.ts";
import { runScenario, VIEWPORT } from "./scenario.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const OUT_DIR = path.join(ROOT, "recordings");

/** How much of the WebContainer boot to keep at the head of the video. */
const BOOT_LEAD_IN_SECONDS = 0.8;

function flag(name: string): string | undefined {
  const match = process.argv
    .slice(2)
    .find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!match) return undefined;
  const [, value] = match.split("=");
  return value ?? "";
}

async function main() {
  const url = flag("url") || "http://localhost:4173";
  const headed = flag("headed") !== undefined;
  const keepWebm = flag("keep-webm") !== undefined;

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });

  // A fresh profile would start the onboarding tour, whose pulsing highlights
  // fight with the scripted pointer for the viewer's attention.
  await context.addInitScript(() => {
    localStorage.setItem(
      "effect-flow-onboarding",
      JSON.stringify({
        completed: "info",
        version: 1,
        date: new Date().toISOString(),
      }),
    );
  });

  await installCursor(context);

  const page = await context.newPage();
  // Video capture starts with the page, so this is frame zero.
  const videoStartedAt = Date.now();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[page]", msg.text());
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch (cause) {
    throw new Error(
      `Cannot reach ${url}. Serve a build with ` +
        "`npm run build && npm run preview` first, or point --url at a dev server.",
      { cause },
    );
  }

  const cursor = new Cursor(page);

  // Act timings, so the length can be trimmed against measurements. The clock
  // starts when the app is ready, because the WebContainer boot happens before
  // the recording has anything worth showing and varies run to run.
  let clockStart = Date.now();
  let readyAt = Date.now();
  const mark = (label: string) => {
    if (label === "ready") {
      clockStart = Date.now();
      readyAt = clockStart;
    }
    const elapsed = (Date.now() - clockStart) / 1000;
    console.log(`  ${elapsed.toFixed(1).padStart(5)}s  ${label}`);
  };

  console.log("\nScenario:");
  await runScenario({ page, cursor, mark });

  // The video file is only flushed once the context closes, and it is named
  // after an internal id, so it can only be located afterwards.
  await context.close();
  await browser.close();

  const webm = (await readdir(OUT_DIR)).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("Playwright produced no video file");

  const rawPath = path.join(OUT_DIR, "demo.webm");
  await rename(path.join(OUT_DIR, webm), rawPath);

  // Everything before the app is usable is WebContainer boot, whose length
  // swings by seconds between machines and would otherwise decide whether the
  // video comes in under a minute. Keep a glimpse of it for context and cut the
  // rest, so the running time is set by the scenario alone.
  const bootSeconds = (readyAt - videoStartedAt) / 1000;
  const trim = Math.max(0, bootSeconds - BOOT_LEAD_IN_SECONDS);

  const mp4Path = path.join(OUT_DIR, "demo.mp4");
  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      trim.toFixed(2),
      "-i",
      rawPath,
      // GitHub only plays H.264 in an MP4 container, and yuv420p is the pixel
      // format Safari needs; the even-dimension filter keeps H.264 happy if the
      // viewport is ever set to an odd size.
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "20",
      "-preset",
      "slow",
      "-movflags",
      "+faststart",
      "-an",
      mp4Path,
    ],
    { stdio: "inherit" },
  );

  if (ffmpeg.error || ffmpeg.status !== 0) {
    console.warn(`\nffmpeg unavailable or failed; keeping ${rawPath}`);
    return;
  }

  if (!keepWebm) await rm(rawPath);
  console.log(
    `\nRecorded ${path.relative(ROOT, mp4Path)} ` +
      `(trimmed ${trim.toFixed(1)}s of boot from the head)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
