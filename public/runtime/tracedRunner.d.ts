import { Cause, Duration, Effect, Exit, Fiber, Layer, Scope } from "effect";

import { TraceEmitter } from "@/runtime/traceEmitter";
import type { TraceEvent } from "@/types/trace";
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
export declare const withTrace: <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  label: string,
) => Effect.Effect<A, E, R | TraceEmitter>;
/**
 * Create a TraceEmitter Layer that calls a callback function.
 * This bridges Effect's world with React's world.
 *
 * Usage:
 *   const layer = makeTraceEmitterLayer((event) => addEventToReactState(event));
 *   Effect.runPromise(program.pipe(Effect.provide(layer)));
 */
export declare const makeTraceEmitterLayer: (
  onEmit: (event: TraceEvent) => void,
) => Layer.Layer<TraceEmitter>;
/**
 * Fork an effect and emit fiber lifecycle events.
 * Uses Effect's real FiberId for accurate parent-child tracking.
 */
export declare const forkWithTrace: <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  label: string,
) => Effect.Effect<Fiber.RuntimeFiber<A, E>, never, R | TraceEmitter>;
/**
 * Run a program and emit fiber events for the root fiber.
 * This creates the "main" fiber that child fibers will reference as parent.
 */
export declare const runProgramWithTrace: <A, E, R>(
  program: Effect.Effect<A, E, R>,
  label: string,
) => Effect.Effect<A, E, R | TraceEmitter>;
/**
 * Sleep with tracing - emits sleep:start and sleep:end events.
 * Makes fiber suspension visible in the visualizer.
 *
 * When a fiber sleeps, it SUSPENDS (yields control) rather than blocking.
 * This function emits events so we can visualize when fibers are suspended.
 */
export declare const sleepWithTrace: (
  duration: Duration.DurationInput,
) => Effect.Effect<void, never, TraceEmitter>;
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
export declare function retryWithTrace<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: {
    maxRetries: number;
    label: string;
  },
): Effect.Effect<A, Cause.Cause<E>, R | TraceEmitter>;
/**
 * Add a finalizer with tracing.
 *
 * - Emits finalizer event when the finalizer runs.
 * - Runs the user's finalizer.
 */
export declare function addFinalizerWithTrace<R>(
  finalizer: (
    exit: Exit.Exit<unknown, unknown>,
  ) => Effect.Effect<void, never, R>,
  label: string,
): Effect.Effect<void, never, TraceEmitter | Scope.Scope | R>;
/**
 * Effect.acquireRelease with tracing.
 * Based on addFinalizerWithTrace.
 */
export declare function acquireReleaseWithTrace<A, E, R, X, R2>(
  acquire: Effect.Effect<A, E, R>,
  release: (
    a: A,
    exit: Exit.Exit<unknown, unknown>,
  ) => Effect.Effect<X, never, R2>,
  label: string,
): Effect.Effect<A, E, TraceEmitter | Scope.Scope | R | R2>;
