import { Context, Effect, Fiber, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { GatedScheduler } from "@/runtime/gatedScheduler";
import { runProgramFork, withViz } from "@/runtime/runProgram";
import { VirtualClock } from "@/runtime/virtualClock";
import { makeVizTracer } from "@/runtime/vizTracer";
import type { TraceEvent } from "@/types/trace";

/** Runs a program under the tracer and returns what it emitted, flushed. */
async function trace<A>(program: Effect.Effect<A>) {
  const events: TraceEvent[] = [];
  const tracer = makeVizTracer(
    (event) => events.push(event),
    () => 0,
  );
  const result = await Effect.runPromise(
    program.pipe(Effect.withTracer(tracer)),
  );
  // A suspend is held until the next event or a microtask.
  await Promise.resolve();
  return { events, result };
}

const lifecycle = (events: TraceEvent[]) =>
  events
    .filter((e) => e.type.startsWith("fiber:"))
    .map((e) =>
      e.type === "fiber:fork"
        ? [e.type, e.fiberId, e.parentId]
        : [e.type, e.fiberId],
    );

describe("makeVizTracer", () => {
  it("stamps a span's start and end with the fiber that entered it", async () => {
    const { events, result } = await trace(
      Effect.gen(function* () {
        const root = `#${yield* Effect.fiberId}`;
        yield* Effect.withSpan("on-root")(Effect.void);
        const child = yield* Effect.forkChild(
          Effect.withSpan("on-child")(Effect.yieldNow),
        );
        yield* Fiber.join(child);
        return { root, child: `#${child.id}` };
      }),
    );

    expect(
      events
        .filter((e) => e.type.startsWith("effect:"))
        .map((e) => [e.type, e.fiberId]),
    ).toEqual([
      ["effect:start", result.root],
      ["effect:end", result.root],
      ["effect:start", result.child],
      ["effect:end", result.child],
    ]);
  });

  // A forked fiber's first run is a resume, the way it is for the runtime.
  it("reports a fork, its suspends and its end", async () => {
    const { events, result } = await trace(
      Effect.gen(function* () {
        const child = yield* Effect.forkChild(Effect.yieldNow);
        yield* Fiber.join(child);
        return { root: `#${yield* Effect.fiberId}`, child: `#${child.id}` };
      }),
    );
    const { root, child } = result;

    expect(lifecycle(events)).toEqual([
      ["fiber:fork", root, undefined],
      ["fiber:fork", child, root],
      ["fiber:suspend", root],
      ["fiber:resume", child],
      ["fiber:suspend", child],
      ["fiber:resume", child],
      ["fiber:end", child],
      ["fiber:resume", root],
      ["fiber:end", root],
    ]);
  });

  it("ends a fiber that leaves children without a suspend", async () => {
    const { events, result } = await trace(
      Effect.gen(function* () {
        const child = yield* Effect.forkChild(
          Effect.forkChild(Effect.never).pipe(Effect.andThen(Effect.yieldNow)),
        );
        yield* Fiber.join(child);
        return `#${child.id}`;
      }),
    );

    expect(
      lifecycle(events)
        .filter(([, fiberId]) => fiberId === result)
        .map(([type]) => type),
    ).toEqual([
      "fiber:fork",
      "fiber:resume",
      "fiber:suspend",
      "fiber:resume",
      "fiber:end",
    ]);
  });

  it("parents an operator's later fibers to the fiber that runs it", async () => {
    const { events, result } = await trace(
      Effect.gen(function* () {
        const child = yield* Effect.forkChild(
          Effect.forEach([1, 2, 3], () => Effect.yieldNow, {
            concurrency: 2,
          }),
        );
        yield* Fiber.join(child);
        return `#${child.id}`;
      }),
    );

    const workers = lifecycle(events).filter(
      ([type, fiberId]) => type === "fiber:fork" && fiberId !== result,
    );
    expect(workers.map(([, , parentId]) => parentId)).toEqual([
      undefined,
      result,
      result,
      result,
    ]);
  });

  it("reports an interrupted fiber as interrupted", async () => {
    const { events, result } = await trace(
      Effect.gen(function* () {
        const child = yield* Effect.forkChild(Effect.never);
        yield* Fiber.interrupt(child);
        return `#${child.id}`;
      }),
    );

    expect(lifecycle(events)).toContainEqual(["fiber:interrupt", result]);
  });

  it("leaves out the fibers that build layers, not the program's", async () => {
    class Greeting extends Context.Service<Greeting, string>()("Greeting") {}
    const layer = Layer.effect(
      Greeting,
      Effect.forkChild(Effect.succeed("hi")).pipe(Effect.flatMap(Fiber.join)),
    );
    const events: TraceEvent[] = [];
    const { promise } = runProgramFork(
      withViz(
        Effect.service(Greeting).pipe(
          Effect.flatMap((greeting) =>
            Effect.forkChild(Effect.succeed(greeting)),
          ),
          Effect.flatMap(Fiber.join),
        ),
        {
          onEmit: (event) => events.push(event),
          clock: new VirtualClock({ rate: 1 }),
          scheduler: new GatedScheduler(),
          layers: [layer],
        },
      ),
    );
    await promise;

    // The root and the program's child.
    expect(
      lifecycle(events).filter(([type]) => type === "fiber:fork"),
    ).toHaveLength(2);
  });

  it("leaves out a layer's fiber started outside any fiber", async () => {
    class Greeting extends Context.Service<Greeting, string>()("Greeting") {}
    class Extra extends Context.Service<Extra, number>()("Extra") {}
    // A fiber started from a timer, with a Context no fiber has run with.
    const layer = Layer.effect(
      Greeting,
      Effect.context<never>().pipe(
        Effect.flatMap((context) =>
          Effect.callback<string>((resume) => {
            setTimeout(() => {
              Effect.runForkWith(Context.add(context, Extra, 1))(
                Effect.void,
              ).addObserver(() => resume(Effect.succeed("hi")));
            }, 0);
          }),
        ),
      ),
    );
    const events: TraceEvent[] = [];
    const { promise } = runProgramFork(
      withViz(Effect.service(Greeting), {
        onEmit: (event) => events.push(event),
        clock: new VirtualClock({ rate: 1 }),
        scheduler: new GatedScheduler(),
        layers: [layer],
      }),
    );
    await promise;

    expect(
      lifecycle(events).filter(([type]) => type === "fiber:fork"),
    ).toHaveLength(1);
  });
});
