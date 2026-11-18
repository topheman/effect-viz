import { Effect, type Fiber, type Layer } from "effect";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import { type ProgramKey, makeLoggerLayer, programs } from "@/lib/programs";
import { GatedScheduler } from "@/runtime/gatedScheduler";
import { runProgramFork, withViz } from "@/runtime/runProgram";
import { Stepper, type StepOutcome } from "@/runtime/stepper";
import { VirtualClock, type VirtualClockHost } from "@/runtime/virtualClock";
import type { TraceEvent } from "@/types/trace";

const fakeHost: VirtualClockHost = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type AnyLayer = Layer.Layer<never, unknown, unknown>;

/**
 * The layers each run path installs around a program: the browser fallback
 * (`useEventHandlers`) adds a logger that writes to the panel, the WebContainer
 * runner (`RUNNER_JS` in services/webcontainer.ts) installs the program's own.
 */
const paths: Record<string, (key: ProgramKey) => AnyLayer[]> = {
  fallback: (key) => [
    ...(programs[key].requirements as ReadonlyArray<AnyLayer>),
    makeLoggerLayer(() => {}) as AnyLayer,
  ],
  runner: (key) => [...(programs[key].requirements as ReadonlyArray<AnyLayer>)],
};

/** Starts a program the way both run paths do: the gate is closed before the fork when `startPaused`. */
function start(key: ProgramKey, layers: AnyLayer[], startPaused: boolean) {
  const scheduler = new GatedScheduler();
  const clock = new VirtualClock({ rate: 1, origin: 0, host: fakeHost });
  const events: TraceEvent[] = [];
  let fiber: Fiber.Fiber<unknown, unknown> | null = null;
  const stepper = new Stepper({
    scheduler,
    clock,
    isFinished: () => fiber !== null && fiber.pollUnsafe() !== undefined,
  });
  const onEmit = (event: TraceEvent) => {
    events.push(event);
    stepper.noteEvent();
  };
  if (startPaused) stepper.pause();
  const started = runProgramFork(
    withViz(programs[key].rootEffect as Effect.Effect<unknown, unknown>, {
      onEmit,
      clock,
      scheduler,
      layers,
    }),
  );
  started.promise.catch(() => {});
  fiber = started.fiber;
  return { events, stepper };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

/**
 * A trace comparable across runs: timestamps zeroed, and fiber and span ids
 * renumbered in order of appearance, since each run draws fresh ones.
 */
function shape(events: TraceEvent[]) {
  const ids = new Map<string, string>();
  const id = (raw: string) => {
    if (!ids.has(raw)) ids.set(raw, `${ids.size}`);
    return ids.get(raw);
  };
  return events.map((event) => ({
    ...event,
    timestamp: 0,
    ...("fiberId" in event && { fiberId: id(event.fiberId) }),
    ...("parentId" in event &&
      event.parentId !== undefined && { parentId: id(event.parentId) }),
    ...("label" in event && event.type === "fiber:fork" && { label: "" }),
    ...("id" in event && { id: id(event.id) }),
  }));
}

const isSpan = (event: TraceEvent) =>
  event.type === "effect:start" || event.type === "effect:end";

describe.each(Object.keys(paths))("a run started paused, %s path", (path) => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(["basic", "loggerWithRequirements"] as const)(
    "%s: logs only the root's fork, then steps through what Play runs",
    async (key) => {
      const paused = start(key, paths[path](key), true);
      await settle();
      expect(shape(paused.events)).toEqual([
        { type: "fiber:fork", fiberId: "0", label: "", timestamp: 0 },
      ]);

      const outcomes: StepOutcome["_tag"][] = [];
      for (let i = 0; i < 200 && outcomes.at(-1) !== "finished"; i++) {
        const before = paused.events.length;
        outcomes.push(paused.stepper.step()._tag);
        await settle();
        const added = paused.events.slice(before);
        if (i === 0) {
          expect(added.map((event) => event.type)).toEqual(["effect:start"]);
        } else if (outcomes.at(-1) !== "finished") {
          expect(added.length).toBeGreaterThan(0);
        }
        expect(added.filter(isSpan).length).toBeLessThanOrEqual(1);
      }
      expect(outcomes.at(-1)).toBe("finished");

      const played = start(key, paths[path](key), false);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(shape(paused.events)).toEqual(shape(played.events));
    },
  );
});
