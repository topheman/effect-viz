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
import { runProgramFork, type VizOptions, withViz } from "@/runtime/runProgram";
import { VirtualClock, type VirtualClockHost } from "@/runtime/virtualClock";
import type { TraceEvent } from "@/types/trace";

import {
  boundedConcurrencyExample,
  deadlockExample,
  interleavingExample,
  programs,
  structuredInterruptionExample,
  timeoutExample,
} from "./programs";
import { traceChanges } from "./traceChanges";
import { hintText, traceHints } from "./traceHints";

const fakeHost: VirtualClockHost = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Runs an example the way the app does, on a clock the test can advance. */
function start(
  effect: Effect.Effect<unknown, unknown, unknown>,
  layers: VizOptions["layers"] = [],
) {
  const events: TraceEvent[] = [];
  const clock = new VirtualClock({ rate: 1, origin: 0, host: fakeHost });
  const onEmit = (event: TraceEvent) => events.push(event);
  const { fiber, promise } = runProgramFork(
    withViz(effect, {
      onEmit,
      clock,
      scheduler: new GatedScheduler(),
      layers,
    }),
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
    expect(tasks.every((f) => f.parentId === root.fiberId)).toBe(true);

    let alive = 0;
    let mostAlive = 0;
    for (const event of events) {
      if (event.type === "fiber:fork" && event.parentId !== undefined) alive++;
      if (event.type === "fiber:end" && event.fiberId !== root.fiberId) alive--;
      mostAlive = Math.max(mostAlive, alive);
    }
    expect(mostAlive).toBe(2);
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

  it("timeout: the work that overruns the deadline ends its span interrupted", async () => {
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
      .map((event) => ({ label: labels.get(event.id), result: event.result }));

    expect(spans).toEqual([
      { label: "quick-task", result: "success" },
      { label: "slow-task", result: "interrupted" },
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

/** Renames fibers `#1`, `#2`… in order of appearance, so a trace does not depend on the tests run before it. */
function renumberFibers(events: readonly TraceEvent[]): TraceEvent[] {
  const ids = new Map<string, string>();
  const id = (fiberId: string) => {
    if (!ids.has(fiberId)) ids.set(fiberId, `#${ids.size + 1}`);
    return ids.get(fiberId) ?? fiberId;
  };
  return events.map((event) =>
    event.type === "fiber:fork" && event.parentId
      ? { ...event, fiberId: id(event.fiberId), parentId: id(event.parentId) }
      : { ...event, fiberId: id(event.fiberId) },
  );
}

/**
 * An example's trace, renumbered, as the log shows it once the run settles.
 * Deadlock never ends, so it is read before stopping it adds rows; the app's
 * Reset clears the log rather than showing them.
 */
async function traceOf(program: (typeof programs)[keyof typeof programs]) {
  const { events, fiber } = start(program.rootEffect, program.requirements);
  await vi.advanceTimersByTimeAsync(10_000);
  const trace = renumberFibers(events);
  await Effect.runPromise(Fiber.interrupt(fiber));
  return trace;
}

/** Hints of every example, keyed by row number with nothing filtered. */
const expectedHints: Record<keyof typeof programs, Record<number, string>> = {
  basic: {
    4: "The fork only queues #2: it first runs at [8], once #1 yields.",
    5: "The fork only queues #3: it first runs at [11], once #2 yields.",
    8: "#1 gave up the thread, so the runtime ran #2, first in the queue. Indent is fiber depth, not identity: sibling fibers share a column.",
    11: "#2 gave up the thread, so the runtime ran #3, first in the queue.",
    13: "Async boundary: the fiber parks and frees the thread.",
    14: "Time the fiber spent parked.",
    17: "#2's end resumed #1, which was waiting on it.",
    20: "Async boundary: the fiber parks and frees the thread.",
    21: "Time the fiber spent parked.",
    24: "#3's end resumed #1, which was waiting on it.",
  },
  multiStep: {
    2: "The fork only queues #2: it first runs at [4], once #1 yields.",
    4: "#1 gave up the thread, so the runtime ran #2, first in the queue. Indent is fiber depth, not identity: sibling fibers share a column.",
    6: "Async boundary: the fiber parks and frees the thread.",
    7: "Time the fiber spent parked.",
    10: "Async boundary: the fiber parks and frees the thread.",
    11: "Time the fiber spent parked.",
    14: "Async boundary: the fiber parks and frees the thread.",
    15: "Time the fiber spent parked.",
    18: "#2's end resumed #1, which was waiting on it.",
  },
  nestedForks: {
    2: "The fork only queues #2: it first runs at [4], once #1 yields.",
    4: "#1 gave up the thread, so the runtime ran #2, first in the queue. Indent is fiber depth, not identity: sibling fibers share a column.",
    7: "The fork only queues #3: it first runs at [9], once #2 yields.",
    9: "#2 gave up the thread, so the runtime ran #3, first in the queue.",
    12: "The fork only queues #4: it first runs at [14], once #3 yields.",
    14: "#3 gave up the thread, so the runtime ran #4, first in the queue.",
    16: "Async boundary: the fiber parks and frees the thread.",
    17: "Time the fiber spent parked.",
    20: "#4's end resumed #3, which was waiting on it.",
    22: "#3's end resumed #2, which was waiting on it.",
    24: "#2's end resumed #1, which was waiting on it.",
  },
  interleaving: {
    2: "The fork only queues #2: it first runs at [5], once #1 yields.",
    3: "The fork only queues #3: it first runs at [9], once #2 yields.",
    5: "#1 gave up the thread, so the runtime ran #2, first in the queue. Indent is fiber depth, not identity: sibling fibers share a column.",
    9: "#2 gave up the thread, so the runtime ran #3, first in the queue.",
    13: "#3 gave up the thread, so the runtime ran #2, first in the queue.",
    17: "#2 gave up the thread, so the runtime ran #3, first in the queue.",
    21: "#3 gave up the thread, so the runtime ran #2, first in the queue.",
    25: "#2 gave up the thread, so the runtime ran #3, first in the queue.",
    29: "#3 gave up the thread, so the runtime ran #2, first in the queue.",
    31: "#2's end resumed #1, which was waiting on it.",
    33: "#1 gave up the thread, so the runtime ran #3, first in the queue.",
    35: "#3's end resumed #1, which was waiting on it.",
  },
  racing: {
    3: "#2 runs at once: this fork starts the child itself instead of queuing it. Indent is fiber depth, not identity: sibling fibers share a column.",
    5: "Async boundary: the fiber parks and frees the thread.",
    7: "#3 runs at once: this fork starts the child itself instead of queuing it.",
    9: "Async boundary: the fiber parks and frees the thread.",
    10: "Async boundary: the fiber parks and frees the thread.",
    11: "Time the fiber spent parked.",
    14: "#2's end resumed #1, which was waiting on it.",
    15: "Time the fiber spent parked.",
    16: "The runtime closed this span with an interruption: it neither succeeded nor failed. Its fiber #3 is interrupted at [17].",
    17: "#3 is interrupted before #1 ends.",
  },
  boundedConcurrency: {
    3: "#2 runs at once: this fork starts the child itself instead of queuing it. Indent is fiber depth, not identity: sibling fibers share a column.",
    5: "Async boundary: the fiber parks and frees the thread.",
    7: "#3 runs at once: this fork starts the child itself instead of queuing it.",
    9: "Async boundary: the fiber parks and frees the thread.",
    10: "Async boundary: the fiber parks and frees the thread.",
    11: "Time the fiber spent parked.",
    14: "#2 ending started the next task; #1 stays parked.",
    15: "#4 runs at once: this fork starts the child itself instead of queuing it.",
    17: "Async boundary: the fiber parks and frees the thread.",
    18: "Time the fiber spent parked.",
    21: "#3 ending started the next task; #1 stays parked.",
    22: "#5 runs at once: this fork starts the child itself instead of queuing it.",
    24: "Async boundary: the fiber parks and frees the thread.",
    25: "Time the fiber spent parked.",
    28: "#4 ending started the next task; #1 stays parked.",
    29: "#6 runs at once: this fork starts the child itself instead of queuing it.",
    31: "Async boundary: the fiber parks and frees the thread.",
    32: "Time the fiber spent parked.",
    35: "Time the fiber spent parked.",
    38: "#6's end resumed #1, which was waiting on it.",
  },
  structuredInterruption: {
    2: "The fork only queues #2: it first runs at [4], once #1 yields.",
    4: "#1 gave up the thread, so the runtime ran #2, first in the queue. Indent is fiber depth, not identity: sibling fibers share a column.",
    5: "The fork only queues #3: it first runs at [8], once #2 yields.",
    6: "The fork only queues #4: it first runs at [11], once #3 yields.",
    8: "#2 gave up the thread, so the runtime ran #3, first in the queue.",
    11: "#3 gave up the thread, so the runtime ran #4, first in the queue.",
    13: "Async boundary: the fiber parks and frees the thread.",
    14: "Time the fiber spent parked.",
    15: "Time the fiber spent parked.",
    16: "Interruption still closes the scope, so the finalizer runs.",
    17: "Time the fiber spent parked.",
    18: "The runtime closed this span with an interruption: it neither succeeded nor failed. Its fiber #3 is interrupted at [20].",
    19: "Interruption still closes the scope, so the finalizer runs.",
    20: "#3 is interrupted before #2 ends.",
    21: "Time the fiber spent parked.",
    22: "The runtime closed this span with an interruption: it neither succeeded nor failed. Its fiber #4 is interrupted at [24].",
    23: "Interruption still closes the scope, so the finalizer runs.",
    24: "#4 is interrupted before #2 ends.",
    25: "#2 is interrupted before #1 ends.",
  },
  failureAndRecovery: {
    5: "The failure was handled: the fiber carries on.",
  },
  retry: {
    3: "The fiber gave up the thread and got it back at [4], in the same instant: nothing else was ready to run.",
    5: "The schedule's delay is over: the next attempt starts here.",
    6: "The fiber gave up the thread and got it back at [7], in the same instant: nothing else was ready to run.",
    8: "The schedule's delay is over: the next attempt starts here.",
  },
  retryExponentialBackoff: {
    3: "Async boundary: the fiber parks and frees the thread.",
    4: "Time the fiber spent parked.",
    5: "The schedule's delay is over: the next attempt starts here.",
    6: "Async boundary: the fiber parks and frees the thread.",
    7: "Time the fiber spent parked.",
    8: "The schedule's delay is over: the next attempt starts here.",
    9: "Async boundary: the fiber parks and frees the thread.",
    10: "Time the fiber spent parked.",
    11: "The schedule's delay is over: the next attempt starts here.",
    12: "Async boundary: the fiber parks and frees the thread.",
    13: "Time the fiber spent parked.",
    14: "The schedule's delay is over: the next attempt starts here.",
  },
  timeout: {
    3: "#2 runs at once: this fork starts the child itself instead of queuing it. Indent is fiber depth, not identity: sibling fibers share a column.",
    5: "Async boundary: the fiber parks and frees the thread.",
    7: "#3 runs at once: this fork starts the child itself instead of queuing it.",
    8: "Async boundary: the fiber parks and frees the thread.",
    9: "Async boundary: the fiber parks and frees the thread.",
    10: "Time the fiber spent parked.",
    13: "#2's end resumed #1, which was waiting on it.",
    14: "Time the fiber spent parked.",
    15: "#1 interrupts its child #3 before moving on.",
    17: "#4 runs at once: this fork starts the child itself instead of queuing it.",
    19: "Async boundary: the fiber parks and frees the thread.",
    21: "#5 runs at once: this fork starts the child itself instead of queuing it.",
    22: "Async boundary: the fiber parks and frees the thread.",
    23: "Async boundary: the fiber parks and frees the thread.",
    24: "Time the fiber spent parked.",
    26: "#5's end resumed #1, which was waiting on it.",
    27: "Time the fiber spent parked.",
    28: "The runtime closed this span with an interruption: it neither succeeded nor failed. Its fiber #4 is interrupted at [29].",
    29: "#4 is interrupted before #1 ends.",
  },
  basicFinalizers: {
    6: "Finalizers run in reverse order of registration.",
    7: "Finalizers run in reverse order of registration.",
    8: "Finalizers run in reverse order of registration.",
  },
  acquireRelease: {},
  loggerWithRequirements: {},
  deadlock: {
    2: "The fork only queues #2: it first runs at [5], once #1 yields.",
    3: "The fork only queues #3: it first runs at [8], once #2 yields.",
    5: "#1 gave up the thread, so the runtime ran #2, first in the queue. Indent is fiber depth, not identity: sibling fibers share a column.",
    8: "#2 gave up the thread, so the runtime ran #3, first in the queue.",
    10: "Async boundary: the fiber parks and frees the thread.",
  },
};

describe("example program hints", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(Object.entries(programs))("%s", async (name, program) => {
    const trace = await traceOf(program);
    const hints = traceHints(trace, { indentByFiber: true });
    const texts = Object.fromEntries(
      [...hints].map(([index, row]) => [
        index + 1,
        hintText(row, (ref) => ref + 1),
      ]),
    );
    expect(texts).toEqual(expectedHints[name as keyof typeof programs]);
  });
});

/** Effect 3 → 4 changes of every example, with rows numbered from 1. */
const expectedChanges: Record<
  keyof typeof programs,
  { kind: string; rows: number[] }[]
> = {
  basic: [],
  multiStep: [],
  nestedForks: [],
  interleaving: [
    {
      kind: "joiner-runs-first",
      rows: [30, 31, 33],
    },
  ],
  racing: [
    {
      kind: "fork-runs-at-once",
      rows: [2, 3, 6, 7],
    },
    { kind: "synchronous-interruption", rows: [15, 17] },
  ],
  boundedConcurrency: [
    {
      kind: "fork-runs-at-once",
      rows: [2, 3, 6, 7, 14, 15, 21, 22, 28, 29],
    },
    {
      kind: "fiber-per-element",
      rows: [13, 14, 20, 21, 27, 28],
    },
  ],
  structuredInterruption: [
    {
      kind: "synchronous-interruption",
      rows: [15, 17, 20, 21, 24, 25],
    },
  ],
  failureAndRecovery: [],
  retry: [{ kind: "zero-sleep-retry", rows: [3, 4, 6, 7] }],
  retryExponentialBackoff: [],
  timeout: [
    {
      kind: "fork-runs-at-once",
      rows: [2, 3, 6, 7, 16, 17, 20, 21],
    },
    {
      kind: "synchronous-interruption",
      rows: [14, 15, 27, 29],
    },
  ],
  basicFinalizers: [],
  acquireRelease: [],
  loggerWithRequirements: [],
  // Its only interruption comes from stopping the run, whose rows Reset clears.
  deadlock: [],
};

describe("example program changes from Effect 3", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(Object.entries(programs))("%s", async (name, program) => {
    const changes = traceChanges(await traceOf(program)).map((change) => ({
      ...change,
      rows: change.rows.map((index) => index + 1),
    }));
    expect(changes).toEqual(expectedChanges[name as keyof typeof programs]);
  });
});
