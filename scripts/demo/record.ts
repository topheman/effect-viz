/**
 * Records the README demo video by replaying `scenario.ts` in a real browser:
 * a desktop take, then a phone take on the stage from `phone.ts`, joined with a
 * short crossfade.
 *
 * Record against a production build. The WebContainer boots much faster there
 * than under the dev server, and that boot is dead time at the head of the
 * video.
 *
 *   npm run build && npm run preview
 *   npm run demo:record
 *
 * Not the dev server: `StrictMode` runs every effect twice in development,
 * which can film states no user sees. The preview server sends the
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
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type Browser,
  type BrowserContextOptions,
  chromium,
  devices,
  type Page,
} from "playwright";

import { Cursor, installCursor } from "./cursor.ts";
import { Finger, installStage, STAGE_PATH } from "./phone.ts";
import { runPhoneScenario, runScenario, VIEWPORT } from "./scenario.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const OUT_DIR = path.join(ROOT, "recordings");

/** How much of the WebContainer boot to keep at the head of the video. */
const BOOT_LEAD_IN_SECONDS = 0.8;

/** Length of the crossfade from the desktop take into the phone take. */
const CROSSFADE_SECONDS = 0.6;

/**
 * The version the app is built with, read from the same `.env` the build reads.
 * Seeding the tour as finished under an older version would leave the steps
 * added since it pulsing through the recording.
 */
async function onboardingVersion(): Promise<number> {
  const env = await readFile(path.join(ROOT, ".env"), "utf8");
  const match = /^VITE_ONBOARDING_VERSION=(\d+)/m.exec(env);
  return match ? Number(match[1]) : 1;
}

function flag(name: string): string | undefined {
  const match = process.argv
    .slice(2)
    .find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!match) return undefined;
  const [, value] = match.split("=");
  return value ?? "";
}

interface Take {
  name: string;
  webm: string;
  /** Where the kept part starts and ends in the raw capture, in seconds. */
  from: number;
  to: number;
  marks: { at: number; label: string }[];
  failure?: unknown;
}

/**
 * Plays one scenario in a fresh context and keeps its raw capture.
 *
 * The kept part starts `leadIn` seconds before the scenario marks `ready`,
 * because everything earlier is boot, whose length swings by seconds between
 * machines. A scenario that fails halfway is exactly when the video is worth
 * having, so the failure is recorded on the take rather than thrown.
 */
async function recordTake(
  browser: Browser,
  {
    name,
    options,
    url,
    leadIn,
    prepare,
    play,
  }: {
    name: string;
    options: BrowserContextOptions;
    url: string;
    leadIn: number;
    prepare?: (
      context: Awaited<ReturnType<Browser["newContext"]>>,
    ) => Promise<void>;
    play: (page: Page, mark: (label: string) => void) => Promise<void>;
  },
): Promise<Take> {
  const dir = path.join(OUT_DIR, name);
  const context = await browser.newContext({
    ...options,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir, size: VIEWPORT },
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });

  // A fresh profile would start the onboarding tour, whose pulsing highlights
  // fight with the scripted pointer for the viewer's attention.
  await context.addInitScript(
    (version: number) => {
      localStorage.setItem(
        "effect-flow-onboarding",
        JSON.stringify({
          completed: "info",
          version,
          date: new Date().toISOString(),
        }),
      );
    },
    await onboardingVersion(),
  );
  await prepare?.(context);

  const page = await context.newPage();
  // Video capture starts with the page, so this is frame zero.
  const videoStartedAt = Date.now();
  const origin = new URL(url).origin;
  page.on("console", (msg) => {
    // The WebContainer's iframe warns about its own preloads; only the app's
    // warnings are ours to fix.
    const ours = msg.location().url.startsWith(origin);
    if (msg.type() === "error" || (msg.type() === "warning" && ours)) {
      console.error(`[${name}] ${msg.type()}:`, msg.text());
    }
  });
  page.on("pageerror", (error) => console.error(`[${name}] uncaught:`, error));

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch (cause) {
    throw new Error(
      `Cannot reach ${url}. Serve a build with ` +
        "`npm run build && npm run preview` first.",
      { cause },
    );
  }

  let readyAt = Date.now();
  const marks: Take["marks"] = [];
  const mark = (label: string) => {
    if (label === "ready") readyAt = Date.now();
    marks.push({ at: (Date.now() - readyAt) / 1000, label });
  };

  let failure: unknown;
  try {
    await play(page, mark);
  } catch (error) {
    failure = error;
    console.error(`\n${name} take failed. Encoding the partial take anyway.`);
  }
  const endedAt = Date.now();

  // The video file is only flushed once the context closes, and it is named
  // after an internal id, so it can only be located afterwards.
  await context.close();
  const webm = (await readdir(dir)).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error(`Playwright produced no video for ${name}`);

  const ready = (readyAt - videoStartedAt) / 1000;
  const from = Math.max(0, ready - leadIn);
  return {
    name,
    webm: path.join(dir, webm),
    from,
    to: (endedAt - videoStartedAt) / 1000,
    marks: marks.map((m) => ({ ...m, at: m.at + (ready - from) })),
    failure,
  };
}

