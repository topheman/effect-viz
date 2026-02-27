import { Cause, Duration, Effect, Exit, FiberId, Layer, Scope } from "effect";

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

// ---
// Traced Runner
// ---

/**
 * Wrap an effect to emit trace events before and after execution.
 *
 * This returns a NEW effect that:
 * 1. Emits effect:start
 * 2. Runs the original effect
 * 3. Emits effect:end (success or failure)
 * 4. Returns the result
 *
 * Notice: The returned effect requires TraceEmitter in its R channel!
 */
export const withTrace = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  label: string,
): Effect.Effect<A, E, R | TraceEmitter> => {
  const id = randomUUID();
  return Effect.gen(function* () {
    yield* emitStart(id, label);

    return yield* effect.pipe(
      Effect.onExit((exit) =>
        Exit.isSuccess(exit)
          ? emitEnd(id, "success", exit.value)
          : emitEnd(id, "failure", undefined, Cause.squash(exit.cause)),
      ),
    );
  });
};

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

// ---
// Sleep Tracing (Phase 3)
// ---

/**
 * Sleep with tracing - emits sleep:start and sleep:end events.
 * Makes fiber suspension visible in the visualizer.
 *
 * When a fiber sleeps, it SUSPENDS (yields control) rather than blocking.
 * This function emits events so we can visualize when fibers are suspended.
 */
export const sleepWithTrace = (
  duration: Duration.DurationInput,
): Effect.Effect<void, never, TraceEmitter> => {
  return Effect.gen(function* () {
    const { emit } = yield* TraceEmitter;
    const currentFiberId = yield* Effect.fiberId;
    const fiberId = FiberId.threadName(currentFiberId);
    const durationMillis = Duration.toMillis(Duration.decode(duration));
    yield* emit({
      type: "sleep:start",
      fiberId,
      duration: durationMillis,
      timestamp: Date.now(),
    });
    yield* Effect.sleep(duration);
    yield* emit({
      type: "sleep:end",
      fiberId,
      timestamp: Date.now(),
    });
  });
};

/**
 * Run an effect with retries and tracing.
 *
 * - Emits effect:start once (one span for the whole retry).
 * - On each failure before the last, emits retry:attempt (id, label, attempt, lastError).
 * - When the effect finally succeeds or exhausts retries, emits effect:end with the same id.
 *
 * Semantics: total attempts = 1 + maxRetries (one initial try plus up to maxRetries retries).
 * So maxRetries: 3 ⇒ at most 4 attempts.
 *
 * We use a loop instead of Effect.retry so we can observe each attempt and emit retry:attempt.
 * Effect.retry runs the effect internally and only gives us one final Exit—no per-attempt callback.
 */
export function retryWithTrace<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: {
    maxRetries: number;
    label: string;
  },
): Effect.Effect<A, Cause.Cause<E>, R | TraceEmitter> {
  const id = randomUUID();
  return Effect.gen(function* () {
    yield* emitStart(id, options.label);

    let attempt = 1;
    const maxAttempts = 1 + options.maxRetries;

    while (true) {
      const exit = yield* Effect.exit(effect);

      if (Exit.isSuccess(exit)) {
        yield* emitEnd(id, "success", exit.value);
        return exit.value;
      }

      const lastError = Cause.squash(exit.cause);

      if (attempt >= maxAttempts) {
        yield* emitEnd(id, "failure", undefined, lastError);
        return yield* Effect.fail(exit.cause);
      }

      yield* emitRetry(id, options.label, attempt, lastError);
      attempt++;
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
          : emitAcquire(id, label, "failure", Cause.squash(exit.cause)),
      ),
    );
    yield* addFinalizerWithTrace(
      (exit) => Effect.asVoid(release(resource, exit)), // A finalizer callback returns Effect.Effect<void, never, R>, narrowing X to void
      `${label}:release`,
    );
    return resource;
  });
}
