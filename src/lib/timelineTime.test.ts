import { describe, expect, it } from "vitest";

import { computeTickInterval, computeVirtualNow } from "@/lib/timelineTime";

const ANCHOR = { virtual: 1_600_000_000_000, wall: 500 };

describe("computeVirtualNow", () => {
  it("tracks wall time at rate 1", () => {
    expect(computeVirtualNow(ANCHOR, 1, 1500)).toBe(ANCHOR.virtual + 1000);
  });

  /**
   * The bug this guards: the timeline's live cursor used wall time while event
   * timestamps were virtual, so at 0.25x the elapsed grew four times too fast
   * during a run and snapped back the moment the run finished.
   */
  it("advances at a quarter of wall time at rate 0.25", () => {
    expect(computeVirtualNow(ANCHOR, 0.25, 4500)).toBe(ANCHOR.virtual + 1000);
  });

  it("stands still at rate 0", () => {
    expect(computeVirtualNow(ANCHOR, 0, 60_000)).toBe(ANCHOR.virtual);
  });

  it("agrees with the anchor at the instant it was taken", () => {
    expect(computeVirtualNow(ANCHOR, 0.5, ANCHOR.wall)).toBe(ANCHOR.virtual);
  });

  it("falls back to wall time before the first event of a run", () => {
    const before = Date.now();
    expect(computeVirtualNow(null, 0.25, 1234)).toBeGreaterThanOrEqual(before);
  });
});

/** Number of labels the axis would render for a span. */
const tickCount = (duration: number) =>
  Math.floor(duration / computeTickInterval(duration)) + 1;

describe("computeTickInterval", () => {
  it("uses fine steps for short spans", () => {
    expect(computeTickInterval(1000)).toBe(200);
    expect(computeTickInterval(3000)).toBe(500);
  });

  /**
   * The bug this guards: the interval was capped at one second, so a long
   * timeline rendered a label per second until they overlapped into a smear.
   */
  it("keeps the label count bounded at any span", () => {
    for (const duration of [
      1_000, 3_000, 6_000, 12_000, 30_000, 60_000, 120_000, 600_000, 3_600_000,
    ]) {
      expect(tickCount(duration)).toBeLessThanOrEqual(12);
    }
  });

  it("still renders several ticks rather than collapsing to one", () => {
    for (const duration of [1_000, 6_000, 60_000, 600_000, 3_600_000]) {
      expect(tickCount(duration)).toBeGreaterThanOrEqual(4);
    }
  });

  /**
   * A ~505ms axis at mobile width: eight ticks put "400ms" and "500ms" hard
   * against each other, so a narrow axis has to ask for fewer.
   */
  it("widens the step when the axis has room for fewer ticks", () => {
    expect(computeTickInterval(505, 3)).toBeGreaterThan(
      computeTickInterval(505),
    );
    expect(
      Math.floor(505 / computeTickInterval(505, 3)) + 1,
    ).toBeLessThanOrEqual(4);
  });

  it("never returns a step of zero", () => {
    expect(computeTickInterval(0)).toBeGreaterThan(0);
    expect(computeTickInterval(1)).toBeGreaterThan(0);
  });
});
