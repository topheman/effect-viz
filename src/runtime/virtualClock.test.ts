import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VirtualClock, type VirtualClockHost } from "./virtualClock";

/**
 * Resolves the globals at call time so vitest's fake timers are picked up.
 * The default host captures the real ones at module load, which is what we
 * want in production but not here.
 */
const fakeHost: VirtualClockHost = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const makeClock = (rate: number) =>
  new VirtualClock({ rate, origin: 0, host: fakeHost });

describe("VirtualClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("now()", () => {
    it("tracks wall time at rate 1", () => {
      const clock = makeClock(1);
      vi.advanceTimersByTime(500);
      expect(clock.now()).toBe(500);
    });

    it("advances at half speed at rate 0.5", () => {
      const clock = makeClock(0.5);
      vi.advanceTimersByTime(1000);
      expect(clock.now()).toBe(500);
    });

    it("freezes at rate 0", () => {
      const clock = makeClock(0);
      vi.advanceTimersByTime(5000);
      expect(clock.now()).toBe(0);
    });

    it("stays continuous across a rate change", () => {
      const clock = makeClock(1);
      vi.advanceTimersByTime(1000);
      expect(clock.now()).toBe(1000);

      clock.setRate(0.5);
      // No jump at the moment of the change.
      expect(clock.now()).toBe(1000);

      vi.advanceTimersByTime(1000);
      expect(clock.now()).toBe(1500);
    });
  });

  describe("sleep()", () => {
    it("fires after the requested delay at rate 1", () => {
      const clock = makeClock(1);
      const run = vi.fn();
      clock.sleep(1000, run);

      vi.advanceTimersByTime(999);
      expect(run).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(run).toHaveBeenCalledOnce();
    });

    it("takes twice the wall time at rate 0.5", () => {
      const clock = makeClock(0.5);
      const run = vi.fn();
      clock.sleep(1000, run);

      vi.advanceTimersByTime(1999);
      expect(run).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(run).toHaveBeenCalledOnce();
    });

    it("can be cancelled", () => {
      const clock = makeClock(1);
      const run = vi.fn();
      const cancel = clock.sleep(1000, run);

      cancel();
      vi.advanceTimersByTime(5000);
      expect(run).not.toHaveBeenCalled();
      expect(clock.pendingCount).toBe(0);
    });
  });

  describe("pause (rate 0)", () => {
    /**
     * Regression test for the `setTimeout(fn, d / 0)` trap: `Infinity` overflows
     * a 32-bit signed integer and fires after ~1ms, so a naive implementation
     * wakes every sleeping fiber the moment you hit pause.
     */
    it("parks a pending timer instead of firing it immediately", () => {
      const clock = makeClock(1);
      const run = vi.fn();
      clock.sleep(1000, run);

      clock.setRate(0);
      vi.advanceTimersByTime(60_000);

      expect(run).not.toHaveBeenCalled();
      expect(clock.pendingCount).toBe(1);
    });

    it("parks a timer scheduled while already paused", () => {
      const clock = makeClock(0);
      const run = vi.fn();
      clock.sleep(1000, run);

      vi.advanceTimersByTime(60_000);
      expect(run).not.toHaveBeenCalled();
    });

    it("resumes with the remaining time, not the full duration", () => {
      const clock = makeClock(1);
      const run = vi.fn();
      clock.sleep(1000, run);

      vi.advanceTimersByTime(600); // 400 virtual ms left
      clock.setRate(0);
      vi.advanceTimersByTime(10_000); // paused: nothing moves
      clock.setRate(1);

      vi.advanceTimersByTime(399);
      expect(run).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(run).toHaveBeenCalledOnce();
    });

    it("resumes at the new rate after a speed change while paused", () => {
      const clock = makeClock(1);
      const run = vi.fn();
      clock.sleep(1000, run);

      vi.advanceTimersByTime(600); // 400 virtual ms left
      clock.setRate(0);
      clock.setRate(0.5); // 400 virtual ms == 800 wall ms

      vi.advanceTimersByTime(799);
      expect(run).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(run).toHaveBeenCalledOnce();
    });
  });

  describe("advanceToNextDeadline()", () => {
    it("returns false when nothing is pending", () => {
      const clock = makeClock(0);
      expect(clock.advanceToNextDeadline()).toBe(false);
    });

    it("fires the earliest timer and moves virtual time to its deadline", () => {
      const clock = makeClock(0);
      const first = vi.fn();
      const second = vi.fn();
      clock.sleep(500, first);
      clock.sleep(1500, second);

      expect(clock.advanceToNextDeadline()).toBe(true);
      expect(first).toHaveBeenCalledOnce();
      expect(second).not.toHaveBeenCalled();
      expect(clock.now()).toBe(500);
      expect(clock.pendingCount).toBe(1);
    });

    it("fires timers sharing a deadline together", () => {
      const clock = makeClock(0);
      const a = vi.fn();
      const b = vi.fn();
      clock.sleep(500, a);
      clock.sleep(500, b);

      clock.advanceToNextDeadline();
      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
      expect(clock.pendingCount).toBe(0);
    });

    it("leaves a timer scheduled by the fired timer pending", () => {
      const clock = makeClock(0);
      const inner = vi.fn();
      clock.sleep(500, () => clock.sleep(500, inner));

      clock.advanceToNextDeadline();
      expect(inner).not.toHaveBeenCalled();
      expect(clock.pendingCount).toBe(1);

      clock.advanceToNextDeadline();
      expect(inner).toHaveBeenCalledOnce();
      expect(clock.now()).toBe(1000);
    });

    it("re-arms the remaining timers when the rate is not zero", () => {
      const clock = makeClock(1);
      const first = vi.fn();
      const second = vi.fn();
      clock.sleep(500, first);
      clock.sleep(1500, second);

      // Jump straight to the first deadline without wall time passing.
      clock.advanceToNextDeadline();
      expect(first).toHaveBeenCalledOnce();
      expect(clock.now()).toBe(500);

      // 1000 virtual ms later the second is due; its real timer was armed
      // against the pre-jump anchor and must have been re-armed.
      vi.advanceTimersByTime(999);
      expect(second).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(second).toHaveBeenCalledOnce();
    });

    it("steps a chain of sleeps without any wall time passing", () => {
      const clock = makeClock(0);
      const wallBefore = Date.now();
      const order: string[] = [];
      clock.sleep(1000, () => {
        order.push("first");
        clock.sleep(2000, () => order.push("second"));
      });

      clock.advanceToNextDeadline();
      clock.advanceToNextDeadline();

      expect(order).toEqual(["first", "second"]);
      expect(clock.now()).toBe(3000);
      expect(Date.now() - wallBefore).toBe(0); // no wall time consumed
    });
  });

  describe("chained sleeps", () => {
    it("re-bases each nested sleep on the moment it was scheduled", () => {
      const clock = makeClock(0.5);
      const order: string[] = [];
      clock.sleep(1000, () => {
        order.push("a");
        clock.sleep(1000, () => {
          order.push("b");
          clock.sleep(1000, () => order.push("c"));
        });
      });

      vi.advanceTimersByTime(2000);
      expect(order).toEqual(["a"]);
      vi.advanceTimersByTime(2000);
      expect(order).toEqual(["a", "b"]);
      vi.advanceTimersByTime(2000);
      expect(order).toEqual(["a", "b", "c"]);
      expect(clock.now()).toBe(3000);
    });

    it("applies a rate change to a sleep scheduled by an earlier sleep", () => {
      const clock = makeClock(1);
      const order: string[] = [];
      clock.sleep(1000, () => {
        order.push("a");
        clock.sleep(1000, () => order.push("b"));
      });

      vi.advanceTimersByTime(1000);
      expect(order).toEqual(["a"]);

      clock.setRate(0.5);
      vi.advanceTimersByTime(1999);
      expect(order).toEqual(["a"]);

      vi.advanceTimersByTime(1);
      expect(order).toEqual(["a", "b"]);
    });

    it("parks an inner sleep when paused mid-chain", () => {
      const clock = makeClock(1);
      const inner = vi.fn();
      clock.sleep(500, () => clock.sleep(1000, inner));

      vi.advanceTimersByTime(500); // outer fired, inner scheduled
      clock.setRate(0);
      vi.advanceTimersByTime(60_000);
      expect(inner).not.toHaveBeenCalled();

      clock.setRate(1);
      vi.advanceTimersByTime(999);
      expect(inner).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(inner).toHaveBeenCalledOnce();
    });

    it("keeps a sleep started before a pause independent of one started after", () => {
      const clock = makeClock(1);
      const first = vi.fn();
      const second = vi.fn();
      clock.sleep(1000, first);

      vi.advanceTimersByTime(400); // 600 left on first
      clock.setRate(0);
      clock.sleep(1000, second); // scheduled while frozen
      clock.setRate(1);

      vi.advanceTimersByTime(600);
      expect(first).toHaveBeenCalledOnce();
      expect(second).not.toHaveBeenCalled();

      vi.advanceTimersByTime(400);
      expect(second).toHaveBeenCalledOnce();
    });
  });

  describe("clearAll()", () => {
    it("drops every pending timer", () => {
      const clock = makeClock(1);
      const run = vi.fn();
      clock.sleep(1000, run);
      clock.sleep(2000, run);

      clock.clearAll();
      vi.advanceTimersByTime(5000);

      expect(run).not.toHaveBeenCalled();
      expect(clock.pendingCount).toBe(0);
    });
  });

  it("rejects a negative rate", () => {
    const clock = makeClock(1);
    expect(() => clock.setRate(-1)).toThrow(/rate must be >= 0/);
  });
});
