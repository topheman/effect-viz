/**
 * A scripted mouse pointer for demo recordings.
 *
 * Playwright drives input through CDP, which never moves the operating system
 * pointer, so a recording made with `recordVideo` shows no cursor at all. The
 * pointer below is a DOM node injected into the page and slaved to `mousemove`,
 * which puts it inside the captured frame. Real Playwright mouse events still do
 * the work, so `:hover`, focus and click targeting behave normally.
 */

import type { BrowserContext, Locator, Page } from "playwright";

export interface Point {
  x: number;
  y: number;
}

const CURSOR_ID = "__demo-cursor";

/**
 * Injects the pointer into every document of the context. Must be called before
 * the first navigation, because init scripts only run on document creation.
 */
export async function installCursor(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ({ id }: { id: string }) => {
      const mount = () => {
        if (document.getElementById(id)) return;

        const el = document.createElement("div");
        el.id = id;
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = [
          "position:fixed",
          "top:0",
          "left:0",
          "width:26px",
          "height:26px",
          "z-index:2147483647",
          "pointer-events:none",
          "will-change:transform",
          // Pivot the press scale on the arrow's tip rather than its box
          // centre, so pressing does not nudge the point it is aiming at.
          "transform-origin:0 0",
          // The pointer starts off-screen so it does not sit in the top-left
          // corner of the first frames before the scenario moves it.
          "transform:translate(-100px,-100px)",
        ].join(";");
        el.innerHTML = `
          <svg viewBox="0 0 26 26" width="26" height="26"
               style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">
            <path d="M5 2 L5 19 L9.8 14.6 L12.6 21.5 L15.9 20.1 L13.1 13.4 L19.6 13.1 Z"
                  fill="#101828" stroke="#ffffff" stroke-width="1.6"
                  stroke-linejoin="round"/>
          </svg>`;
        document.body.appendChild(el);

        // The ring is a click flash: it expands and fades on mousedown so a
        // viewer can tell a click happened from the video alone.
        const ring = document.createElement("div");
        ring.setAttribute("aria-hidden", "true");
        ring.style.cssText = [
          "position:fixed",
          "top:0",
          "left:0",
          "width:34px",
          "height:34px",
          "margin:-17px 0 0 -17px",
          "border-radius:9999px",
          "border:2px solid rgba(56,189,248,.9)",
          "background:rgba(56,189,248,.18)",
          "z-index:2147483646",
          "pointer-events:none",
          "opacity:0",
          "will-change:transform,opacity",
        ].join(";");
        document.body.appendChild(ring);

        let x = -100;
        let y = -100;
        let press = 1;

        /**
         * Position and press scale have to travel in one `transform`. The
         * standalone `scale` property is composed *after* `transform`, so it
         * would scale the translation itself and fling the arrow a fifth of the
         * way back towards the top-left corner on every press.
         */
        const render = () => {
          el.style.transform = `translate(${x}px, ${y}px) scale(${press})`;
        };

        document.addEventListener(
          "mousemove",
          (event) => {
            x = event.clientX;
            y = event.clientY;
            render();
          },
          true,
        );

        document.addEventListener(
          "mousedown",
          () => {
            press = 0.82;
            render();
            // Animated through the Web Animations API rather than a CSS
            // transition: a transition interpolates from the last *committed*
            // style, which is still the previous click's position, so the ring
            // would streak across the screen from wherever it last fired.
            ring.animate(
              [
                {
                  transform: `translate(${x}px, ${y}px) scale(.35)`,
                  opacity: 0.9,
                },
                {
                  transform: `translate(${x}px, ${y}px) scale(1.3)`,
                  opacity: 0,
                },
              ],
              { duration: 420, easing: "cubic-bezier(.22,.61,.36,1)" },
            );
          },
          true,
        );

        document.addEventListener(
          "mouseup",
          () => {
            press = 1;
            render();
          },
          true,
        );
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mount);
      } else {
        mount();
      }
    },
    { id: CURSOR_ID },
  );
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Drives the pointer for one page. Holds the last position, because Playwright's
 * mouse is stateless from the script's point of view and a glide needs to know
 * where it is starting from.
 */
export class Cursor {
  readonly page: Page;

  position: Point = { x: -100, y: -100 };

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Moves to a point over `duration` milliseconds along a slightly curved path.
   *
   * The loop is driven by elapsed wall-clock time rather than a fixed step
   * count: every `mouse.move` is a CDP round-trip of a few milliseconds, so a
   * counted loop would overshoot the intended duration by an amount that varies
   * with machine load, and the recording's pacing would drift between takes.
   */
  async moveTo(to: Point, duration = 700): Promise<void> {
    const from = this.position;
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    // Quadratic control point pushed perpendicular to the straight line, so the
    // path arcs the way a hand does instead of sliding along a ruler.
    const cx = (from.x + to.x) / 2 + dy * 0.12;
    const cy = (from.y + to.y) / 2 - dx * 0.12;

    const start = Date.now();
    for (;;) {
      const elapsed = Date.now() - start;
      const t = easeInOutCubic(Math.min(1, elapsed / duration));
      const u = 1 - t;
      await this.page.mouse.move(
        u * u * from.x + 2 * u * t * cx + t * t * to.x,
        u * u * from.y + 2 * u * t * cy + t * t * to.y,
      );
      if (t === 1) break;
    }

    this.position = to;
  }

  /** Moves to the centre of an element, scrolling it into view first. */
  async moveToLocator(target: Locator, duration?: number): Promise<void> {
    await target.waitFor({ state: "visible" });
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) {
      throw new Error("Cannot move to a target with no bounding box");
    }
    await this.moveTo(
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      duration,
    );
  }

  /** Glides to an element, pauses so the viewer can register it, then clicks. */
  async click(
    target: Locator,
    { duration }: { duration?: number } = {},
  ): Promise<void> {
    await this.moveToLocator(target, duration);
    await this.page.waitForTimeout(220);
    await this.page.mouse.down();
    // Long enough for the pressed state to land on a frame: the capture runs at
    // 25fps, so a 90ms press could fall entirely between two frames.
    await this.page.waitForTimeout(160);
    await this.page.mouse.up();
    await this.page.waitForTimeout(260);
  }

  /** Selects a value in a native `<select>`, flashing the pointer over it first. */
  async select(target: Locator, value: string): Promise<void> {
    await this.moveToLocator(target);
    await this.page.waitForTimeout(220);
    await target.selectOption(value);
    await this.page.waitForTimeout(320);
  }

  /** A beat: holds the frame still so the viewer can read what just changed. */
  async pause(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }
}
