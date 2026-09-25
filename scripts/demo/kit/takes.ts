/**
 * Records takes of a scripted browser session and joins them into one mp4.
 *
 * A take is one scenario played in a fresh context with Playwright's video
 * capture on. Only the part from shortly before the scenario marks `ready` is
 * kept, so loading time does not decide the running time. `encode` then cuts
 * each take to that part and crossfades one into the next with ffmpeg.
 */

import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from "playwright";

export interface Take {
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
 * because everything earlier is loading, whose length swings by seconds between
 * machines. A scenario that fails halfway is exactly when the video is worth
 * having, so the failure is recorded on the take rather than thrown.
 */
export async function recordTake(
  browser: Browser,
  {
    name,
    outDir,
    url,
    viewport,
    options = {},
    leadIn,
    prepare,
    play,
  }: {
    name: string;
    /** The raw capture lands in a directory named after the take, in here. */
    outDir: string;
    url: string;
    viewport: { width: number; height: number };
    options?: BrowserContextOptions;
    leadIn: number;
    /** Runs before the first navigation, for init scripts and routes. */
    prepare?: (context: BrowserContext) => Promise<void>;
    play: (page: Page, mark: (label: string) => void) => Promise<void>;
  },
): Promise<Take> {
  const dir = path.join(outDir, name);
  const context = await browser.newContext({
    reducedMotion: "no-preference",
    ...options,
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir, size: viewport },
  });
  await prepare?.(context);

  const page = await context.newPage();
  // Video capture starts with the page, so this is frame zero.
  const videoStartedAt = Date.now();
  const origin = new URL(url).origin;
  page.on("console", (msg) => {
    // Third-party frames warn about their own preloads; only the app's
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
    throw new Error(`Cannot reach ${url}. Is the app being served?`, {
      cause,
    });
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
 * Prints where each mark falls in the joined video, for trimming by
 * measurement rather than guesswork.
 */
export function printMarks(takes: Take[], crossfade: number) {
  let offset = 0;
  for (const take of takes) {
    for (const { at, label } of take.marks) {
      console.log(`  ${(offset + at).toFixed(1).padStart(5)}s  ${label}`);
    }
    offset += take.to - take.from - crossfade;
  }
  const total = offset + crossfade;
  console.log(`  ${total.toFixed(1).padStart(5)}s  end`);
}

/**
 * Joins the takes into one mp4, each cut to its kept part, with a crossfade
 * between them. `xfade` needs both sides at the same size, rate and timebase,
 * hence the normalising filters on every input. Returns false when ffmpeg is
 * missing or fails.
 */
export function encode(
  takes: Take[],
  mp4Path: string,
  { crossfade }: { crossfade: number },
): boolean {
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
    offset += takes[i - 1].to - takes[i - 1].from - crossfade;
    chain += `;[${last}][v${i}]xfade=transition=fade:duration=${crossfade}:offset=${offset.toFixed(2)}[x${i}]`;
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
