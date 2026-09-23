import { Effect, Fiber, FiberId } from "effect";
import { describe, expect, it } from "vitest";

import { makeVizTracer } from "@/runtime/vizTracer";
import type { TraceEvent } from "@/types/trace";

describe("makeVizTracer", () => {
  it("stamps a span's start and end with the fiber that entered it", async () => {
    const events: TraceEvent[] = [];
    const program = Effect.gen(function* () {
      const root = FiberId.threadName(yield* Effect.fiberId);
      yield* Effect.withSpan("on-root")(Effect.void);
      const child = yield* Effect.fork(
        Effect.withSpan("on-child")(Effect.yieldNow()),
      );
      yield* Fiber.join(child);
      return { root, child: FiberId.threadName(child.id()) };
    }).pipe(
      Effect.withTracer(
        makeVizTracer(
          (event) => events.push(event),
          () => 0,
        ),
      ),
    );

    const { root, child } = await Effect.runPromise(program);

    expect(events.map((e) => [e.type, e.fiberId])).toEqual([
      ["effect:start", root],
      ["effect:end", root],
      ["effect:start", child],
      ["effect:end", child],
    ]);
  });
});
