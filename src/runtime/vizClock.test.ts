import { Clock, Effect, Fiber, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VirtualClock, type VirtualClockHost } from "@/runtime/virtualClock";
import { makeVizClockLayer } from "@/runtime/vizClock";

/** Resolves the globals at call time so vitest's fake timers are picked up. */
const fakeHost: VirtualClockHost = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function setup(rate: number) {
  const virtual = new VirtualClock({ rate, origin: 0, host: fakeHost });
  const layer = makeVizClockLayer(virtual);
  const run = <A>(effect: Effect.Effect<A>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer)));
  const fork = <A>(effect: Effect.Effect<A>) =>
    Effect.runFork(effect.pipe(Effect.provide(layer)));
  return { virtual, layer, run, fork };
}

describe("vizClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Effect.sleep", () => {
    it("takes the requested wall time at rate 1", async () => {
      const { run } = setup(1);
      const done = vi.fn();
      const promise = run(
        Effect.sleep("1 second").pipe(Effect.tap(() => Effect.sync(done))),
      );

      await vi.advanceTimersByTimeAsync(999);
      expect(done).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(done).toHaveBeenCalledOnce();
      await promise;
    });

    it("takes twice the wall time at rate 0.5", async () => {
      const { run } = setup(0.5);
      const done = vi.fn();
      const promise = run(
        Effect.sleep("1 second").pipe(Effect.tap(() => Effect.sync(done))),
      );

      await vi.advanceTimersByTimeAsync(1999);
      expect(done).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(done).toHaveBeenCalledOnce();
      await promise;
    });

    it("never completes while paused, and completes after resuming", async () => {
      const { virtual, run } = setup(0);
      const done = vi.fn();
      const promise = run(
        Effect.sleep("1 second").pipe(Effect.tap(() => Effect.sync(done))),
      );

      await vi.advanceTimersByTimeAsync(60_000);
      expect(done).not.toHaveBeenCalled();
      expect(virtual.pendingCount).toBe(1);

      virtual.setRate(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(done).toHaveBeenCalledOnce();
      await promise;
    });
  });

  describe("Clock.currentTimeMillis", () => {
    it("reports virtual time, so elapsed is the same at any rate", async () => {
      const elapsed = Effect.gen(function* () {
        const before = yield* Clock.currentTimeMillis;
        yield* Effect.sleep("1 second");
        return (yield* Clock.currentTimeMillis) - before;
      });

      const fast = setup(1);
      const fastPromise = fast.run(elapsed);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await fastPromise).toBe(1000);

      const slow = setup(0.25);
      const slowPromise = slow.run(elapsed);
      await vi.advanceTimersByTimeAsync(4000); // 4x the wall time
      expect(await slowPromise).toBe(1000); // same virtual duration
    });
  });

  describe("semantics are preserved", () => {
    /**
     * The point of scaling the clock rather than pacing the UI: relative timing
     * still decides outcomes, so the program behaves identically at any speed.
     */
    it.each([1, 0.5, 0.25])(
      "keeps the race winner at rate %s",
      async (rate) => {
        const { run } = setup(rate);
        const race = Effect.race(
          Effect.sleep("1 second").pipe(Effect.as("fast")),
          Effect.sleep("2 seconds").pipe(Effect.as("slow")),
        );

        const promise = run(race);
        await vi.advanceTimersByTimeAsync(2000 / rate);
        expect(await promise).toBe("fast");
      },
    );

    it.each([1, 0.25])("keeps a timeout firing at rate %s", async (rate) => {
      const { run } = setup(rate);
      const timed = Effect.sleep("2 seconds").pipe(
        Effect.timeoutOption("1 second"),
      );

      const promise = run(timed);
      await vi.advanceTimersByTimeAsync(3000 / rate);
      expect(Option.isNone(await promise)).toBe(true);
    });
  });

  describe("interruption", () => {
    it("cancels the pending virtual timer", async () => {
      const { virtual, fork } = setup(1);
      const fiber = fork(Effect.sleep("10 seconds"));

      await vi.advanceTimersByTimeAsync(100);
      expect(virtual.pendingCount).toBe(1);

      const interrupted = Effect.runPromise(Fiber.interrupt(fiber));
      await vi.advanceTimersByTimeAsync(0);
      await interrupted;

      expect(virtual.pendingCount).toBe(0);
    });
  });
});
