/**
 * Runs a program under the visualizer: one helper shared by the browser
 * fallback (`useEventHandlers`) and the WebContainer runner (`RUNNER_JS`), so
 * both install the same services in the same order.
 */
import { Cause, Clock, Effect, Exit, Layer, Scheduler, Tracer } from "effect";
import type { Fiber } from "effect";

import { InProgram } from "@/runtime/fiberLifecycle";
import type { GatedScheduler } from "@/runtime/gatedScheduler";
import { makeTraceEmitterLayer } from "@/runtime/tracedRunner";
import type { VirtualClock } from "@/runtime/virtualClock";
import { makeVizClock } from "@/runtime/vizClock";
import { makeVizTracer } from "@/runtime/vizTracer";
import type { TraceEvent } from "@/types/trace";

/** A layer of the user's program; its types are checked where it is written. */
type AnyLayer = Layer.Layer<never, unknown, unknown>;

export interface VizOptions {
  readonly onEmit: (event: TraceEvent) => void;
  readonly clock: VirtualClock;
  readonly scheduler: GatedScheduler;
  /** The program's requirements, each built with the ones before it available. */
  readonly layers?: ReadonlyArray<AnyLayer>;
}

export interface RunProgramForkResult<A> {
  /** The root fiber, for interruption and to tell when the program is done. */
  readonly fiber: Fiber.Fiber<A, unknown>;
  /** Resolves with the program's result, rejects with its squashed failure. */
  readonly promise: Promise<A>;
}

/**
 * Wraps a program in the visualizer's services: the trace emitter and the
 * program's own layers, then the virtual clock, the gated scheduler and, outermost,
 * the tracer.
 *
 * The tracer comes first so it sees the root fiber's first primitive, before any
 * layer is built: the root is the one fiber discovered with no parent. Fibers
 * forked while the layers are built run with `InProgram` off, and the tracer
 * leaves them out.
 */
export function withViz<A, E>(
  program: Effect.Effect<A, E, unknown>,
  { onEmit, clock, scheduler, layers = [] }: VizOptions,
): Effect.Effect<A, E> {
  const now = () => clock.now();
  const layer: AnyLayer = layers.reduce<AnyLayer>(
    (built, next) => Layer.provideMerge(next, built),
    makeTraceEmitterLayer(onEmit),
  );
  return Effect.scoped(program).pipe(
    Effect.provideService(InProgram, true),
    Effect.provide(layer),
    Effect.provideService(InProgram, false),
    Effect.provideService(
      Clock.Clock,
      makeVizClock(clock, (resume) => scheduler.wake(resume)),
    ),
    Effect.provideService(Scheduler.Scheduler, scheduler),
    Effect.provideService(Tracer.Tracer, makeVizTracer(onEmit, now)),
  ) as Effect.Effect<A, E>;
}

/** Forks a program and returns its fiber with a promise of its result. */
export function runProgramFork<A>(
  program: Effect.Effect<A, unknown>,
): RunProgramForkResult<A> {
  const fiber = Effect.runFork(program);
  const promise = new Promise<A>((resolve, reject) => {
    fiber.addObserver((exit) => {
      if (Exit.isSuccess(exit)) resolve(exit.value);
      else reject(Cause.squash(exit.cause));
    });
  });
  return { fiber, promise };
}
