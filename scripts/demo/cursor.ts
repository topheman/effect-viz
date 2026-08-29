/**
 * A scripted mouse pointer for demo recordings.
 *
 * Playwright drives input through CDP, which never moves the operating system
 * pointer, so a recording made with `recordVideo` shows no cursor at all. The
 * pointer below is a DOM node injected into the page and slaved to the pointer
 * event stream, which puts it inside the captured frame. Real Playwright input
 * still does the work, so `:hover`, focus and click targeting behave normally.
 *
 * The glyph follows the CSS `cursor` of whatever is under the point, so the
 * recording shows an I-beam over the editor and a resize cursor over a handle,
 * the way a viewer's own machine would.
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
      /**
       * One entry per cursor shape the app can ask for.
       *
       * `hotspot` is the point inside the 26x26 box that sits on the actual
       * coordinate — the tip for an arrow, the centre for an I-beam. Getting it
       * wrong shifts the whole glyph off the thing it is pointing at.
       */
      const skin = "#101828";
      const edge = "#ffffff";
      const filled = `fill="${skin}" stroke="${edge}" stroke-width="1.6" stroke-linejoin="round"`;
      const line = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;

      const glyphs: Record<string, { hotspot: [number, number]; svg: string }> =
        {
          default: {
            hotspot: [5, 2],
            svg: `<path d="M5 2 L5 19 L9.8 14.6 L12.6 21.5 L15.9 20.1 L13.1 13.4 L19.6 13.1 Z" ${filled}/>`,
          },
          pointer: {
            hotspot: [9, 2],
            svg: `<path d="M9 2.8 a1.9 1.9 0 0 1 3.8 0 V12 h.9 v-1.6 a1.7 1.7 0 0 1 3.4 0 V12 h.9 v-1.1 a1.7 1.7 0 0 1 3.4 0 V17 a5.4 5.4 0 0 1 -5.4 5.4 h-2.7 a4.8 4.8 0 0 1 -3.9 -2 l-3 -4.2 a1.8 1.8 0 0 1 2.7 -2.3 L9 15.2 Z" ${filled}/>`,
          },
          text: {
            hotspot: [13, 13],
            svg:
              `<path d="M9.5 4.5 H16.5 M13 4.5 V21.5 M9.5 21.5 H16.5" ${line} stroke="${skin}" stroke-width="4.2"/>` +
              `<path d="M9.5 4.5 H16.5 M13 4.5 V21.5 M9.5 21.5 H16.5" ${line} stroke="${edge}" stroke-width="1.8"/>`,
          },
          "row-resize": {
            hotspot: [13, 13],
            svg: `<path d="M13 3 L17.5 8.5 H14.8 V17.5 H17.5 L13 23 L8.5 17.5 H11.2 V8.5 H8.5 Z" ${filled}/>`,
          },
          "col-resize": {
            hotspot: [13, 13],
            svg: `<path d="M3 13 L8.5 8.5 V11.2 H17.5 V8.5 L23 13 L17.5 17.5 V14.8 H8.5 V17.5 Z" ${filled}/>`,
          },
          move: {
            hotspot: [13, 13],
            svg: `<path d="M13 2.5 L16 6 H14.2 V11.2 H19.4 V9.4 L23 13 L19.4 16.6 V14.8 H14.2 V20 H16 L13 23.5 L10 20 H11.8 V14.8 H6.6 V16.6 L3 13 L6.6 9.4 V11.2 H11.8 V6 H10 Z" ${filled}/>`,
          },
          "not-allowed": {
            hotspot: [13, 13],
            svg:
              `<circle cx="13" cy="13" r="8.2" fill="none" stroke="${edge}" stroke-width="4.6"/>` +
              `<path d="M7.4 7.4 L18.6 18.6" ${line} stroke="${edge}" stroke-width="4.6"/>` +
              `<circle cx="13" cy="13" r="8.2" fill="none" stroke="#dc2626" stroke-width="2.6"/>` +
              `<path d="M7.4 7.4 L18.6 18.6" ${line} stroke="#dc2626" stroke-width="2.6"/>`,
          },
        };

      /** Cursor keywords that should reuse another glyph. */
      const aliases: Record<string, string> = {
        auto: "default",
        "context-menu": "default",
        help: "default",
        progress: "default",
        wait: "default",
        cell: "default",
        crosshair: "default",
        "vertical-text": "text",
        alias: "default",
        copy: "default",
        "all-scroll": "move",
        grab: "pointer",
        grabbing: "pointer",
        "ns-resize": "row-resize",
        "n-resize": "row-resize",
        "s-resize": "row-resize",
        "ew-resize": "col-resize",
        "e-resize": "col-resize",
        "w-resize": "col-resize",
        "nesw-resize": "move",
        "nwse-resize": "move",
        "no-drop": "not-allowed",
      };

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
          // The pointer starts off-screen so it does not sit in the top-left
          // corner of the first frames before the scenario moves it.
          "transform:translate(-100px,-100px)",
        ].join(";");
        document.body.appendChild(el);

        // The ring is a click flash: it expands and fades on press so a viewer
        // can tell a click happened from the video alone.
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
        let kind = "";

        /**
         * Position and press scale have to travel in one `transform`. The
         * standalone `scale` property is composed *after* `transform`, so it
         * would scale the translation itself and fling the glyph a fifth of the
         * way back towards the top-left corner on every press.
         *
         * `transform-origin` tracks the hotspot so the press pivots on the
         * point being clicked rather than on the corner of the box.
         */
        const render = () => {
          const [hx, hy] = glyphs[kind].hotspot;
          el.style.transformOrigin = `${hx}px ${hy}px`;
          el.style.transform = `translate(${x - hx}px, ${y - hy}px) scale(${press})`;
        };

        const setKind = (next: string) => {
          if (next === kind) return;
          kind = next;
          el.innerHTML = `<svg viewBox="0 0 26 26" width="26" height="26"
             style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">${glyphs[kind].svg}</svg>`;
        };

        /**
         * Resolves the shape from whatever sits under the point. The overlay is
         * `pointer-events:none`, so `elementFromPoint` reports the page's own
         * element rather than the glyph itself.
         */
        const syncKind = () => {
          const under = document.elementFromPoint(x, y);
          const css = under ? getComputedStyle(under).cursor : "default";
          const name = aliases[css] ?? css;
          setKind(name in glyphs ? name : "default");
        };

        setKind("default");

        // Pointer events, not mouse events. A drag target that calls
        // `preventDefault()` on the pointer stream — react-resizable-panels
        // does — suppresses the compatibility mouse events for the rest of that
        // gesture, and the glyph would sit frozen for the whole drag.
        document.addEventListener(
          "pointermove",
          (event) => {
            x = event.clientX;
            y = event.clientY;
            syncKind();
            render();
          },
          true,
        );

        document.addEventListener(
          "pointerdown",
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
          "pointerup",
          () => {
            press = 1;
            // A drag usually changes what is under the point — releasing a
            // resize handle hands the cursor back to the panel beneath it.
            syncKind();
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
 * How long a move of a given distance should take, when the caller does not say.
 *
 * A single fixed duration cannot serve both ends of the range: it makes a nudge
 * between two adjacent buttons crawl, and it turns a corner-to-corner traverse
 * into a jump. At 25fps a 450px move given 300ms advances some 60px per frame,
 * which the eye reads as a teleport rather than as motion. Holding the speed
 * roughly constant instead keeps every move legible.
 */
const SPEED_PX_PER_MS = 0.5;
const MIN_MOVE_MS = 300;
const MAX_MOVE_MS = 1200;

const paceFor = (distance: number) =>
  Math.min(MAX_MOVE_MS, Math.max(MIN_MOVE_MS, distance / SPEED_PX_PER_MS));

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
   * Moves to a point along a slightly curved path, taking `duration`
   * milliseconds. Omit `duration` to travel at a constant speed, which is what
   * a scenario usually wants — see `paceFor`.
   *
   * The loop is driven by elapsed wall-clock time rather than a fixed step
   * count: every `mouse.move` is a CDP round-trip of a few milliseconds, so a
   * counted loop would overshoot the intended duration by an amount that varies
   * with machine load, and the recording's pacing would drift between takes.
   */
  async moveTo(to: Point, duration?: number, arc = 0.12): Promise<void> {
    const from = this.position;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const ms = duration ?? paceFor(Math.hypot(dx, dy));

    // Quadratic control point pushed perpendicular to the straight line, so the
    // path arcs the way a hand does instead of sliding along a ruler. Drags pass
    // `arc: 0`, because a curved drag would wobble whatever it is dragging.
    const cx = (from.x + to.x) / 2 + dy * arc;
    const cy = (from.y + to.y) / 2 - dx * arc;

    const start = Date.now();
    for (;;) {
      const elapsed = Date.now() - start;
      const t = easeInOutCubic(Math.min(1, elapsed / ms));
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

  /**
   * Presses on a target, drags by `delta`, and releases.
   *
   * The move is broken into many small steps by `moveTo`, which matters here:
   * a drag target reads the pointer's path, and a single jump to the end
   * position would either be ignored or snap without any visible motion.
   *
   * A bare point is accepted as well as a locator, because not every drag
   * target is an element Playwright will call visible — see the Timeline
   * separator in `scenario.ts`.
   */
  async drag(
    target: Locator | Point,
    delta: Point,
    { duration = 800 }: { duration?: number } = {},
  ): Promise<void> {
    if ("x" in target) {
      await this.moveTo(target);
    } else {
      await this.moveToLocator(target);
    }
    await this.page.waitForTimeout(260);
    await this.page.mouse.down();
    await this.page.waitForTimeout(200);
    await this.moveTo(
      { x: this.position.x + delta.x, y: this.position.y + delta.y },
      duration,
      0,
    );
    await this.page.waitForTimeout(300);
    await this.page.mouse.up();
    await this.page.waitForTimeout(320);
  }

  /**
   * Glides to a point and double-clicks, which in a text editor selects the
   * word under the pointer.
   */
  async doubleClick(target: Locator | Point): Promise<void> {
    if ("x" in target) {
      await this.moveTo(target);
    } else {
      await this.moveToLocator(target);
    }
    await this.page.waitForTimeout(220);
    await this.page.mouse.dblclick(this.position.x, this.position.y);
    await this.page.waitForTimeout(320);
  }

  /**
   * Rests on a target long enough for a hover affordance to appear.
   *
   * Monaco's type tooltip is on a delay, and the pointer has to stay inside the
   * word for the whole of it, so the dwell is the point of this rather than an
   * afterthought.
   */
  async hover(target: Locator | Point, dwell = 1100): Promise<void> {
    if ("x" in target) {
      await this.moveTo(target);
    } else {
      await this.moveToLocator(target);
    }
    await this.page.waitForTimeout(dwell);
  }

  /**
   * Scrolls the wheel under the pointer, in increments.
   *
   * One large delta jumps the content in a single frame; several smaller ones
   * read as scrolling. The pointer stays put, as a real one would.
   */
  async scroll(deltaY: number, { steps = 5 }: { steps?: number } = {}) {
    const per = deltaY / steps;
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, per);
      await this.page.waitForTimeout(70);
    }
    await this.page.waitForTimeout(280);
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
