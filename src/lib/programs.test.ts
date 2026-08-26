import { Effect, Fiber, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeTraceEmitterLayer } from "@/runtime/tracedRunner";
import type { TraceEmitter } from "@/runtime/traceEmitter";
import { VirtualClock, type VirtualClockHost } from "@/runtime/virtualClock";
import { makeVizClockLayer } from "@/runtime/vizClock";
import type { TraceEvent } from "@/types/trace";

import {
  boundedConcurrencyExample,
  deadlockExample,
  interleavingExample,
  structuredInterruptionExample,
  timeoutExample,
} from "./programs";

const fakeHost: VirtualClockHost = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Runs an example the way the app does, on a clock the test can advance. */
function start(effect: Effect.Effect<unknown, unknown, TraceEmitter>) {
  const events: TraceEvent[] = [];
  const clock = new VirtualClock({ rate: 1, origin: 0, host: fakeHost });
  const fiber = Effect.runFork(
    Effect.scoped(effect).pipe(
      Effect.provide(
        Layer.mergeAll(
          makeTraceEmitterLayer((event) => events.push(event)),
          makeVizClockLayer(clock),
        ),
      ),
    ) as Effect.Effect<unknown, unknown, never>,
  );
  return { clock, events, fiber };
}

/** Runs to completion, advancing virtual time as far as any example needs. */
async function settle(fiber: Fiber.RuntimeFiber<unknown, unknown>) {
  const done = Effect.runPromise(Fiber.join(fiber));
  await vi.advanceTimersByTimeAsync(10_000);
  return done;
}

describe("example programs", () => {
  let logged: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    logged = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(String(args[0]));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("interleaving: the two fibers alternate at every yield", async () => {
    const { fiber } = start(interleavingExample);
    await expect(settle(fiber)).resolves.toEqual(["A done", "B done"]);
    expect(logged).toEqual([
      "A step 1",
      "B step 1",
      "A step 2",
      "B step 2",
      "A step 3",
      "B step 3",
    ]);
  });

  it("boundedConcurrency: only two tasks are in flight at a time", async () => {
    const at: number[] = [];
    const { clock, fiber } = start(boundedConcurrencyExample);
    vi.mocked(console.log).mockImplementation((...args: unknown[]) => {
      logged.push(String(args[0]));
      at.push(clock.now());
    });

    await expect(settle(fiber)).resolves.toEqual([1, 2, 3, 4, 5]);
    // Three batches of 500ms rather than one: the limit, not the tasks, sets the pace.
    expect(at).toEqual([500, 500, 1000, 1000, 1500]);
  });

  it("structuredInterruption: children and their finalizers unwind with the parent", async () => {
    const { events, fiber } = start(structuredInterruptionExample);
    await expect(settle(fiber)).resolves.toBe(
      "parent and children interrupted",
    );

    const finalizers = events
      .filter((event) => event.type === "finalizer")
      .map((event) => event.label);
    expect(finalizers.sort()).toEqual([
      "child-1-cleanup",
      "child-2-cleanup",
      "parent-cleanup",
    ]);
  });

  it("timeout: the deadline interrupts only the work that overruns it", async () => {
    const { fiber } = start(timeoutExample);
    await expect(settle(fiber)).resolves.toEqual({
      quick: "quick-task finished",
      slow: "slow-task timed out",
    });
  });

  it("deadlock: the program never finishes", async () => {
    const { fiber } = start(deadlockExample);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fiber.unsafePoll()).toBeNull();
    await Effect.runPromise(Fiber.interrupt(fiber));
  });
});