/**
 * Joins the takes into one mp4, each cut to its kept part, with a crossfade
 * between them. `xfade` needs both sides at the same size, rate and timebase,
 * hence the normalising filters on every input.
 */
function encode(takes: Take[], mp4Path: string): boolean {
  const inputs = takes.flatMap((take) => [
    "-ss",
    take.from.toFixed(2),
    "-t",
    (take.to - take.from).toFixed(2),
    "-i",
    take.webm,
  ]);
  const norm = takes
    .map((_, i) => `[${i}:v]fps=25,settb=AVTB,format=yuv420p[v${i}]`)
    .join(";");
  let chain = norm;
  let last = "v0";
  let offset = 0;
  for (let i = 1; i < takes.length; i++) {
    offset += takes[i - 1].to - takes[i - 1].from - CROSSFADE_SECONDS;
    chain += `;[${last}][v${i}]xfade=transition=fade:duration=${CROSSFADE_SECONDS}:offset=${offset.toFixed(2)}[x${i}]`;
    last = `x${i}`;
  }

  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-y",
      ...inputs,
      "-filter_complex",
      chain,
      "-map",
      `[${last}]`,
      // GitHub only plays H.264 in an MP4 container, and yuv420p is the pixel
      // format Safari needs.
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
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  return !ffmpeg.error && ffmpeg.status === 0;
}

async function main() {
  const url = flag("url") || "http://localhost:4173";
  const headed = flag("headed") !== undefined;
  const keepWebm = flag("keep-webm") !== undefined;
  const origin = new URL(url).origin;

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  // `npm install` fetches the Playwright package but not the browser it drives,
  // deliberately: only this script needs it, and CI never does.
  const browser = await chromium
    .launch({ headless: !headed })
    .catch((cause) => {
      throw new Error(
        "Cannot launch Chromium. Run `npm run demo:prepare` once to download it.",
        { cause },
      );
    });

  const takes: Take[] = [];
  takes.push(
    await recordTake(browser, {
      name: "desktop",
      options: {},
      url,
      leadIn: BOOT_LEAD_IN_SECONDS,
      prepare: installCursor,
      play: (page, mark) =>
        runScenario({ page, cursor: new Cursor(page), mark }),
    }),
  );
  if (!takes[0].failure) {
    takes.push(
      await recordTake(browser, {
        name: "phone",
        // The app picks its read-only mobile editor from the user agent, and
        // its touch affordances from `(pointer: coarse)`, which `hasTouch`
        // turns on.
        options: { hasTouch: true, userAgent: devices["Pixel 7"].userAgent },
        url: `${origin}${STAGE_PATH}`,
        // The crossfade covers the head of this take, so it starts at ready.
        leadIn: CROSSFADE_SECONDS,
        prepare: (context) => installStage(context, origin),
        play: (page, mark) =>
          runPhoneScenario({ page, finger: new Finger(page), mark }),
      }),
    );
  }
  await browser.close();

  console.log("\nScenario:");
  let offset = 0;
  for (const take of takes) {
    for (const { at, label } of take.marks) {
      console.log(`  ${(offset + at).toFixed(1).padStart(5)}s  ${label}`);
    }
    offset += take.to - take.from - CROSSFADE_SECONDS;
  }
  const total = offset + CROSSFADE_SECONDS;
  console.log(`  ${total.toFixed(1).padStart(5)}s  end`);

  const mp4Path = path.join(OUT_DIR, "demo.mp4");
  const failure = takes.find((t) => t.failure)?.failure;
  if (!encode(takes, mp4Path)) {
    console.warn(
      "\nffmpeg unavailable or failed; keeping the raw takes in " +
        `${path.relative(ROOT, OUT_DIR)}. Install ffmpeg to get an mp4.`,
    );
    if (failure) throw failure;
    return;
  }

  if (!keepWebm) {
    await Promise.all(
      takes.map((t) => rm(path.dirname(t.webm), { recursive: true })),
    );
  }
  console.log(
    `\n${failure ? "Partial recording in" : "Recorded"} ` +
      path.relative(ROOT, mp4Path),
  );

  if (failure) throw failure;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
