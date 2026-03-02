import { Cause, Effect, Exit, Layer, Schedule, Scope } from "effect";

import { randomUUID } from "@/lib/crypto";
import {
  TraceEmitter,
  emitAcquire,
  emitEnd,
  emitFinalizer,
  emitRetry,
  emitStart,
} from "@/runtime/traceEmitter";
import type { TraceEvent } from "@/types/trace";

/** Convert error to a form that survives JSON serialization (e.g. WebContainer stdout). */
function errorForTrace(err: unknown): unknown {
  if (err instanceof Error) return { message: err.message, name: err.name };
  return err;
}

// ---
// Layer Implementation
// ---

/**
 * Create a TraceEmitter Layer that calls a callback function.
 * This bridges Effect's world with React's world.
 *
 * Usage:
 *   const layer = makeTraceEmitterLayer((event) => addEventToReactState(event));
 *   Effect.runPromise(program.pipe(Effect.provide(layer)));
 */
export const makeTraceEmitterLayer = (
  onEmit: (event: TraceEvent) => void,
): Layer.Layer<TraceEmitter> => {
  return Layer.succeed(TraceEmitter, {
    emit: (event) => Effect.sync(() => onEmit(event)),
  });
};

/**
 * Run an effect with retries and tracing.
 *
 * - Emits effect:start once (one span for the whole retry).
 * - On each failure before the last, emits retry:attempt (id, label, attempt, lastError).
 * - When the effect finally succeeds or exhausts retries, emits effect:end with the same id.
 *
 * Uses Schedule.driver to step through the schedule (like Effect.retry). The schedule
 * consumes the error and decides whether to continue (with optional delay) or stop.
 * We use a loop instead of Effect.retry so we can observe each attempt and emit retry:attempt.
 */
export function retryWithTrace<A, E, R, X, R2>(
  effect: Effect.Effect<A, E, R>,
  schedule: Schedule.Schedule<X, E, R2>,
  label: string,
): Effect.Effect<A, Cause.Cause<E>, R | R2 | TraceEmitter> {
  const id = randomUUID();
  return Effect.gen(function* () {
    yield* emitStart(id, label);
    const driver = yield* Schedule.driver(schedule);
    let attempt = 1;

    while (true) {
      const exit = yield* Effect.exit(effect);

      if (Exit.isSuccess(exit)) {
        yield* emitEnd(id, "success", exit.value);
        return exit.value;
      }

      const lastError = Cause.squash(exit.cause) as E;

      const nextExit = yield* Effect.exit(driver.next(lastError));
      if (Exit.isSuccess(nextExit)) {
        yield* emitRetry(id, label, attempt, errorForTrace(lastError));
        attempt++;
        continue;
      }

      yield* emitEnd(id, "failure", undefined, errorForTrace(lastError));
      return yield* Effect.fail(exit.cause);
    }
  });
}

// ---
// Finalizer Tracing
// ---

/**
 * Add a finalizer with tracing.
 *
 * - Emits finalizer event when the finalizer runs.
 * - Runs the user's finalizer.
 */
export function addFinalizerWithTrace<R>(
  finalizer: (
    exit: Exit.Exit<unknown, unknown>,
  ) => Effect.Effect<void, never, R>,
  label: string,
): Effect.Effect<void, never, TraceEmitter | Scope.Scope | R> {
  return Effect.gen(function* () {
    return yield* Effect.addFinalizer((exit) =>
      Effect.gen(function* () {
        const id = randomUUID();
        yield* emitFinalizer(id, label);
        yield* finalizer(exit);
      }),
    );
  });
}

/**
 * Effect.acquireRelease with tracing.
 * Based on addFinalizerWithTrace.
 */
export function acquireReleaseWithTrace<A, E, R, X, R2>(
  acquire: Effect.Effect<A, E, R>,
  release: (
    a: A,
    exit: Exit.Exit<unknown, unknown>,
  ) => Effect.Effect<X, never, R2>,
  label: string,
): Effect.Effect<A, E, TraceEmitter | Scope.Scope | R | R2> {
  return Effect.gen(function* () {
    const id = randomUUID();
    const resource = yield* acquire.pipe(
      Effect.onExit((exit) =>
        Exit.isSuccess(exit)
          ? emitAcquire(id, label, "success")
          : emitAcquire(
              id,
              label,
              "failure",
              errorForTrace(Cause.squash(exit.cause)),
            ),
      ),
    );
    yield* addFinalizerWithTrace(
      (exit) => Effect.asVoid(release(resource, exit)), // A finalizer callback returns Effect.Effect<void, never, R>, narrowing X to void
      `${label}:release`,
    );
    return resource;
  });
}
