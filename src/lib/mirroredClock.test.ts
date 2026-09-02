import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MirroredClock } from "@/lib/mirroredClock";

/** Drives `performance.now`, which the mirror reads for wall time. */
function elapse(ms: number) {
  vi.advanceTimersByTime(ms);
}

describe("MirroredClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("extrapolates at the run's rate between readings", () => {
    const clock = new MirroredClock(0.5);
    clock.sync(1000);

    elapse(200);

    expect(clock.now()).toBe(1100);
  });

  it("snaps forward to a reading the rate could not have predicted", () => {
    const clock = new MirroredClock(1);
    clock.sync(1000);

    // A step over a five second sleep: the container jumped, we did not.
    clock.sync(6000);

    expect(clock.now()).toBe(6000);
  });

  it("never moves backwards when a stale reading lands behind the prediction", () => {
    const clock = new MirroredClock(1);
    clock.sync(1000);
    elapse(50);
    const beforeCorrection = clock.now();

    clock.sync(1030); // in flight for 20ms

    expect(clock.now()).toBe(beforeCorrection);
  });

  it("holds still while paused, however long the wall clock runs", () => {
    const clock = new MirroredClock(1);
    clock.sync(1000);
    elapse(100);

    clock.pause();
    elapse(10_000);

    expect(clock.rate).toBe(0);
    expect(clock.now()).toBe(1100);
  });

  it("resumes from where it froze, at the run's rate", () => {
    const clock = new MirroredClock(0.25);
    clock.sync(1000);
    clock.pause();
    elapse(5000);

    clock.resume();
    elapse(400);

    expect(clock.rate).toBe(0.25);
    expect(clock.now()).toBe(1100);
  });

  it("keeps stepping visible while paused: each reply moves the cursor", () => {
    const clock = new MirroredClock(1);
    clock.sync(1000);
    clock.pause();

    clock.sync(3000);
    elapse(1000);

    expect(clock.now()).toBe(3000);
  });

  it("changes slope without moving the cursor", () => {
    const clock = new MirroredClock(1);
    clock.sync(1000);
    elapse(100);

    clock.setRunRate(0.5);
    expect(clock.now()).toBe(1100);

    elapse(100);
    expect(clock.now()).toBe(1150);
  });

  it("does not re-read the elapsed interval at the new rate", () => {
    const clock = new MirroredClock(0.25);
    clock.sync(1000);
    elapse(400);

    // Re-anchoring is what keeps this at 1100: without it the 400ms already
    // elapsed would be re-read at 1x and the cursor would jump to 1400.
    clock.setRunRate(1);

    expect(clock.now()).toBe(1100);
  });

  it("holds a paused cursor still and applies the new rate on resume", () => {
    const clock = new MirroredClock(1);
    clock.sync(1000);
    clock.pause();

    clock.setRunRate(0.5);
    elapse(1000);
    expect(clock.rate).toBe(0);
    expect(clock.now()).toBe(1000);

    clock.resume();
    elapse(200);
    expect(clock.now()).toBe(1100);
  });

  it("does not re-read the paused interval at the resumed rate", () => {
    const clock = new MirroredClock(1);
    clock.sync(1000);
    clock.pause();
    elapse(2000);
    clock.resume();

    expect(clock.now()).toBe(1000);
  });
});
