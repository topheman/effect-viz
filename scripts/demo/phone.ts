/**
 * The phone the mobile half of the demo is filmed on.
 *
 * A Playwright recording has one frame size for its whole length, so turning
 * the viewport from portrait to landscape would squash the page into the same
 * box rather than turn it. Instead the recorded page is a stage the size of the
 * desktop video, and the app runs in an iframe drawn as a phone screen in the
 * middle of it. Rotating means turning the phone with a CSS transform and then
 * swapping the iframe's width and height, which the app sees as a real resize:
 * its `short:` layout and landscape tabs come in exactly as they do on a device.
 *
 * Touch taps come from Playwright's touchscreen, and a fingertip drawn on the
 * stage shows where they land, because the arrow in `cursor.ts` would be drawn
 * inside the iframe and means nothing on a phone.
 */

import type {
  BrowserContext,
  Frame,
  FrameLocator,
  Locator,
  Page,
} from "playwright";

import type { Point } from "./cursor.ts";

/**
 * The screen in portrait. Landscape swaps the two, which keeps the height under
 * the 500px `short:` breakpoint and the width under `md`, so the app lays out
 * as it does on a phone turned sideways.
 */
export const SCREEN = { width: 375, height: 700 };

/** Where the stage is served, on the app's own origin. */
export const STAGE_PATH = "/__demo-phone";

const BEZEL = 12;
const ROTATE_MS = 650;

function stageHtml(appUrl: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; background: #0b0d12; overflow: hidden; }
  body { display: grid; place-items: center; }
  #phone {
    box-sizing: content-box;
    width: ${SCREEN.width}px; height: ${SCREEN.height}px;
    padding: ${BEZEL}px; border-radius: 44px;
    background: #1c1f26;
    box-shadow: 0 0 0 1.5px #3a3f4b, 0 30px 80px rgba(0,0,0,.6);
  }
  #phone.turning { transition: transform ${ROTATE_MS}ms cubic-bezier(.45,0,.25,1); }
  #screen {
    width: 100%; height: 100%; border: 0; display: block;
    border-radius: 32px; background: #09090b;
    transition: opacity 180ms;
  }
  /* The outer element only moves and the inner one only presses: the
     standalone scale property composes after transform, so pressing the
     element that carries the translate would scale the translation too and
     fling the dot towards the top-left corner. */
  #finger {
    position: fixed; left: 0; top: 0; width: 38px; height: 38px;
    margin: -19px 0 0 -19px;
    pointer-events: none; opacity: 0; z-index: 10;
    transition: opacity 200ms;
  }
  #finger > div {
    width: 100%; height: 100%; box-sizing: border-box; border-radius: 9999px;
    background: rgba(255,255,255,.28); border: 2px solid rgba(255,255,255,.75);
    box-shadow: 0 2px 10px rgba(0,0,0,.4);
    transition: scale 140ms, background 140ms;
  }
  #finger.down > div { scale: .78; background: rgba(56,189,248,.45); }
</style>
</head>
<body>
  <div id="phone"><iframe id="screen" src="${appUrl}"></iframe></div>
  <div id="finger"><div></div></div>
