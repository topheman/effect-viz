import { Effect, Fiber, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GatedScheduler } from "@/runtime/gatedScheduler";
import { Stepper, type StepOutcome } from "@/runtime/stepper";
import { makeTraceEmitterLayer } from "@/runtime/tracedRunner";
import { VirtualClock, type VirtualClockHost } from "@/runtime/virtualClock";
import { makeVizClockLayer } from "@/runtime/vizClock";
import { makeVizLayers } from "@/runtime/vizSupervisor";
import { makeVizTracer } from "@/runtime/vizTracer";
import type { TraceEvent } from "@/types/trace";

const fakeHost: VirtualClockHost = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Wires the whole runtime together the way the app does. */
function setup() {
  const scheduler = new GatedScheduler();
  const clock = new VirtualClock({ rate: 1, origin: 0, host: fakeHost });
  const events: TraceEvent[] = [];
  let fiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;

  const stepper = new Stepper({
    scheduler,
    clock,
    isFinished: () => fiber !== null && fiber.unsafePoll() !== null,
  });

  const now = () => clock.now();
  const onEmit = (event: TraceEvent) => {
    events.push(event);
    stepper.noteEvent();
  };

  const run = (effect: Effect.Effect<unknown, unknown, never>) => {
    const layers = Layer.mergeAll(
      makeTraceEmitterLayer(onEmit),
      makeVizLayers(onEmit, now),
      Layer.setTracer(makeVizTracer(onEmit, now)),
      makeVizClockLayer(clock),
    );
    fiber = Effect.runFork(
      Effect.scoped(effect).pipe(
        Effect.withScheduler(scheduler),
        Effect.provide(layers),
      ) as Effect.Effect<unknown, unknown, never>,
    );
    return fiber;
  };

  return { scheduler, clock, stepper, events, run };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

/**
 * Steps until the program finishes or stops making progress.
 *
 * `settle()` between steps is required, not tidiness. Part of a fiber's
 * completion lands outside our scheduler and needs a full turn of the event loop
 * — a microtask alone is not enough. Without it the last step reports
 * `noProgress` for a program that has in fact finished.
 *
 * In the app this is free: every click is its own turn.
 */
async function stepToEnd(
  stepper: Stepper,
  limit = 200,
): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = [];
  for (let i = 0; i < limit; i++) {
    const outcome = stepper.step();
    outcomes.push(outcome);
    await settle();
    if (outcome._tag === "finished" || outcome._tag === "noProgress") break;
  }
  return outcomes;
}

describe("Stepper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rung 1: runnable work", () => {
    it("releases queued work and reports it", async () => {
      const { stepper, run } = setup();
      run(
        Effect.gen(function* () {
          yield* Effect.withSpan("one")(Effect.void);
          yield* Effect.yieldNow();
          yield* Effect.withSpan("two")(Effect.void);
          yield* Effect.yieldNow();
          yield* Effect.withSpan("three")(Effect.void);
        }),
      );
      stepper.pause();
      await settle();

      const before = stepper.eventCount;
      const outcome = stepper.step();

      expect(outcome._tag).toBe("released");
      expect(stepper.eventCount).toBeGreaterThan(before);
    });
  });

  describe("rung 2: time-blocked work", () => {
    /**
     * The whole reason the ladder consults two sources. Nothing is runnable —
     * the only fiber is asleep — so a step has to move virtual time before
     * anything can be released.
     */
    it("advances the clock when only a sleep is pending", async () => {
      const { stepper, clock, scheduler, run } = setup();
      run(Effect.sleep("1 second"));
      stepper.pause();
      await settle();

      // Drain whatever is runnable so only the sleep remains.
      while (scheduler.queuedCount > 0) stepper.step();

      expect(scheduler.queuedCount).toBe(0);
      expect(clock.pendingCount).toBe(1);

      const outcome = stepper.step();

      expect(outcome._tag).toBe("advancedClock");
      expect(clock.now()).toBe(1000);
    });

    it("steps a whole sleeping program to completion without wall time", async () => {
      const { stepper, run } = setup();
      const wallBefore = Date.now();
      const fiber = run(
        Effect.gen(function* () {
          yield* Effect.sleep("1 second");
          yield* Effect.sleep("2 seconds");
        }),
      );
      stepper.pause();
      await settle();

      const outcomes = await stepToEnd(stepper);

      expect(outcomes.at(-1)?._tag).toBe("finished");
      expect(outcomes.some((o) => o._tag === "advancedClock")).toBe(true);
      expect(fiber.unsafePoll()).not.toBeNull();
      expect(Date.now() - wallBefore).toBe(0);
    });
  });

  describe("rung 3: nothing can happen", () => {
    it("reports no progress for a program that can never continue", async () => {
      const { stepper, run } = setup();
      run(Effect.never);
      stepper.pause();
      await settle();

      const outcomes = await stepToEnd(stepper);
      expect(outcomes.at(-1)?._tag).toBe("noProgress");
    });

    it("does not offer a step when nothing can move", async () => {
      const { stepper, run } = setup();
      run(Effect.never);
      stepper.pause();
      await settle();

      await stepToEnd(stepper);
      expect(stepper.canStep()).toBe(false);
    });
  });

  describe("rung 4: finished", () => {
    it("reports finished once the program is done", async () => {
      const { stepper, run } = setup();
      run(Effect.succeed(1));
      stepper.pause();
      await settle();

      const outcomes = await stepToEnd(stepper);
      expect(outcomes.at(-1)?._tag).toBe("finished");
      expect(stepper.canStep()).toBe(false);
    });

    it("reaches finished for a program that fails", async () => {
      const { stepper, run } = setup();
      run(
        Effect.gen(function* () {
          yield* Effect.withSpan("doomed")(Effect.fail("boom"));
        }).pipe(Effect.catchAll(() => Effect.void)),
      );
      stepper.pause();
      await settle();

      const outcomes = await stepToEnd(stepper);
      expect(outcomes.at(-1)?._tag).toBe("finished");
    });
  });

  describe("interleaving fidelity", () => {
    /**
     * The property that justifies "never choose a fiber, only choose when to
     * stop": releasing in queue order reproduces the order the runtime would
     * have chosen by itself. If this failed, the stepper would be showing an
     * execution that never happens at full speed.
     */
    it("produces the same event order stepped as played", async () => {
      const program = Effect.gen(function* () {
        const a = yield* Effect.fork(
          Effect.withSpan("worker-a")(Effect.sleep("10 millis")),
        );
        const b = yield* Effect.fork(
          Effect.withSpan("worker-b")(Effect.sleep("20 millis")),
        );
        const c = yield* Effect.fork(
          Effect.withSpan("worker-c")(Effect.sleep("5 millis")),
        );
        yield* Fiber.join(a);
        yield* Fiber.join(b);
        yield* Fiber.join(c);
      });

      const played = setup();
      played.run(program);
      await vi.advanceTimersByTimeAsync(100);
      const playedOrder = played.events.map((e) => e.type);

      const stepped = setup();
      stepped.run(program);
      stepped.stepper.pause();
      await settle();
      await stepToEnd(stepped.stepper);
      const steppedOrder = stepped.events.map((e) => e.type);

      expect(steppedOrder).toEqual(playedOrder);
    });
  });

  describe("reset", () => {
    it("drops queued tasks and pending timers", async () => {
      const { stepper, scheduler, clock, run } = setup();
      run(Effect.sleep("1 second"));
      stepper.pause();
      await settle();

      stepper.reset();

      expect(scheduler.queuedCount).toBe(0);
      expect(clock.pendingCount).toBe(0);
      expect(stepper.eventCount).toBe(0);
    });
  });
});
