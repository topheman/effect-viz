import { Effect, Fiber } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GatedScheduler } from "@/runtime/gatedScheduler";
import { VirtualClock, type VirtualClockHost } from "@/runtime/virtualClock";
import { makeVizClockLayer } from "@/runtime/vizClock";

const fakeHost: VirtualClockHost = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function setup(rate = 1) {
  const scheduler = new GatedScheduler();
  const virtual = new VirtualClock({ rate, origin: 0, host: fakeHost });
  const run = <A>(effect: Effect.Effect<A>) =>
    Effect.runFork(
      effect.pipe(
        Effect.withScheduler(scheduler),
        Effect.provide(makeVizClockLayer(virtual)),
      ),
    );
  return { scheduler, virtual, run };
}

/** Lets already-dispatched work reach the scheduler. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("GatedScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("playing", () => {
    it("runs a program to completion unchanged", async () => {
      const { scheduler, run } = setup();
      const steps: string[] = [];
      const fiber = run(
        Effect.gen(function* () {
          steps.push("a");
          yield* Effect.yieldNow();
          steps.push("b");
          yield* Effect.yieldNow();
          steps.push("c");
        }),
      );

      await vi.advanceTimersByTimeAsync(10);
      expect(steps).toEqual(["a", "b", "c"]);
      expect(scheduler.queuedCount).toBe(0);
      await Effect.runPromise(Fiber.join(fiber));
    });

    it("queues nothing while playing", async () => {
      const { scheduler, run } = setup();
      run(
        Effect.gen(function* () {
          yield* Effect.yieldNow();
          yield* Effect.yieldNow();
        }),
      );

      await vi.advanceTimersByTimeAsync(10);
      expect(scheduler.queuedCount).toBe(0);
    });
  });

  describe("paused", () => {
    /**
     * Even the program's first step is a scheduled task, so pausing before Play
     * means the program does not begin at all until the user steps.
     */
    it("stops the program and queues its next task", async () => {
      const { scheduler, run } = setup();
      const steps: string[] = [];
      run(
        Effect.gen(function* () {
          steps.push("a");
          yield* Effect.yieldNow();
          steps.push("b");
        }),
      );

      scheduler.pause();
      await settle();
      const atPause = [...steps];

      expect(scheduler.queuedCount).toBeGreaterThan(0);

      // Wall time passing changes nothing: only a step can.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(steps).toEqual(atPause);
    });

    /**
     * A released task is often runtime bookkeeping — here, building the Clock
     * layer — rather than user code. So a step is "release until something
     * visible happens", not "release exactly one task".
     */
    it("advances one visible step at a time", async () => {
      const { scheduler, run } = setup();
      const steps: string[] = [];
      run(
        Effect.gen(function* () {
          steps.push("a");
          yield* Effect.yieldNow();
          steps.push("b");
          yield* Effect.yieldNow();
          steps.push("c");
        }),
      );

      scheduler.pause();
      await settle();

      const step = () => {
        const before = steps.length;
        scheduler.releaseUntil(() => steps.length > before);
      };

      while (steps.length < 3 && scheduler.queuedCount > 0) {
        const before = steps.length;
        step();
        // Every step makes exactly one thing visible.
        expect(steps.length).toBe(before + 1);
      }

      expect(steps).toEqual(["a", "b", "c"]);
    });

    it("stops releasing once the condition is met", async () => {
      const { scheduler, run } = setup();
      const steps: string[] = [];
      run(
        Effect.gen(function* () {
          steps.push("a");
          yield* Effect.yieldNow();
          steps.push("b");
          yield* Effect.yieldNow();
          steps.push("c");
        }),
      );

      scheduler.pause();
      await settle();

      const before = steps.length;
      scheduler.releaseUntil(() => steps.length > before);
      expect(steps.length).toBe(before + 1);
      // The rest is still held.
      expect(scheduler.queuedCount).toBeGreaterThan(0);
    });

    it("bounds the work when the condition never becomes true", async () => {
      const { scheduler, run } = setup();
      const steps: string[] = [];
      run(
        Effect.gen(function* () {
          steps.push("a");
          yield* Effect.yieldNow();
          steps.push("b");
        }),
      );

      scheduler.pause();
      await settle();

      const released = scheduler.releaseUntil(() => false, 2);
      expect(released).toBe(2);
    });

    it("reports when there is nothing to release", async () => {
      const { scheduler, run } = setup();
      run(Effect.succeed(1));
      await settle();

      scheduler.pause();
      expect(scheduler.releaseOne()).toBe(false);
    });

    it("resumes normal execution on play", async () => {
      const { scheduler, run } = setup();
      const steps: string[] = [];
      run(
        Effect.gen(function* () {
          steps.push("a");
          yield* Effect.yieldNow();
          steps.push("b");
          yield* Effect.yieldNow();
          steps.push("c");
        }),
      );

      scheduler.pause();
      await settle();

      scheduler.play();
      await vi.advanceTimersByTimeAsync(10);
      expect(steps).toEqual(["a", "b", "c"]);
      expect(scheduler.queuedCount).toBe(0);
    });

    it("holds concurrent fibers still", async () => {
      const { scheduler, run } = setup();
      const steps: string[] = [];
      const fiber = run(
        Effect.gen(function* () {
          // Joined, so the children must finish before the root does.
          const w1 = yield* Effect.fork(
            Effect.sync(() => steps.push("worker-1")),
          );
          const w2 = yield* Effect.fork(
            Effect.sync(() => steps.push("worker-2")),
          );
          yield* Fiber.join(w1);
          yield* Fiber.join(w2);
          steps.push("root");
        }),
      );

      scheduler.pause();
      await settle();
      const atPause = steps.length;

      await vi.advanceTimersByTimeAsync(10_000);
      expect(steps.length).toBe(atPause);

      scheduler.play();
      await vi.advanceTimersByTimeAsync(10);
      await Effect.runPromise(Fiber.join(fiber));
      expect(steps).toEqual(["worker-1", "worker-2", "root"]);
    });
  });

  describe("stuck detection", () => {
    it("has nothing pending once a program has finished", async () => {
      const { scheduler, virtual, run } = setup();
      const fiber = run(Effect.succeed(1));
      await vi.advanceTimersByTimeAsync(10);
      await Effect.runPromise(Fiber.join(fiber));

      expect(scheduler.pendingCount).toBe(0);
      expect(virtual.pendingCount).toBe(0);
    });

    /**
     * A sleeping program is not stuck: the scheduler has nothing, but the clock
     * does. Telling the two apart is what rung 2 of the step ladder needs.
     */
    it("distinguishes a sleeping program from a finished one", async () => {
      const { scheduler, virtual, run } = setup();
      run(Effect.sleep("10 seconds"));
      await vi.advanceTimersByTimeAsync(10);

      expect(scheduler.pendingCount).toBe(0);
      expect(virtual.pendingCount).toBe(1);
    });
  });

  describe("clear", () => {
    it("drops queued tasks", async () => {
      const { scheduler, run } = setup();
      run(
        Effect.gen(function* () {
          yield* Effect.yieldNow();
          yield* Effect.yieldNow();
        }),
      );

      scheduler.pause();
      await settle();
      expect(scheduler.queuedCount).toBeGreaterThan(0);

      scheduler.clear();
      expect(scheduler.queuedCount).toBe(0);
      expect(scheduler.releaseOne()).toBe(false);
    });
  });
});
