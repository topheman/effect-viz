/**
 * Records the README demo video by replaying `scenario.ts` in a real browser:
 * a desktop take, then a phone take on the stage from `kit/phone.ts`, joined with a
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

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type BrowserContext, chromium, devices } from "playwright";

import { Cursor, installCursor } from "./kit/cursor.ts";
import { Finger, installStage, type Screen, STAGE_PATH } from "./kit/phone.ts";
import { encode, printMarks, recordTake, type Take } from "./kit/takes.ts";
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
 * The phone's screen in portrait. Landscape keeps the height under the 500px
 * `short:` breakpoint and the width under `md`, so the app lays out as it does
 * on a phone turned sideways.
 */
const PHONE_SCREEN: Screen = { width: 375, height: 700 };

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

/**
 * A fresh profile would start the onboarding tour, whose pulsing highlights
 * fight with the scripted pointer for the viewer's attention.
 */
async function skipOnboarding(context: BrowserContext) {
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
}

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
  const origin = new URL(url).origin;

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  // `npm install` fetches the Playwright package but not the browser it drives,
  // deliberately: only this script and the e2e tests need it, and CI never does.
  const browser = await chromium
    .launch({ headless: !headed })
    .catch((cause) => {
      throw new Error(
        "Cannot launch Chromium. Run `npm run playwright:install` once to download it.",
        { cause },
      );
    });

  const shared = {
    outDir: OUT_DIR,
    viewport: VIEWPORT,
  };
  const takes: Take[] = [];
  takes.push(
    await recordTake(browser, {
      ...shared,
      name: "desktop",
      options: { colorScheme: "dark" },
      url,
      leadIn: BOOT_LEAD_IN_SECONDS,
      prepare: async (context) => {
        await skipOnboarding(context);
        await installCursor(context);
      },
      play: (page, mark) =>
        runScenario({ page, cursor: new Cursor(page), mark }),
    }),
  );
  if (!takes[0].failure) {
    takes.push(
      await recordTake(browser, {
        ...shared,
        name: "phone",
        // The app picks its read-only mobile editor from the user agent, and
        // its touch affordances from `(pointer: coarse)`, which `hasTouch`
        // turns on.
        options: {
          colorScheme: "dark",
          hasTouch: true,
          userAgent: devices["Pixel 7"].userAgent,
        },
        url: `${origin}${STAGE_PATH}`,
        // The crossfade covers the head of this take, so it starts at ready.
        leadIn: CROSSFADE_SECONDS,
        prepare: async (context) => {
          await skipOnboarding(context);
          await installStage(context, { origin, screen: PHONE_SCREEN });
        },
        play: (page, mark) =>
          runPhoneScenario({ page, finger: new Finger(page), mark }),
      }),
    );
  }
  await browser.close();

  console.log("\nScenario:");
  printMarks(takes, CROSSFADE_SECONDS);

  const mp4Path = path.join(OUT_DIR, "demo.mp4");
  const failure = takes.find((t) => t.failure)?.failure;
  if (!encode(takes, mp4Path, { crossfade: CROSSFADE_SECONDS })) {
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
