import { Effect, Fiber } from "effect";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import { GatedScheduler } from "@/runtime/gatedScheduler";
import { runProgramFork, withViz } from "@/runtime/runProgram";
import type { TraceEmitter } from "@/runtime/traceEmitter";
import { VirtualClock, type VirtualClockHost } from "@/runtime/virtualClock";
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
  const onEmit = (event: TraceEvent) => events.push(event);
  const { fiber, promise } = runProgramFork(
    withViz(effect, { onEmit, clock, scheduler: new GatedScheduler() }),
  );
  promise.catch(() => {});
  return { clock, events, fiber };
}

/** Runs to completion, advancing virtual time as far as any example needs. */
async function settle(fiber: Fiber.Fiber<unknown, unknown>) {
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

  it("boundedConcurrency: the caller forks one fiber per task, two alive at a time", async () => {
    const { events, fiber } = start(boundedConcurrencyExample);
    await settle(fiber);

    const [root, ...tasks] = events.filter((e) => e.type === "fiber:fork");
    expect(tasks).toHaveLength(5);
    expect(
      tasks.every(
        (f) => f.parentId === root.fiberId && f.forkedBy === root.fiberId,
      ),
    ).toBe(true);

    let alive = 0;
    let mostAlive = 0;
    for (const event of events) {
      if (event.type === "fiber:fork" && event.parentId !== undefined) alive++;
      if (event.type === "fiber:end" && event.fiberId !== root.fiberId) alive--;
      mostAlive = Math.max(mostAlive, alive);
    }
    expect(mostAlive).toBe(2);
  });

  it("interleaving: every fork is run by the fiber the child inherits from", async () => {
    const { events, fiber } = start(interleavingExample);
    await settle(fiber);

    const forks = events.filter((e) => e.type === "fiber:fork");
    expect(forks.length).toBeGreaterThan(0);
    expect(forks.every((f) => f.forkedBy === f.parentId)).toBe(true);
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

  it("timeout: the work that overruns the deadline reports its interruption as a span failure", async () => {
    const { events, fiber } = start(timeoutExample);
    await settle(fiber);

    // Spans carry their label on effect:start only, so pair the two by id.
    const labels = new Map(
      events
        .filter((event) => event.type === "effect:start")
        .map((event) => [event.id, event.label]),
    );
    const spans = events
      .filter((event) => event.type === "effect:end")
      .map((event) => ({
        label: labels.get(event.id),
        result: event.result,
        error: event.result === "failure" ? String(event.error) : "",
      }));

    expect(spans).toEqual([
      { label: "quick-task", result: "success", error: "" },
      {
        label: "slow-task",
        result: "failure",
        error: expect.stringContaining("interrupted"),
      },
    ]);
  });

  it("timeout: of the two fibers each deadline races, the loser exits interrupted", async () => {
    const { events, fiber } = start(timeoutExample);
    await settle(fiber);

    // Each withDeadline forks a pair: the work first, then the sleep that is the
    // deadline. Order the fibers by fork so the assertion does not name FiberIds.
    const forked = events
      .filter((event) => event.type === "fiber:fork")
      .filter((event) => event.parentId !== undefined)
      .map((event) => event.fiberId);
    const exits = forked.map(
      (fiberId) =>
        events.find(
          (event) =>
            (event.type === "fiber:end" || event.type === "fiber:interrupt") &&
            event.fiberId === fiberId,
        )?.type,
    );

    expect(exits).toEqual([
      // quick-task: the work wins, so its deadline is interrupted.
      "fiber:end",
      "fiber:interrupt",
      // slow-task: the deadline wins, so the work is interrupted.
      "fiber:interrupt",
      "fiber:end",
    ]);
  });

  it("deadlock: the program never finishes", async () => {
    const { fiber } = start(deadlockExample);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fiber.pollUnsafe()).toBeUndefined();
    await Effect.runPromise(Fiber.interrupt(fiber));
  });
});
