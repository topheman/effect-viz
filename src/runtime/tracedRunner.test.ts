import { Effect, Fiber, FiberId, Schedule } from "effect";
import { describe, expect, it } from "vitest";

import {
  acquireReleaseWithTrace,
  addFinalizerWithTrace,
  makeTraceEmitterLayer,
  retryWithTrace,
} from "@/runtime/tracedRunner";
import type { TraceEvent } from "@/types/trace";

describe("traced helpers", () => {
  it("stamp their events with the fiber that ran them", async () => {
    const events: TraceEvent[] = [];
    let attempts = 0;
    const work = Effect.scoped(
      Effect.gen(function* () {
        yield* acquireReleaseWithTrace(Effect.void, () => Effect.void, "conn");
        yield* addFinalizerWithTrace(() => Effect.void, "cleanup");
        yield* retryWithTrace(
          Effect.suspend(() =>
            ++attempts < 2 ? Effect.fail("flaky") : Effect.void,
          ),
          Schedule.recurs(1),
          "flaky",
        );
      }),
    );
    const program = Effect.gen(function* () {
      const child = yield* Effect.fork(work);
      yield* Fiber.join(child);
      return FiberId.threadName(child.id());
    }).pipe(Effect.provide(makeTraceEmitterLayer((e) => events.push(e))));

    const child = await Effect.runPromise(program);

    expect(events.map((e) => [e.type, e.fiberId])).toEqual([
      ["acquire", child],
      ["effect:start", child],
      ["retry:attempt", child],
      ["effect:end", child],
      ["finalizer", child],
      ["finalizer", child],
    ]);
  });
});