</body>
</html>`;
}

/**
 * Serves the stage from the app's origin.
 *
 * Same-origin matters: the app sends `Cross-Origin-Embedder-Policy`, and a page
 * framing it from another origin, or from `about:blank`, would have it refused.
 */
export async function installStage(context: BrowserContext, origin: string) {
  await context.route(`${origin}${STAGE_PATH}`, (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: {
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
      },
      body: stageHtml(`${origin}/`),
    }),
  );
}

/**
 * The app's frame, and where its viewport sits on the stage. Coordinates read
 * inside the frame are relative to that viewport; adding `origin` turns them
 * into the stage coordinates the touchscreen taps at.
 */
export async function appFrame(
  page: Page,
): Promise<{ frame: Frame; origin: Point }> {
  const element = await page.$("#screen");
  const frame = await element?.contentFrame();
  const box = await element?.boundingBox();
  if (!frame || !box) throw new Error("Cannot find the phone's screen");
  return { frame, origin: { x: box.x, y: box.y } };
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** A fingertip on the stage, and the touches it stands for. */
export class Finger {
  readonly page: Page;
  readonly app: FrameLocator;
  private position: Point | null = null;

  constructor(page: Page) {
    this.page = page;
    this.app = page.frameLocator("#screen");
  }

  private place(point: Point, visible: boolean) {
    return this.page.evaluate(
      ({ x, y, visible }) => {
        const finger = document.getElementById("finger")!;
        finger.style.transform = `translate(${x}px, ${y}px)`;
        finger.style.opacity = visible ? "1" : "0";
      },
      { ...point, visible },
    );
  }

  /**
   * Glides to a point. A finger arrives from above the glass rather than
   * sliding across it, so the first touch fades in where it lands instead.
   */
  async moveTo(to: Point, duration = 450): Promise<void> {
    const from = this.position;
    if (!from) {
      await this.place(to, true);
      await this.page.waitForTimeout(220);
    } else {
      const start = Date.now();
      for (;;) {
        const t = Math.min(1, (Date.now() - start) / duration);
        const k = easeInOutCubic(t);
        await this.place(
          { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k },
          true,
        );
        if (t === 1) break;
        await this.page.waitForTimeout(16);
      }
    }
    this.position = to;
  }

  async moveToLocator(target: Locator): Promise<void> {
    await target.waitFor({ state: "visible" });
    const box = await target.boundingBox();
    if (!box) throw new Error("Cannot move to a target with no bounding box");
    await this.moveTo({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }

  /** Taps a target: the press is held on screen long enough to be filmed. */
  async tap(target: Locator | Point): Promise<void> {
    if ("x" in target) await this.moveTo(target);
    else await this.moveToLocator(target);
    await this.page.waitForTimeout(200);
    await this.page.evaluate(() =>
      document.getElementById("finger")!.classList.add("down"),
    );
    const { x, y } = this.position!;
    await this.page.touchscreen.tap(x, y);
    await this.page.waitForTimeout(160);
    await this.page.evaluate(() =>
      document.getElementById("finger")!.classList.remove("down"),
    );
    await this.page.waitForTimeout(260);
  }

  /** Lifts the finger off the glass, so a frame can be read without it. */
  async lift(): Promise<void> {
    if (this.position) await this.place(this.position, false);
    this.position = null;
    await this.page.waitForTimeout(200);
  }

  async pause(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }
}

/**
 * Turns the phone a quarter turn and hands the app the new screen size.
 *
 * The turn itself is a transform on the portrait-shaped phone; only when it has
 * finished are the iframe's dimensions swapped and the transform dropped,
 * which leaves the phone exactly where the turn put it. The screen dims for
 * that swap, the way a device hides the frame in which it relayouts.
 */
export async function rotate(
  page: Page,
  to: "landscape" | "portrait",
): Promise<void> {
  await page.evaluate(
    async ({ to, screen, ms }) => {
      const phone = document.getElementById("phone")!;
      const frame = document.getElementById("screen")!;
      const landscape = to === "landscape";
      const nextFrame = () =>
        new Promise((resolve) => requestAnimationFrame(resolve));

      phone.classList.add("turning");
      // Landscape turns the phone to the left, portrait back from it.
      phone.style.transform = `rotate(${landscape ? -90 : 90}deg)`;
      await new Promise((resolve) => setTimeout(resolve, ms));

      frame.style.opacity = "0";
      phone.classList.remove("turning");
      phone.style.transform = "none";
      phone.style.width = `${landscape ? screen.height : screen.width}px`;
      phone.style.height = `${landscape ? screen.width : screen.height}px`;
      await nextFrame();
      await new Promise((resolve) => setTimeout(resolve, 120));
      frame.style.opacity = "1";
    },
    { to, screen: SCREEN, ms: ROTATE_MS },
  );
  // Long enough for the fade back in to land and the layout to settle.
  await page.waitForTimeout(350);
}
